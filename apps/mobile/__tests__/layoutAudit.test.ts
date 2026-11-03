/**
 * Layout audit of every screen, without a phone: words were cut on narrower iPhones or with large
 * text ("Plannin|g" in the planning title, "Pour change|r" on the tonight card, "Chez moi" next
 * to "Tout prendre"). They all came from one pattern: a horizontal row holding a text and a
 * sibling that keeps its own width with its own words (a Button with a title, a Badge, a Chip),
 * where the text cannot go to the next line: the row does not wrap, or the text is squeezed by
 * flex: 1 (which ignores flexWrap). This test reads the source of every screen and component and
 * fails on that pattern, so it cannot come back. Fix: icons instead of text buttons, the text on
 * its own line, or a row that wraps with a text that is not flex: 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(__dirname, '../src');

function files(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return fs.statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

type El = ts.JsxElement | ts.JsxSelfClosingElement;
const opening = (e: El) => (ts.isJsxElement(e) ? e.openingElement : e);
const tag = (e: El) => opening(e).tagName.getText();
const attr = (e: El, name: string) =>
  opening(e).attributes.properties.find(
    (a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText() === name,
  );

/** Children, including those shown under a condition ({x ? <Button/> : null}, {x && <Badge/>}). */
function children(n: ts.Node): El[] {
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) return [n];
  if (ts.isJsxExpression(n)) return n.expression ? children(n.expression) : [];
  if (ts.isParenthesizedExpression(n)) return children(n.expression);
  if (ts.isConditionalExpression(n)) return [...children(n.whenTrue), ...children(n.whenFalse)];
  if (ts.isBinaryExpression(n)) return children(n.right);
  if (ts.isJsxFragment(n)) return n.children.flatMap(children);
  return [];
}

export function riskyRows(file: string, code: string): string[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  /** The style of an element, named styles (styles.footer) resolved in the same file. */
  const styleOf = (e: El) => {
    const a = attr(e, 'style');
    let s = a?.initializer?.getText() ?? '';
    for (const m of s.matchAll(/styles\.(\w+)/g)) {
      const def = new RegExp(`\\n\\s+${m[1]}:\\s*\\{([^}]*)\\}`).exec(code);
      if (def) s += def[1];
    }
    return s;
  };
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && ['View', 'Pressable', 'Animated.View'].includes(tag(n))) {
      const style = styleOf(n);
      if (/flexDirection:\s*'row'/.test(style)) {
        const kids = n.children.flatMap(children);
        // A text on one line that shrinks to fit (numberOfLines={1} + adjustsFontSizeToFit) is never
        // cut in the middle of a word.
        const shrinks = (c: El) => !!attr(c, 'adjustsFontSizeToFit') && !!attr(c, 'numberOfLines');
        const texts = kids.filter(
          (c) =>
            (tag(c) === 'Text' && !shrinks(c)) ||
            (tag(c) === 'View' &&
              ts.isJsxElement(c) &&
              c.children.flatMap(children).some((x) => tag(x) === 'Text')),
        );
        const fixed = kids.filter(
          (c) =>
            (tag(c) === 'Button' && attr(c, 'title')) || tag(c) === 'Badge' || tag(c) === 'Chip',
        );
        const wraps = /flexWrap:\s*'wrap'/.test(style);
        const squeezed = texts.some((c) => /flex:\s*1\b/.test(styleOf(c)));
        if (texts.length && fixed.length && (!wraps || squeezed)) {
          const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
          out.push(`${path.relative(ROOT, file)}:${line} (${fixed.map(tag).join(', ')})`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('no word cut by a row too narrow (every screen)', () => {
  it('no row squeezes a text next to a text button, badge or chip', () => {
    const found = files(ROOT).flatMap((f) => riskyRows(f, fs.readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });

  it('the audit catches the three cuts reported after release', () => {
    // The tonight card as it was: reason (flex: 1) and two buttons in a wrapping row.
    const tonight = `const x = (
      <View style={styles.footer}>
        <View style={{ flex: 1, gap: 2 }}><Text>{why}</Text></View>
        {onPlan ? <Button title="Prévoir" /> : null}
        <Button title="Cuisiner" />
      </View>);
    const styles = StyleSheet.create({
      footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    });`;
    const planning = `const x = (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="title1" style={{ flex: 1 }}>Planning</Text>
        <Button title="Modèles" /><Button title="Calendrier" />
      </View>);`;
    const fridge = `const x = (
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1 }}>Chez moi</Text>
        <Button title="Tout prendre" />
      </View>);`;
    for (const code of [tonight, planning, fridge])
      expect(riskyRows(path.join(ROOT, 'x.tsx'), code)).toHaveLength(1);
    // Fixed shapes pass: icons, or the text on its own line.
    const ok = `const x = (
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>Planning</Text>
        <IconButton icon="copy-outline" label="Modèles" />
      </View>);`;
    expect(riskyRows(path.join(ROOT, 'x.tsx'), ok)).toEqual([]);
  });
});
