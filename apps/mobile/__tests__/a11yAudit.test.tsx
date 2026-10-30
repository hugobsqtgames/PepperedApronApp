/**
 * Accessibility audit of every screen and component, read from the source: what VoiceOver,
 * Voice Control, Smart Invert and Dynamic Type need, checked on each element.
 */
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { Text } from '../src/ui/Text';

const ROOT = path.join(__dirname, '../src');
const files: string[] = [];
const walk = (d: string) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
};
walk(ROOT);

interface El {
  file: string;
  line: number;
  tag: string;
  props: string;
  body: string;
}

/** JSX elements named `tag`: their props (opening tag) and their content. */
function elements(tag: string): El[] {
  const out: El[] = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const re = new RegExp(`<${tag}(?=[\\s>/])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      // End of the opening tag: the first ">" outside braces and strings.
      let i = m.index + tag.length + 1;
      let depth = 0;
      let quote: string | null = null;
      for (; i < src.length; i++) {
        const c = src[i]!;
        if (quote) {
          if (c === quote && src[i - 1] !== '\\') quote = null;
        } else if (c === '"' || c === "'" || c === '`') quote = c;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '>' && depth === 0) break;
      }
      const props = src.slice(m.index, i + 1);
      let body = '';
      if (!props.endsWith('/>')) {
        // Content up to the matching closing tag (same-name nesting counted).
        const open = new RegExp(`<${tag}(?=[\\s>/])|</${tag}>`, 'g');
        open.lastIndex = i + 1;
        let level = 1;
        let k: RegExpExecArray | null;
        while ((k = open.exec(src))) {
          level += k[0].startsWith('</') ? -1 : 1;
          if (level === 0) {
            body = src.slice(i + 1, k.index);
            break;
          }
        }
      }
      out.push({
        file: path.relative(ROOT, file),
        line: src.slice(0, m.index).split('\n').length,
        tag,
        props,
        body,
      });
    }
  }
  return out;
}
const where = (e: El) => `${e.file}:${e.line}`;

describe('accessibility audit', () => {
  it('every touchable has a role and a name (VoiceOver, Voice Control)', () => {
    const bad = elements('Pressable')
      .filter((e) => !/accessible=\{false\}/.test(e.props))
      .filter(
        (e) =>
          !/accessibilityRole=/.test(e.props) ||
          !(/accessibilityLabel=/.test(e.props) || /<Text[\s>]/.test(e.body)),
      )
      .map(where);
    expect(bad).toEqual([]);
  });

  it('a long press is also offered as a VoiceOver action', () => {
    const bad = elements('Pressable')
      .filter(
        (e) =>
          /onLongPress=/.test(e.props) &&
          !/accessibilityActions=|\.\.\.longPressActions\(/.test(e.props),
      )
      .map(where);
    expect(bad).toEqual([]);
  });

  it('photos are not inverted by Smart Invert', () => {
    const bad = elements('Image')
      .filter((e) => !/accessibilityIgnoresInvertColors/.test(e.props))
      .map(where);
    expect(bad).toEqual([]);
  });

  it('text always follows the Dynamic Type size', () => {
    const bad = files
      .filter((f) => /allowFontScaling=\{false\}/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(bad).toEqual([]);
  });

  it('touch targets are at least 44 pt', () => {
    // IconButton is the only touchable with a free size; its hitSlop adds 10 pt on each side.
    const src = fs.readFileSync(path.join(ROOT, 'theme/tokens.ts'), 'utf8');
    const slop = Number(src.match(/hitSlop = \{ top: (\d+)/)![1]);
    const bad = elements('IconButton')
      .filter((e) => {
        const m = e.props.match(/size=\{(\d+)\}/);
        return m && Number(m[1]) + slop * 2 < 44;
      })
      .map(where);
    expect(bad).toEqual([]);
  });
});

describe('largest text sizes', () => {
  it('body text follows Dynamic Type up to the accessibility sizes (AX5 ≈ ×3.1)', async () => {
    await render(<Text>Recette</Text>);
    expect(screen.getByText('Recette').props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(3.1);
  });
});
