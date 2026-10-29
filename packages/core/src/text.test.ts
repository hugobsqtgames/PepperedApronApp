import { describe, expect, it } from 'vitest';
import { ingredientKey, singularize } from './text';

describe('singularize', () => {
  it('handles French plurals in -eaux and -aux', () => {
    expect(singularize('poireaux')).toBe('poireau');
    expect(singularize('gateaux')).toBe('gateau');
    expect(singularize('chevaux')).toBe('cheval');
    expect(ingredientKey('Poireaux')).toBe(ingredientKey('poireau'));
  });
});
