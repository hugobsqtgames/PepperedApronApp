import { ImportFormatError, ValidationError } from '@pepperedapron/client';
import { errorMessage } from '../src/lib/errors';

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
