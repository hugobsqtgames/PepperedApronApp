import { describe, expect, it } from 'vitest';
import { recipeFromTranscript } from './transcript';

/**
 * TestFlight feedback: an Instagram reel listened to on the iPhone put the whole recipe in one
 * step. The phone's speech recognition returns the video as one long text with few full stops.
 * (The transcript below is the one in the feedback screenshot.)
 */
const HEARD =
  "Est-ce que vous avez déjà goûté un hachis Parmentier avec de la patate douce ? Si c'est pas le cas vous devez absolument tester c'est encore meilleur qu' avec de la pomme de terre comme d'habitude c'est hyper simple à faire vous inquiétez pas je vous remets toutes les quantités en description donc je vais commencer par éplucher mes patates douces et je vais les couper un petit morceau. Ensuite je vais les faire cuire tout simplement dans de l' eau bouillante pendant 15 minutes. Et en attendant dans une poêle je vais faire refaire deux gousse d'ail de l' oignon ma viande hachée et les morceaux de tomate tomates re cuire. Fais-moi cinq bonnes milliers. Ensuite j' ajoute de la crème rachat de la farine et du parmesan, l' cuire une dizaine de minutes à feu d' eau une fois que les patates sont cuites, je vais venir faire ma purée donc je les écrase, j' ajoute de la crème fraîche et du beurre et maintenant tout est prêt donc on va commencer par mettre la viande au fond d'un plat par-dessus, j' ajoute tout simplement la purée et je vais venir faire des traces sur la purée avec une fourchette un peu de chapelure et ça au four à 2 00 ° pendant 20 minutes à la sortie ça donne ça et vraiment je te conseille de tester c'est excellent.";

describe('a recipe said out loud, heard by the phone as one long text', () => {
  const r = recipeFromTranscript([HEARD]);
  const steps = r.steps.map((s) => s.text);

  it('several steps, none of them the whole video', () => {
    expect(steps.length).toBeGreaterThanOrEqual(5);
    for (const s of steps) expect(s.length).toBeLessThan(320);
  });

  it('the steps follow what is done, in order', () => {
    const at = (w: string) => steps.findIndex((s) => s.toLowerCase().includes(w));
    expect(at('éplucher')).toBeGreaterThanOrEqual(0);
    expect(at('eau bouillante')).toBeGreaterThan(at('éplucher'));
    expect(at('purée')).toBeGreaterThan(at('eau bouillante'));
    expect(at('four')).toBeGreaterThanOrEqual(at('purée'));
  });

  it('the introduction and the sign-off are not steps', () => {
    expect(steps.some((s) => /^Est-ce que/.test(s))).toBe(false);
    expect(steps.some((s) => /je te conseille de tester/.test(s) && !/four/.test(s))).toBe(false);
  });

  it('words are written as they should be', () => {
    expect(steps.join(' ')).toContain('j’ajoute'.replace('’', "'"));
    expect(steps.join(' ')).toContain('200 °');
  });

  it('the cooking times are found', () => {
    expect(r.steps.some((s) => s.timerSeconds === 15 * 60)).toBe(true);
  });
});
