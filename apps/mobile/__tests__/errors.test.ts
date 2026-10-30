import { ImportFormatError, ValidationError } from '@pepperedapron/client';
import { errorMessage, inBackground } from '../src/lib/errors';

const t = ((key: string) => key) as never;

describe('errorMessage', () => {
  it('never leaks technical details', () => {
    expect(errorMessage(new Error('ECONNRESET at socket 0x1f'), t)).toBe('errors.generic');
    expect(errorMessage('boom', t)).toBe('errors.generic');
  });

  it('maps validation, backup and storage failures to friendly keys', () => {
    expect(errorMessage(new ValidationError([{ path: 'title', code: 'too_small' }]), t)).toBe(
      'errors.titleRequired',
    );
    expect(errorMessage(new ValidationError([{ path: 'servings', code: 'too_big' }]), t)).toBe(
      'errors.servingsInvalid',
    );
    expect(errorMessage(new ValidationError([{ path: 'x', code: 'y' }]), t)).toBe(
      'errors.invalidField',
    );
    expect(errorMessage(new ImportFormatError(), t)).toBe('settings.importInvalid');
    expect(errorMessage(new Error('not_found'), t)).toBe('errors.not_found');
    expect(errorMessage(new Error('database or disk is full (SQLITE_FULL)'), t)).toBe(
      'errors.storageFull',
    );
  });
});

describe('regression: a tap on something deleted meanwhile (found by the navigation stress)', () => {
  it('an item gone (deleted on another device) is silently skipped, other failures are logged', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      inBackground(Promise.reject(new Error('not_found')));
      inBackground(Promise.reject(new Error('disk')));
      inBackground(Promise.resolve(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('[action] failed', 'disk');
    } finally {
      warn.mockRestore();
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
