/**
 * Mechanical RTL text helper migration — run once: node scripts/fix-rtl-text-align.js
 * Replaces hardcoded textAlign/writingDirection pairs in StyleSheet blocks.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.expo', 'scripts', 'constants/flaticon-glyphs.ts']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !full.endsWith('lib/rtl.ts')) out.push(full);
  }
  return out;
}

function patchFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  if (!src.includes("textAlign: 'right'") && !src.includes('textAlign: "right"')) return false;

  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'lib/rtl.ts') return false;

  let changed = false;

  // Pair: textAlign right + writingDirection rtl
  const pairRe =
    /textAlign:\s*['"]right['"],\s*\n(\s*)writingDirection:\s*['"]rtl['"],/g;
  if (pairRe.test(src)) {
    src = src.replace(
      pairRe,
      "...getRtlText(),\n$1",
    );
    changed = true;
  }

  // Lone textAlign right (keep if already has getRtlText nearby)
  const loneRe = /textAlign:\s*['"]right['"],/g;
  if (loneRe.test(src) && !src.includes('getRtlText()')) {
    src = src.replace(loneRe, '...getRtlText(),');
    changed = true;
  }

  if (!changed) return false;

  const importLine = "import { getRtlText } from '@/lib/rtl';";
  if (!src.includes("from '@/lib/rtl'")) {
    const lines = src.split('\n');
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) insertAt = i + 1;
      else if (insertAt > 0 && !lines[i].startsWith('import ')) break;
    }
    lines.splice(insertAt, 0, importLine);
    src = lines.join('\n');
  } else if (!src.includes('getRtlText')) {
    src = src.replace(
      /from '@\/lib\/rtl';/,
      (m, offset) => {
        const lineStart = src.lastIndexOf('import ', offset);
        const line = src.slice(lineStart, src.indexOf('\n', lineStart));
        if (line.includes('getRtlText')) return m;
        return line.replace('{', '{ getRtlText, ').replace('{  ', '{ ');
      },
    );
    src = src.replace(
      /import \{([^}]+)\} from '@\/lib\/rtl';/,
      (_, names) => {
        const set = new Set(
          names.split(',').map((s) => s.trim()).filter(Boolean),
        );
        set.add('getRtlText');
        return `import { ${[...set].join(', ')} } from '@/lib/rtl';`;
      },
    );
  }

  fs.writeFileSync(file, src, 'utf8');
  console.log('patched', rel);
  return true;
}

let count = 0;
for (const file of walk(ROOT)) {
  if (patchFile(file)) count += 1;
}
console.log(`Done. ${count} files patched.`);
