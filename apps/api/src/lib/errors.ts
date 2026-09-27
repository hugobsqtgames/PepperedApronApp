/**
 * Errors returned to clients carry a stable machine code; the app maps codes to translated,
 * human-friendly messages. Technical details are only logged server-side.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export const badRequest = (code = 'bad_request', details?: unknown) => new AppError(400, code, code, details);
export const unauthorized = (code = 'unauthorized') => new AppError(401, code);
export const forbidden = (code = 'forbidden') => new AppError(403, code);
export const notFound = (code = 'not_found') => new AppError(404, code);
export const conflict = (code = 'conflict') => new AppError(409, code);
export const tooMany = (code = 'rate_limited') => new AppError(429, code);
