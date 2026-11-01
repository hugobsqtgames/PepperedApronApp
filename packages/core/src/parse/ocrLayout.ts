/**
 * The text of a printed page, read line by line (Apple Vision gives each line with its place on
 * the picture), put back into paragraphs: a book prints one step over several lines, and each
 * line must not become a step. A line is joined to the next one when it fills the column (the
 * paragraph goes on), the next one sits right under it, in the same column, and does not start
 * a new item (a number, a bullet, a quantity).
 */
export interface PlacedLine {
  text: string;
  /** Position and size, 0–1 of the picture, from the top left. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A new item: "2", "2.", "Étape 2", "①", a bullet, or a quantity ("200 g de farine"). */
const STARTS_ITEM =
  /^\s*(?:\d|[①-⑳]|[-–—•*·▪◦●✓✔]|(?:etape|étape|step|paso|schritt|passo)\s*\d|[½¼¾⅓⅔⅛])/i;
/** A title or a section ("Préparation", "Ingrédients :"), or a sentence that ends. */
const ENDS_BLOCK = /[:：]\s*$/;

export function paragraphsFromLines(lines: PlacedLine[]): string {
  const kept = lines.filter((l) => l.text.trim());
  if (!kept.length) return '';
  // No usable positions (another reader): one line per line, as before.
  if (kept.some((l) => !(l.height > 0) || !(l.width > 0)))
    return kept.map((l) => l.text.trim()).join('\n');
  const right = (l: PlacedLine) => l.x + l.width;
  const sameColumn = (a: PlacedLine, b: PlacedLine) =>
    Math.abs(a.x - b.x) < 0.05 || (b.x > a.x && b.x < right(a) && Math.abs(a.x - b.x) < 0.12);
  /** The right edge of the column a line is in: the widest of its neighbours in that column. */
  const columnRight = (i: number) => {
    let r = right(kept[i]!);
    for (let k = Math.max(0, i - 6); k < Math.min(kept.length, i + 7); k++)
      if (sameColumn(kept[i]!, kept[k]!) && Math.abs(kept[k]!.y - kept[i]!.y) < 0.3)
        r = Math.max(r, right(kept[k]!));
    return r;
  };
  const out: string[] = [];
  let current = kept[0]!.text.trim();
  for (let i = 0; i + 1 < kept.length; i++) {
    const a = kept[i]!;
    const b = kept[i + 1]!;
    const next = b.text.trim();
    const lineHeight = Math.max(a.height, b.height);
    const gap = b.y - (a.y + a.height);
    const fills = right(a) >= columnRight(i) - Math.max(0.06, lineHeight * 1.5);
    const join =
      sameColumn(a, b) &&
      gap > -lineHeight * 0.5 &&
      gap < lineHeight * 0.9 &&
      fills &&
      !ENDS_BLOCK.test(a.text) &&
      !STARTS_ITEM.test(next) &&
      // A short line that fills its column is a title or an ingredient, not a paragraph.
      a.text.trim().split(/\s+/).length >= 4;
    if (join) {
      // "cuis-" + "son": the word cut at the end of the line is put back together.
      current =
        /\p{L}-$/u.test(current) && /^\p{Ll}/u.test(next)
          ? current.slice(0, -1) + next
          : `${current} ${next}`;
    } else {
      out.push(current);
      current = next;
    }
  }
  out.push(current);
  return out.join('\n');
}
