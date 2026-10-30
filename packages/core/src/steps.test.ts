import { describe, expect, it } from 'vitest';
import { detectStepTimer, stepIngredients, voiceCommand } from './steps';

describe('cook mode helpers', () => {
  it('finds a timer in a step that has none', () => {
    const t = (text: string, timerSeconds: number | null = null) =>
      detectStepTimer({ text, timerSeconds });
    expect(t('Cuire 8 min dans l’eau salée.')).toBe(480);
    expect(t('Laisser 1 h 30 de repos.')).toBe(5400);
    expect(t('Bake for 25 minutes.')).toBe(1500);
    expect(t('Préchauffer le four à 200 °C.')).toBeNull();
    expect(t('Mélanger.', 90)).toBe(90);
  });

  it('lists the ingredients a step talks about', () => {
    const ings = [
      { name: 'oignons' },
      { name: 'ail' },
      { name: 'crème fraîche' },
      { name: 'pommes de terre' },
      { name: 'olive oil' },
      { name: 'sel' },
    ];
    const names = (s: string) => stepIngredients(s, ings).map((i) => i.name);
    expect(names('Faire revenir l’oignon et l’ail 5 min.')).toEqual(['oignons', 'ail']);
    expect(names('Mixer avec la crème.')).toEqual(['crème fraîche']);
    expect(names('Trancher les pommes de terre, saler.')).toEqual(['pommes de terre']);
    expect(names('Drizzle with oil.')).toEqual(['olive oil']);
    expect(names('Ajouter le sel.')).toEqual(['sel']);
    expect(names('Laisser reposer.')).toEqual([]);
  });

  it('understands voice commands', () => {
    expect(voiceCommand('Suivant')).toBe('next');
    expect(voiceCommand('ok étape suivante')).toBe('next');
    expect(voiceCommand('précédente')).toBe('previous');
    expect(voiceCommand('Répète')).toBe('repeat');
    expect(voiceCommand('lance le minuteur')).toBe('timer');
    expect(voiceCommand('les ingrédients')).toBe('ingredients');
    expect(voiceCommand('next step')).toBe('next');
    expect(voiceCommand('start the timer')).toBe('timer');
    expect(voiceCommand('il faut bien mélanger la pâte')).toBeNull();
  });
});
