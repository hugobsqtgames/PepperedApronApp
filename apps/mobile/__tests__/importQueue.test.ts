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
