import { it } from 'vitest';
import { parseRecipeText } from './text';
import { unflattenCaption } from './social';
it('x', () => {
  const c = "🥧 Quiche sans pâte\n\nPour un moule de 24 cm (l'idéal)\n* 3 oeufs\n* 120 g de farine\n* 50 cl de lait\n* sel, poivre, muscade\n\nMélangez tout, versez dans le moule et enfournez à 180° pendant 45 min 😋\n\n📊 Pour 8 parts\n👩🏻‍💻 La recette imprimable sur www.example.fr\n#quiche #recette";
  const d = parseRecipeText(unflattenCaption(c));
  process.stdout.write('\n### ' + JSON.stringify(d.ingredients.map((i) => i.name)) + ' steps ' + JSON.stringify(d.steps.map(s=>s.text)) + ' notes ' + JSON.stringify(d.notes) + '\n');
});
