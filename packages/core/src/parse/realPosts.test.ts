import { describe, expect, it } from 'vitest';
import { emptyDraft } from './draft';
import { splitSteps } from './stepSplit';
import { bestTitle, dominantDish, tidyTitle } from './title';
import { importFromUrl } from './url';
import { fuseVideoRecipe } from './videoFusion';

/**
 * Posts written the way creators write them on Instagram, TikTok and Pinterest (TestFlight: "une
 * recette de pizza m'a sorti Salade en titre", "plusieurs étapes écrites dans la MÊME étape").
 */
async function importCaption(caption: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<html><head><meta property="og:description" content="${esc(
    `1 234 likes, 56 comments - chef on March 2, 2025: "${caption}"`,
  )}"></head></html>`;
  const res = await importFromUrl(
    async () => ({ status: 200, body: html, contentType: 'text/html' }),
    'https://www.instagram.com/reel/ABCDEF123/',
  );
  return res.draft;
}

describe('titles of real posts', () => {
  it('a pizza is never titled "Salade"', async () => {
    const d = await importCaption(
      'Petite salade ? Non, pizza 🤤 Cette pizza chèvre miel je te jure tu vas te régaler !! Ingrédients : 1 pâte à pizza, 3 c. à soupe de crème fraîche, 1 bûche de chèvre, 2 c. à soupe de miel, 1 poignée de noix, roquette. Préparation : Préchauffer le four à 220°C. Étaler la crème sur la pâte, ajouter le chèvre en rondelles et les noix, arroser de miel. Enfourner 12 min puis ajouter la roquette. #pizza #chevremiel #recette',
    );
    expect(d.title).toBe('Pizza chèvre miel');
    expect(d.steps.map((s) => s.text)).toEqual([
      'Préchauffer le four à 220°C.',
      'Étaler la crème sur la pâte.',
      'Ajouter le chèvre en rondelles et les noix.',
      'Arroser de miel.',
      'Enfourner 12 min.',
      'Ajouter la roquette.',
    ]);
  });

  it('a pizza video where a salad is said first', () => {
    const f = fuseVideoRecipe({
      caption: { ...emptyDraft(), notes: '#pizza #pizzamaison #faitmaison' },
      screen: [],
      speech: [
        'Une salade c’est bien, mais ce soir on fait une pizza maison.',
        'Étale la pâte, ajoute la sauce tomate et la mozzarella.',
        'Enfourne ta pizza 10 minutes à 250 degrés.',
        'Tu peux la servir avec une petite salade.',
      ].map((text, i) => ({ text, start: i * 4, end: i * 4 + 3.5, confidence: 0.9 })),
    });
    expect(f.draft.title).toMatch(/^Pizza/);
    // Without any hashtag: "on fait une pizza" names the dish being made.
    const g = fuseVideoRecipe({
      caption: emptyDraft(),
      screen: [],
      speech: [
        'Une salade c’est bien, mais ce soir on fait une pizza maison.',
        'Étale la pâte, ajoute la sauce tomate et la mozzarella.',
        'Enfourne 10 minutes à 250 degrés.',
        'Tu peux la servir avec une petite salade.',
      ].map((text, i) => ({ text, start: i * 4, end: i * 4 + 3.5, confidence: 0.9 })),
    });
    expect(g.draft.title).toBe('Pizza maison');
  });

  it('the dish named most, not a food of the list', () => {
    expect(
      dominantDish('Petite salade ? Non, pizza 🤤 Cette pizza chèvre miel #pizza'),
    ).toMatchObject({
      head: 'pizza',
      phrase: 'Pizza chèvre miel',
    });
    // "pain de mie" twice in a croque-monsieur: still the croque-monsieur.
    expect(
      bestTitle({
        captionFirst: 'Ça c’est mon dîner préféré quand j’ai la flemme 😅',
        caption:
          'Ça c’est mon dîner préféré quand j’ai la flemme 😅 Croque-monsieur au four ! 8 tranches de pain de mie. Beurrer le pain.',
        ingredients: ['pain de mie', 'jambon', 'emmental râpé'],
      }),
    ).toBe('Croque-monsieur au four');
    // A salad named again and again stays a salad.
    expect(
      bestTitle({
        captionFirst: 'Salade de pâtes estivale ☀️',
        caption: 'Salade de pâtes estivale ☀️\n250 g de pâtes\nCuire les pâtes.',
        ingredients: ['pâtes', 'concombre'],
      }),
    ).toBe('Salade de pâtes estivale');
  });

  it('titles ready to show', () => {
    expect(tidyTitle('COOKIES AU CHOCOLAT ULTRA MOELLEUX')).toBe(
      'Cookies au chocolat ultra moelleux',
    );
    expect(tidyTitle('poulet coco curry en 20 min')).toBe('Poulet coco curry');
    expect(tidyTitle('Pâte à pizza inratable (comme en Italie) 🇮🇹')).toBe('Pâte à pizza inratable');
    expect(tidyTitle('Pizza maison 🍕')).toBe('Pizza maison');
  });

  it('"smash burgers", not "burgers"', async () => {
    const d = await importCaption(
      'smash burgers at home 🍔 you need to try this!! for 4 burgers: 500g ground beef 80/20, 4 brioche buns, 4 slices cheddar, 1 onion thinly sliced, pickles, burger sauce. method: divide the beef into 8 balls. heat a cast iron pan until smoking. place a ball, smash it flat with a spatula and season with salt. cook 2 minutes, flip, add cheese and cook 1 more minute. toast the buns, stack 2 patties with onion and pickles, add sauce and serve. #smashburger #burger',
    );
    expect(d.title).toBe('Smash burgers at home');
    expect(d.servings).toBe(4);
    expect(d.ingredients.map((i) => i.name)).toContain('brioche buns');
    expect(d.steps[0]!.text).toBe('Divide the beef into 8 balls.');
    expect(d.steps[1]!.text).toBe('Heat a cast iron pan until smoking.');
    expect(d.steps.length).toBeGreaterThanOrEqual(9);
  });
});

describe('one action per step', () => {
  const texts = (t: string) =>
    splitSteps([{ group: null, text: t, timerSeconds: null, timerLabel: null }]).map((s) => s.text);

  it('cuts a method written in one sentence', () => {
    expect(
      texts(
        'Étaler la pâte à la main, ajouter la sauce, la mozzarella et enfourner 8 min à 250°C.',
      ),
    ).toEqual([
      'Étaler la pâte à la main.',
      'Ajouter la sauce, la mozzarella.',
      'Enfourner 8 min à 250°C.',
    ]);
    expect(
      texts('Cover with foil and bake 25 minutes, then uncover and bake 20 more minutes.'),
    ).toEqual(['Cover with foil.', 'Bake 25 minutes, then uncover.', 'Bake 20 more minutes.']);
  });

  it('keeps what is not an instruction with its instruction', () => {
    // A condition, a "meanwhile", a list of foods: one step.
    expect(texts('Quand le beurre est fondu, ajouter la farine.')).toEqual([
      'Quand le beurre est fondu, ajouter la farine.',
    ]);
    expect(texts('Pendant ce temps, poêler les champignons.')).toEqual([
      'Pendant ce temps, poêler les champignons.',
    ]);
    expect(texts('Ajouter le sel, le poivre et la muscade.')).toEqual([
      'Ajouter le sel, le poivre et la muscade.',
    ]);
    expect(texts('Mélanger la farine et la levure.')).toEqual(['Mélanger la farine et la levure.']);
    expect(texts('Dans un saladier, mélange la farine et la levure.')).toEqual([
      'Dans un saladier, mélange la farine et la levure.',
    ]);
    expect(texts('Ajouter 2 c. à soupe de sucre. Mélanger.')).toEqual([
      'Ajouter 2 c. à soupe de sucre.',
      'Mélanger.',
    ]);
  });

  it('sentences without capitals, a timer per step', () => {
    const st = splitSteps([
      {
        group: 'Cuisson',
        text: 'cook 2 minutes. flip and cook 1 more minute.',
        timerSeconds: null,
        timerLabel: null,
      },
    ]);
    expect(st.map((s) => [s.text, s.group])).toEqual([
      ['Cook 2 minutes.', 'Cuisson'],
      ['Flip and cook 1 more minute.', 'Cuisson'],
    ]);
    expect(st[0]!.timerSeconds).toBe(120);
  });
});

describe('lists written in one line', () => {
  it('Pinterest: ingredients then the method on the same line', async () => {
    const d = await importCaption(
      'Gratin dauphinois facile et crémeux - la recette traditionnelle. Ingrédients : 1 kg de pommes de terre, 50 cl de crème liquide, 25 cl de lait, 2 gousses d’ail, muscade, sel, poivre, beurre. Éplucher et couper les pommes de terre en fines rondelles. Frotter le plat avec l’ail et le beurrer. Verser dans le plat et enfourner 1h à 160°C.',
    );
    expect(d.ingredients.map((i) => i.name)).toEqual([
      'pommes de terre',
      'crème liquide',
      'lait',
      'ail',
      'muscade',
      'sel',
      'poivre',
      'beurre',
    ]);
    expect(d.steps[0]!.text).toBe('Éplucher et couper les pommes de terre en fines rondelles.');
    expect(d.steps.at(-1)!.text).toBe('Enfourner 1h à 160°C.');
  });

  it('"Pour 4 : …" in a flat caption', async () => {
    const d = await importCaption(
      'Ça c’est mon dîner préféré quand j’ai la flemme 😅 Croque-monsieur au four ! Pour 4 : 8 tranches de pain de mie, 4 tranches de jambon, 150 g d’emmental râpé, 20 cl de béchamel. Beurrer le pain. Mettre le jambon et la béchamel, refermer, ajouter le fromage sur le dessus. 15 min à 200°C et c’est prêt.',
    );
    expect(d.title).toBe('Croque-monsieur au four');
    expect(d.servings).toBe(4);
    expect(d.ingredients).toHaveLength(4);
    expect(d.steps[0]!.text).toBe('Beurrer le pain.');
  });

  it('a food without quantity at the end of the list ("poivre", "cacao en poudre")', async () => {
    const d = await importCaption(
      'Les vraies pâtes carbonara 🍝\n\n👉 Pour 2 personnes\n200 g de spaghetti\n100 g de guanciale\n3 jaunes d’œufs\n50 g de pecorino\npoivre\n\nFaire cuire les pâtes. Mélanger les jaunes avec le pecorino.',
    );
    expect(d.ingredients.map((i) => i.name)).toContain('poivre');
    expect(d.steps.map((s) => s.text)).toEqual([
      'Faire cuire les pâtes.',
      'Mélanger les jaunes avec le pecorino.',
    ]);
  });

  it('a list inside the sentence, without any header', async () => {
    const d = await importCaption(
      'LA recette des crêpes de ma grand-mère ❤️ 250g de farine, 4 oeufs, 50cl de lait, 1 pincée de sel, 50g de beurre fondu. Mettre la farine dans un saladier, faire un puits et ajouter les oeufs. Laisser reposer 1h. #crepes #chandeleur',
    );
    expect(d.title).toBe('Crêpes de ma grand-mère');
    expect(d.ingredients.map((i) => i.name)).toEqual([
      'farine',
      'oeufs',
      'lait',
      'sel',
      'beurre fondu',
    ]);
    expect(d.steps.map((s) => s.text)).toEqual([
      'Mettre la farine dans un saladier.',
      'Faire un puits.',
      'Ajouter les oeufs.',
      'Laisser reposer 1h.',
    ]);
  });

  it('"Il vous faut :" and a method told like speech', async () => {
    const d = await importCaption(
      "Alors aujourd'hui je vous montre comment faire des pâtes à la crème de citron 🍋 vous allez adorer. Il vous faut : 200 g de pâtes, 1 citron, 20 cl de crème, du parmesan. On fait cuire les pâtes. On égoutte les pâtes, on ajoute la crème au citron et le parmesan.",
    );
    expect(d.title).toBe('Pâtes à la crème de citron');
    expect(d.ingredients.map((i) => i.name)).toEqual(['pâtes', 'citron', 'crème', 'parmesan']);
    expect(d.steps.map((s) => s.text)).toEqual([
      'On fait cuire les pâtes.',
      'On égoutte les pâtes.',
      'On ajoute la crème au citron et le parmesan.',
    ]);
  });

  it('a tip after the method is a tip', async () => {
    const d = await importCaption(
      'Pâte à pizza\n\n500g farine\n300ml eau\n7g levure\n\n1. Mélange la farine et la levure\n2. Ajoute l’eau et pétris 10 minutes\n\nTu peux la garder 3 jours au frigo ✨',
    );
    expect(d.steps.map((s) => s.text)).not.toContain('Tu peux la garder 3 jours au frigo ✨');
    expect(d.tips).toContain('garder 3 jours au frigo');
  });
});
