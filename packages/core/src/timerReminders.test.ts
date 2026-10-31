import { describe, expect, it } from 'vitest';
import { stepReminders } from './timers';

describe('reminders during a timer', () => {
  it('turn halfway', () => {
    expect(stepReminders('Cuire 10 min en retournant à mi-cuisson.', 600)).toEqual([
      { after: 300, kind: 'flip' },
    ]);
    expect(stepReminders('Grill for 8 minutes, flipping once.', 480)).toEqual([
      { after: 240, kind: 'flip' },
    ]);
  });
  it('stir now and then, or every N minutes', () => {
    expect(stepReminders('Laisser mijoter 15 min en remuant de temps en temps.', 900)).toEqual([
      { after: 180, kind: 'stir' },
      { after: 360, kind: 'stir' },
      { after: 540, kind: 'stir' },
      { after: 720, kind: 'stir' },
    ]);
    expect(
      stepReminders('Cuire 20 min, remuer toutes les 10 min.', 1200).map((r) => r.after),
    ).toEqual([600]);
  });
  it('baste a roast; nothing for a plain or short step', () => {
    expect(
      stepReminders('Rôtir 1 h en arrosant régulièrement.', 3600).filter((r) => r.kind === 'baste'),
    ).toHaveLength(2);
    expect(stepReminders('Cuire 25 min.', 1500)).toEqual([]);
    expect(stepReminders('Retourner et cuire 1 min.', 60)).toEqual([]);
  });
});
