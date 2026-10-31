import { describe, expect, it } from 'vitest';
import { bestTitle, dishPhrase, isHook, titleFromScreen } from './title';

describe('dish names from hooks', () => {
  it.each([
    ['Avec ces pennes au poulet je te jure tu vas te régaler 😍🔥', 'Pennes au poulet'],
    ['Les pâtes crémeuses au citron qui vont te changer la vie', 'Pâtes crémeuses au citron'],
    ['Tu connais le gâteau au yaourt de mamie ?', 'Gâteau au yaourt de mamie'],
    ['Le meilleur cookie du monde 🍪', 'Cookie'],
    ['Ce gratin dauphinois est une tuerie !', 'Gratin dauphinois'],
    ['POV : tu fais une tarte aux pommes en 10 min', 'Tarte aux pommes'],
    ['This creamy garlic chicken pasta is so good', 'Chicken pasta'],
    ['Quiche lorraine', 'Quiche lorraine'],
    ['Recette de la soupe à l’oignon', 'Soupe à l’oignon'],
  ])('%s → %s', (hook, title) => {
    expect(dishPhrase(hook)).toBe(title);
  });

  it('no dish named: nothing', () => {
    expect(dishPhrase('Je vous montre ma routine du dimanche !')).toBeNull();
  });

  it('a hook is recognised, a title is not', () => {
    expect(isHook('Avec ces pennes au poulet je te jure tu vas te régaler')).toBe(true);
    expect(isHook('Pâtes crémeuses au citron')).toBe(false);
  });
});

describe('best title', () => {
  it('the title written on the video comes first', () => {
    const frames = [
      ['PENNE AU POULET', '@chef.marie'],
      ['PENNE AU POULET', '200 g de pennes'],
      ['Ajoute la crème'],
    ];
    expect(titleFromScreen(frames)).toBe('Penne au poulet');
    expect(
      bestTitle({
        screen: titleFromScreen(frames),
        captionFirst: 'Avec ces pennes au poulet je te jure tu vas te régaler',
      }),
    ).toBe('Penne au poulet');
  });

  it('a hook gives the dish it names; a clean caption line is kept', () => {
    expect(
      bestTitle({ captionFirst: 'Avec ces pennes au poulet je te jure tu vas te régaler 😍' }),
    ).toBe('Pennes au poulet');
    expect(bestTitle({ captionFirst: 'Tarte tatin de ma grand-mère' })).toBe(
      'Tarte tatin de ma grand-mère',
    );
    expect(
      bestTitle({
        captionFirst: 'Vous allez adorer 😍',
        speech: 'Aujourd’hui je vous fais un risotto aux champignons, alors on commence',
      }),
    ).toBe('Risotto aux champignons');
  });
});

describe('notes once the video completed the recipe', () => {
  it('keep what the recipe does not already say', async () => {
    const { pruneCaptionNotes } = await import('./title');
    const notes = [
      'Avec ces pennes au poulet je te jure tu vas te régaler',
      'Ingrédients 👇',
      '- 400 g de pennes',
      '- 2 escalopes de poulet',
      'Astuce : ajoute un peu de muscade, ça change tout.',
      '#pates #poulet',
    ].join('\n');
    expect(
      pruneCaptionNotes(notes, {
        title: 'Pennes au poulet',
        ingredients: [{ name: 'pennes' }, { name: 'escalopes de poulet' }],
      }),
    ).toBe('Astuce : ajoute un peu de muscade, ça change tout.');
  });
});
