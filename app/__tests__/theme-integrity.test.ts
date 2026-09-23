import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');

const SCAN_DIRS = ['app', 'components', 'constants', 'design-system'];
const SKIP_DIR = new Set(['__tests__', 'e2e', 'node_modules', '.expo', 'dist']);

/** Live theme objects that StyleSheet.create copies by value at call time. */
const LIVE_THEME_REF = /\b(colors|themeColors|gradients|shadow)\.\w+/;

function stripComments(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

/**
 * Module-scope `const x = StyleSheet.create(...)` only.
 * Factories (`function createStyles(colors) { return StyleSheet.create(...) }`)
 * and render-time `useThemedStyles(() => StyleSheet.create(...))` are allowed.
 */
function moduleScopeStyleSheets(src: string): Array<{ name: string; body: string }> {
  const text = stripComments(src);
  const re = /^(?:export\s+)?const\s+(\w+)\s*=\s*StyleSheet\.create\(/gm;
  const hits: Array<{ name: string; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let i = start;
    let quote: string | null = null;
    let esc = false;
    while (i < text.length) {
      const ch = text[i];
      if (quote) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
      } else if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          hits.push({ name: match[1], body: text.slice(match.index, i + 1) });
          break;
        }
      }
      i += 1;
    }
  }
  return hits;
}

describe('Theme integrity — module-scope StyleSheet must not freeze live colors', () => {
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(root, dir)));

  it('scans the UI tree', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no module-scope StyleSheet.create that reads live theme objects', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const sheet of moduleScopeStyleSheets(src)) {
        if (LIVE_THEME_REF.test(sheet.body)) {
          offenders.push(`${path.relative(root, file)} [${sheet.name}]`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not keep a public frozen darkTheme snapshot', () => {
    const barrel = readFileSync(path.join(root, 'design-system/index.ts'), 'utf8');
    expect(barrel).not.toMatch(/\bdarkTheme\b/);
    expect(barrel).toContain('semantic');
    const themeMod = readFileSync(path.join(root, 'design-system/theme/dark.ts'), 'utf8');
    expect(themeMod).toContain('get background()');
    expect(themeMod).not.toMatch(/export const semantic = \{[\s\S]*?\}\s*as const/);
  });

  it('gives ScreenHeader the same responsive gutter as ScreenBody', () => {
    const header = readFileSync(path.join(root, 'components/layout/ScreenHeader.tsx'), 'utf8');
    expect(header).toContain("from '@/hooks/useLayout'");
    expect(header).toContain('paddingHorizontal: gutter');
    expect(stripComments(header)).not.toMatch(/paddingHorizontal:\s*spacing\.lg/);
    expect(stripComments(header)).not.toMatch(/\.\.\.typography\./);
  });
});
