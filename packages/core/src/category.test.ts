import { describe, expect, it } from 'vitest';
import { guessCategory } from './category';

const ing = (...names: string[]) => names.map((name) => ({ name }));
const g = (title: string, ...names: string[]) =>
  guessCategory({ title, ingredients: ing(...names) });

describe('guessCategory (TestFlight feedback: imports filed on their own)', () => {
  it('names the dish', () => {
    expect(g('Pennes au poulet')).toBe('pasta');
    expect(g('Nouilles udon au peanut butter')).toBe('pasta');
    expect(g('Spaghetti carbonara')).toBe('pasta');
    expect(g('Une beauté ce plat, poisson, sauce citronnée, polenta crémeuse et brocolis')).toBe(
      'fish',
    );
    expect(g('Saumon rôti au four')).toBe('fish');
    expect(g('Poulet sauce moutarde')).toBe('meat');
    expect(g('Bœuf bourguignon')).toBe('meat');
    expect(g('Velouté de potimarron')).toBe('soup');
    expect(g('Salade de poulet croustillant')).toBe('salad');
    expect(g('Salade de fruits frais')).toBe('dessert');
    expect(g('Tarte au citron meringuée')).toBe('dessert');
    expect(g('Cookies aux pépites de chocolat')).toBe('dessert');
    expect(g('Pancakes moelleux')).toBe('breakfast');
    expect(g('Sauce tomate maison')).toBe('sauce');
    expect(g('Pesto de basilic')).toBe('sauce');
    expect(g('Houmous express')).toBe('appetizer');
    expect(g('Pain maison sans pétrissage')).toBe('baking');
    expect(g('Pâte à pizza')).toBe('baking');
    expect(g('Smoothie mangue banane')).toBe('drinks');
    expect(g('Dahl de lentilles corail')).toBe('vegetarian');
    expect(g('Quiche lorraine')).toBe('main');
    expect(g('Purée de pommes de terre')).toBe('side');
    expect(g('Quick chicken curry')).toBe('meat');
    expect(g('Creamy tomato soup')).toBe('soup');
  });

  it('uses the ingredients when the name says nothing (a hook)', () => {
    expect(
      g('Le plat qui a régalé toute la famille', '300 g de penne', '2 escalopes de poulet'),
    ).toBe('pasta');
    expect(g('Une tuerie !', '4 filets de cabillaud', 'citron')).toBe('fish');
    expect(g('Trop bon', '500 g de bœuf haché', 'oignon')).toBe('meat');
    expect(g('Mon classique', '200 g de farine', '100 g de sucre', '3 œufs')).toBe('dessert');
  });

  it('pastry is not pasta; nothing sure means no category', () => {
    expect(g('Tarte aux poireaux', 'pâte brisée', 'poireaux', 'crème')).toBe(null);
    expect(g('Recette du dimanche')).toBe(null);
    expect(g('Poulet au jus')).toBe('meat');
    expect(g('Burger pain brioché')).toBe('meat');
  });
});
