import { describe, expect, it } from 'vitest';
import { parseRecipeText } from './text';
import { unflattenCaption } from './social';

const parse = (s: string) => parseRecipeText(unflattenCaption(s));

describe('captions written the Instagram way', () => {
  it('emoji bullets, emoji numbers and "👇" headers', () => {
    const d = parse(`Avec ces pennes au poulet je te jure tu vas te régaler 😍🔥

Ingrédients pour 4 personnes 👇
🍝 400 g de pennes
🍗 2 escalopes de poulet
🧅 1 oignon
🥛 20 cl de crème fraîche
🧀 50 g de parmesan

Préparation 👇
1️⃣ Fais cuire les pennes dans l’eau bouillante salée.
2️⃣ Coupe le poulet en morceaux et fais-le dorer avec l’oignon.
3️⃣ Ajoute la crème et le parmesan, laisse mijoter 5 min.
4️⃣ Mélange avec les pâtes et sers chaud !

#pates #poulet #recettefacile`);
    expect(d.servings).toBe(4);
    expect(d.ingredients.map((i) => i.name)).toEqual([
      'pennes',
      'escalopes de poulet',
      'oignon',
      'crème fraîche',
      'parmesan',
    ]);
    expect(d.steps).toHaveLength(4);
    expect(d.steps[0]!.text).toBe('Fais cuire les pennes dans l’eau bouillante salée.');
  });

  it('steps written as a paragraph, without numbers', () => {
    const d = parse(`Pennes au poulet crémeuses

Ingrédients :
- 400 g de pennes
- 2 blancs de poulet
- 20 cl de crème

Fais cuire les pennes 10 min dans l’eau bouillante salée. Pendant ce temps, coupe le poulet en dés et fais-le dorer dans une poêle avec un filet d’huile. Ajoute la crème, sale, poivre et laisse épaissir 3 min. Mélange avec les pâtes égouttées et sers aussitôt.`);
    expect(d.ingredients).toHaveLength(3);
    expect(d.steps.length).toBeGreaterThanOrEqual(3);
    expect(d.steps[0]!.text).toMatch(/^Fais cuire les pennes 10 min/);
    expect(d.steps[0]!.timerSeconds).toBe(600);
  });

  it('"les ingrédients" / "la recette" headers and arrow bullets', () => {
    const d = parse(`Les ingrédients :
➡️ 250 g de farine
➡️ 3 œufs
➡️ 50 cl de lait

La recette :
👉 Mélange la farine et les œufs.
👉 Ajoute le lait petit à petit.
👉 Laisse reposer 1 h puis fais cuire les crêpes.`);
    expect(d.ingredients).toHaveLength(3);
    expect(d.steps).toHaveLength(3);
  });

  it('ingredients then steps without any header', () => {
    const d = parse(`Gratin de courgettes
• 3 courgettes
• 2 œufs
• 20 cl de crème
• 80 g de gruyère
Coupe les courgettes en rondelles et fais-les revenir 10 min.
Bats les œufs avec la crème, verse sur les courgettes et parsème de gruyère.
Enfourne 25 min à 180 °C.`);
    expect(d.ingredients).toHaveLength(4);
    expect(d.steps).toHaveLength(3);
    expect(d.ovenTemperatureC).toBe(180);
  });
});
