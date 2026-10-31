/* The queue logic with the import steps replaced: what is saved, skipped, paused or retried. */
const mockMeta = new Map<string, string>();
jest.mock('../src/services/runtime', () => ({
  runtime: {
    session: {
      store: {
        meta: async (k: string) => mockMeta.get(k) ?? null,
        setMeta: async (k: string, v: string) => void mockMeta.set(k, v),
      },
    },
  },
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc' },
  Directory: class {
    exists = true;
    create() {}
  },
  File: class {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = parts.map(String).join('/');
    }
    async copy() {}
    delete() {}
  },
}));
const mockPrepare = jest.fn();
const mockSave = jest.fn();
jest.mock('../src/services/autoImport', () => ({
  prepareImport: (...a: unknown[]) => mockPrepare(...a),
  saveImport: (...a: unknown[]) => mockSave(...a),
}));

type Queue = typeof import('../src/services/importQueue').importQueue;
let importQueue: Queue;

const link = (url: string) => ({
  source: { kind: 'link' as const, url, text: null, title: null },
});
const prepared = (notice: string, offline = false) => ({
  draft: {},
  notice,
  localImageUri: null,
  platform: 'instagram',
  offline,
});
const settle = async () => {
  for (let i = 0; i < 20; i++) await jest.advanceTimersByTimeAsync(5000);
};

beforeEach(() => {
  jest.useFakeTimers();
  mockPrepare.mockReset();
  mockSave.mockReset();
  mockMeta.clear();
  // A fresh queue for each test (it is a singleton in the app).
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    importQueue = (require('../src/services/importQueue') as { importQueue: Queue }).importQueue;
  });
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('import queue', () => {
  it('saves each shared recipe, and reports the ones already saved', async () => {
    mockPrepare.mockResolvedValue(prepared('partial'));
    mockSave
      .mockResolvedValueOnce({ recipeId: 'r1', title: 'Pâtes', duplicate: null })
      .mockResolvedValueOnce({
        recipeId: 'r0',
        title: 'Tarte',
        duplicate: { id: 'r0', reason: 'link' },
      });
    await importQueue.add(
      [link('https://www.instagram.com/p/A/'), link('https://www.instagram.com/p/B/')],
      {
        batch: true,
      },
    );
    await settle();
    expect(importQueue.snapshot.jobs.map((j) => [j.status, j.recipeId, j.title])).toEqual([
      ['done', 'r1', 'Pâtes'],
      ['duplicate', 'r0', 'Tarte'],
    ]);
    // Kept across restarts in the local database.
    expect(JSON.parse(mockMeta.get('import_queue')!).jobs).toHaveLength(2);
  });

  it('in a bulk import, pauses when Instagram stops giving captions instead of saving bare links', async () => {
    mockPrepare.mockResolvedValue(prepared('instagram'));
    await importQueue.add([link('https://www.instagram.com/p/C/')], { batch: true });
    await jest.advanceTimersByTimeAsync(100);
    expect(mockSave).not.toHaveBeenCalled();
    expect(importQueue.snapshot.pauseReason).toBe('blocked');
    expect(importQueue.snapshot.jobs[0]).toMatchObject({ status: 'pending', error: 'blocked' });
    // After the pause it is tried again; three refusals and it is given up.
    for (let i = 0; i < 3; i++) await jest.advanceTimersByTimeAsync(16 * 60_000);
    expect(importQueue.snapshot.jobs[0]).toMatchObject({ status: 'failed', error: 'blocked' });
  });

  it('a single shared post is saved even without its caption (the link is kept)', async () => {
    mockPrepare.mockResolvedValue(prepared('instagram'));
    mockSave.mockResolvedValue({ recipeId: 'r2', title: 'Recette Instagram', duplicate: null });
    await importQueue.add([link('https://www.instagram.com/p/D/')]);
    await settle();
    expect(importQueue.snapshot.jobs[0]).toMatchObject({ status: 'done', notice: 'instagram' });
  });

  it('offline: nothing is saved, the import waits for the network', async () => {
    mockPrepare.mockResolvedValueOnce(prepared('minimal', true));
    mockPrepare.mockResolvedValueOnce(prepared('partial'));
    mockSave.mockResolvedValue({ recipeId: 'r3', title: 'Soupe', duplicate: null });
    await importQueue.add([link('https://example.com/soupe')]);
    await jest.advanceTimersByTimeAsync(100);
    expect(importQueue.snapshot).toMatchObject({ pauseReason: 'offline' });
    expect(mockSave).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(61_000);
    await settle();
    expect(importQueue.snapshot.jobs[0]).toMatchObject({ status: 'done', recipeId: 'r3' });
  });

  it('"save anyway" adds a recipe that looked like a duplicate', async () => {
    mockPrepare.mockResolvedValue(prepared('partial'));
    mockSave
      .mockResolvedValueOnce({
        recipeId: 'r0',
        title: 'Tarte',
        duplicate: { id: 'r0', reason: 'similar' },
      })
      .mockResolvedValueOnce({ recipeId: 'r9', title: 'Tarte', duplicate: null });
    const [id] = await importQueue.add([link('https://example.com/tarte')]);
    await settle();
    await importQueue.saveAnyway(id!);
    await settle();
    expect(mockSave.mock.calls[1]![1]).toMatchObject({ force: true });
    expect(importQueue.snapshot.jobs[0]).toMatchObject({ status: 'done', recipeId: 'r9' });
  });
});

describe('regression: shared twice, or an import that never ends', () => {
  it('the same link shared twice (start + coming forward) is imported once', async () => {
    mockPrepare.mockResolvedValue(prepared('partial'));
    mockSave.mockResolvedValue({ recipeId: 'r1', title: 'Pâtes', duplicate: null });
    const [a] = await importQueue.add([link('https://www.instagram.com/p/SAME/')]);
    const [b] = await importQueue.add([link('https://www.instagram.com/p/SAME/')]);
    expect(b).toBe(a);
    await settle();
    expect(importQueue.snapshot.jobs).toHaveLength(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('an import that never finishes does not leave the next ones waiting forever', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockPrepare
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValue(prepared('partial'));
    mockSave.mockResolvedValue({ recipeId: 'r2', title: 'Soupe', duplicate: null });
    const [stuck] = await importQueue.add([link('https://example.com/stuck')]);
    const [next] = await importQueue.add([link('https://example.com/next')]);
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await settle();
    const jobs = importQueue.snapshot.jobs;
    expect(jobs.find((j) => j.id === next)).toMatchObject({ status: 'done', recipeId: 'r2' });
    // The stuck one was tried again (then saved).
    expect(jobs.find((j) => j.id === stuck)!.attempts).toBeGreaterThanOrEqual(2);
  });
});

describe('regression: a damaged saved queue does not stop the imports', () => {
  it.each([
    'null',
    '42',
    '{"jobs":"x"}',
    '{"jobs":[null,{"id":1},{"id":"a"}]}',
    '{"jobs":[{"id":"b","source":{"kind":"link","url":"https://x.fr","text":null,"title":null},"status":"running"}]',
  ])('saved state %s', async (raw) => {
    mockMeta.set('import_queue', raw);
    mockPrepare.mockResolvedValue(prepared('partial'));
    mockSave.mockResolvedValue({ recipeId: 'r1', title: 'Pâtes', duplicate: null });
    await importQueue.add([link('https://www.instagram.com/p/A/')]);
    await settle();
    const jobs = importQueue.snapshot.jobs;
    expect(jobs.every((j) => typeof j.id === 'string' && j.source)).toBe(true);
    expect(jobs.some((j) => j.status === 'done' && j.recipeId === 'r1')).toBe(true);
  });
});

describe('stress: many imports with random outcomes', () => {
  const N = process.env.STRESS ? 1500 : 300;
  it(`${N} shared links: each ends saved, recognised or failed, never saved twice`, async () => {
    const { rng } = jest.requireActual<typeof import('../../../packages/core/src/fuzz/rng')>(
      '../../../packages/core/src/fuzz/rng',
    );
    const r = rng(440_000);
    const saved = new Map<string, number>();
    mockPrepare.mockImplementation(async () => {
      const p = r.int(0, 9);
      if (p === 0) throw new Error('network');
      if (p === 1) return prepared('minimal', r.bool(0.3));
      return prepared(r.pick(['full', 'partial', 'text', 'speech']));
    });
    mockSave.mockImplementation(async (p: unknown, opts: { force?: boolean }) => {
      if (r.bool(0.05)) throw new Error('disk');
      const id = `r${r.int(0, 10_000)}`;
      saved.set(id, (saved.get(id) ?? 0) + 1);
      return r.bool(0.15) && !opts?.force
        ? { recipeId: id, title: 'Déjà', duplicate: { id, reason: 'link' } }
        : { recipeId: id, title: 'Nouvelle', duplicate: null };
    });
    // All at once, like an Instagram export.
    const ids = await importQueue.add(
      Array.from({ length: N }, (_, i) => link(`https://example.com/r${i}`)),
      { batch: true },
    );
    // While imports run, nothing is dropped: the progress stays consistent.
    let maxSeen = 0;
    for (let i = 0; i < 400; i++) {
      await jest.advanceTimersByTimeAsync(60_000);
      const st = importQueue.snapshot.jobs;
      if (st.some((j) => j.status === 'pending' || j.status === 'running'))
        expect(st.filter((j) => ids.includes(j.id))).toHaveLength(N);
      maxSeen = Math.max(maxSeen, st.length);
    }
    expect(maxSeen).toBe(N);
    const jobs = importQueue.snapshot.jobs.filter((j) => ids.includes(j.id));
    // Once everything is over, only the 300 most recent finished imports are kept (the recipes
    // themselves are saved); failed ones always stay, to be retried.
    const failed = jobs.filter((j) => j.status === 'failed').length;
    expect(jobs.length).toBe(Math.min(N, 300 + failed));
    for (const j of jobs) {
      expect(['done', 'duplicate', 'failed']).toContain(j.status);
      if (j.status !== 'failed') expect(j.recipeId).toBeTruthy();
    }
    // Never more save attempts than allowed per import (3).
    expect(mockSave.mock.calls.length).toBeLessThanOrEqual(N * 3);
    console.info(`QA-COUNT mobile.importqueue.jobs ${N}`);
  }, 3_600_000);
});
