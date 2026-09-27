import { describe, expect, it } from 'vitest';
import { parseRecipeText } from './text';

describe('parseRecipeText', () => {
  it('parses a classic French recipe with headers, groups and metadata', () => {
    const d = parseRecipeText(`Tarte aux pommes de mamie

Une tarte simple et fondante.

Pour 6 personnes
Préparation : 20 min
Cuisson : 45 min
Four à 180°C

Ingrédients :
Pour la pâte :
- 250 g de farine
- 125 g de beurre
- 1 pincée de sel
Pour la garniture :
- 4 pommes
- 50 g de sucre

Préparation :
1. Mélanger la farine et le beurre du bout des doigts.
2. Étaler la pâte et la disposer dans un moule.
3. Cuire 45 minutes.

Astuce :
Ajoutez un peu de cannelle.`);
    expect(d.title).toBe('Tarte aux pommes de mamie');
    expect(d.description).toBe('Une tarte simple et fondante.');
    expect(d.servings).toBe(6);
    expect(d.prepMinutes).toBe(20);
    expect(d.cookMinutes).toBe(45);
    expect(d.ovenTemperatureC).toBe(180);
    expect(d.ingredients).toHaveLength(5);
    expect(d.ingredients[0]).toMatchObject({ group: 'Pour la pâte', name: 'farine', quantity: 250, unit: 'g' });
    expect(d.ingredients[3]).toMatchObject({ group: 'Pour la garniture', name: 'pommes', quantity: 4 });
    expect(d.steps).toHaveLength(3);
    expect(d.steps[0]!.text).toBe('Mélanger la farine et le beurre du bout des doigts.');
    expect(d.steps[2]!.timerSeconds).toBe(45 * 60);
    expect(d.tips).toBe('Ajoutez un peu de cannelle.');
  });

  it('parses an English recipe', () => {
    const d = parseRecipeText(`Quick Garlic Pasta
Serves 2
Prep time: 5 minutes
Cook time: 1 hour 10 minutes
Ingredients
200 g spaghetti
3 cloves garlic, minced
2 tbsp olive oil
Instructions
Step 1: Boil the pasta.
Step 2: Fry the garlic in the oil for 2 minutes.`);
    expect(d.title).toBe('Quick Garlic Pasta');
    expect(d.servings).toBe(2);
    expect(d.prepMinutes).toBe(5);
    expect(d.cookMinutes).toBe(70);
    expect(d.ingredients.map((i) => i.unit)).toEqual(['g', 'clove', 'tbsp']);
    expect(d.ingredients[1]).toMatchObject({ name: 'garlic', note: 'minced' });
    expect(d.steps.map((s) => s.text)).toEqual(['Boil the pasta.', 'Fry the garlic in the oil for 2 minutes.']);
    expect(d.steps[1]!.timerSeconds).toBe(120);
  });

  it('parses German and Spanish and Italian headers', () => {
    expect(parseRecipeText('Kuchen\nZutaten:\n200 g Mehl\nZubereitung:\n1. Backen.').ingredients[0]).toMatchObject({ quantity: 200, unit: 'g' });
    expect(parseRecipeText('Tortilla\nIngredientes:\n4 huevos\nPreparación:\n1. Batir.').steps).toHaveLength(1);
    expect(parseRecipeText('Tiramisù\nIngredienti\n250 g di mascarpone\nProcedimento\nMontare.').ingredients[0]!.name).toBe('mascarpone');
  });

  it('handles a TikTok-style caption without headers and extracts hashtags', () => {
    const d = parseRecipeText(`🍝 Pâtes crémeuses au citron en 15 min !
200 g de pâtes
1 citron
10 cl de crème
Faites cuire les pâtes puis mélangez avec la crème et le zeste du citron, c'est prêt !
#recette #pasta #easyrecipe`);
    expect(d.title).toBe('Pâtes crémeuses au citron en 15 min !');
    expect(d.tags).toEqual(['recette', 'pasta', 'easyrecipe']);
    expect(d.ingredients).toHaveLength(3);
    expect(d.steps).toHaveLength(1);
  });

  it('merges wrapped step lines', () => {
    const d = parseRecipeText('X\nÉtapes\n1. Mélanger le tout et\nlaisser reposer 1 h\n2. Servir.');
    expect(d.steps).toHaveLength(2);
    expect(d.steps[0]!.text).toBe('Mélanger le tout et laisser reposer 1 h');
    expect(d.steps[0]!.timerSeconds).toBe(3600);
  });

  it('thermostat and fahrenheit', () => {
    expect(parseRecipeText('A\nCuire au four th. 7').ovenTemperatureC).toBe(210);
    expect(parseRecipeText('A\nBake at 350°F').ovenTemperatureC).toBe(175);
  });

  it('never loses unknown text and survives absurd input', () => {
    const long = 'Lorem ipsum dolor sit amet. '.repeat(40);
    const d = parseRecipeText(`Titre\n${long}`);
    expect(d.unparsed.length + (d.description ? 1 : 0)).toBeGreaterThan(0);
    for (const s of ['', '\n\n\n', '#', '###', '1.', 'Ingrédients:', '🍕'.repeat(1000), 'a'.repeat(30000)]) {
      expect(() => parseRecipeText(s)).not.toThrow();
    }
    expect(parseRecipeText('').title).toBeNull();
  });
});
