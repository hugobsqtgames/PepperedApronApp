import type { z } from 'zod';
import { AppError } from './errors';

export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError(400, 'validation_error', 'validation_error', r.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message })));
  }
  return r.data;
}
