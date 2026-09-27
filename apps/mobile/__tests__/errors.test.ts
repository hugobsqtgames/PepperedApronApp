import { ApiError, NetworkError } from '@pepperedapron/client';
import { errorMessage, isEmail } from '../src/lib/errors';

const t = ((key: string) => key) as never;

describe('errorMessage', () => {
  it('never leaks technical details', () => {
    expect(errorMessage(new Error('ECONNRESET at socket 0x1f'), t)).toBe('errors.generic');
    expect(errorMessage('boom', t)).toBe('errors.generic');
  });

  it('maps transport and HTTP failures to friendly keys', () => {
    expect(errorMessage(new NetworkError('offline'), t)).toBe('errors.network');
    expect(errorMessage(new ApiError(503, 'internal', 'x'), t)).toBe('errors.server_unavailable');
    expect(errorMessage(new ApiError(429, 'rate_limited', 'x'), t)).toBe('errors.rate_limited');
    expect(errorMessage(new ApiError(401, 'invalid_credentials', 'x'), t)).toBe(
      'errors.invalid_credentials',
    );
    expect(errorMessage(new ApiError(404, 'something_else', 'x'), t)).toBe('errors.not_found');
  });
});

describe('isEmail', () => {
  it.each([
    ['chef@example.com', true],
    ['  chef@example.fr ', true],
    ['chef@example', false],
    ['chef example.com', false],
    ['', false],
  ])('%s → %s', (input, expected) => {
    expect(isEmail(input)).toBe(expected);
  });
});
