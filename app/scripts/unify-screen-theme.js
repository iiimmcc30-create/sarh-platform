/**
 * One-off: unify screen root backgrounds to colors.screenRoot (dark = transparent).
 * Run: node scripts/unify-screen-theme.js
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..', 'app');

const SCREEN_ROOT_KEYS = new Set([
  'screen',
  'container',
  'root',
  'safe',
  'page',
  'wrapper',
  'shell',
]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, files);
    } else if (name.endsWith('.tsx') || name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function patchFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const original = src;

  // flex:1 screen roots
  src = src.replace(
    /(\b(?:screen|container|root|safe|page|wrapper|shell)\s*:\s*\{\s*flex\s*:\s*1\s*,\s*)backgroundColor\s*:\s*colors\.bgDeep/g,
    '$1backgroundColor: colors.screenRoot',
  );

  // multiline screen roots with flex:1 then backgroundColor on next lines
  src = src.replace(
    /(\b(?:screen|container|root|safe|page|wrapper|shell)\s*:\s*\{[^}]*?flex\s*:\s*1[^}]*?)backgroundColor\s*:\s*colors\.bgDeep/g,
    '$1backgroundColor: colors.screenRoot',
  );

  // ScreenHeader / header bars with minHeight (not flex:1 only)
  src = src.replace(
    /(container\s*:\s*\{[\s\S]*?minHeight\s*:[^}]*?)backgroundColor\s*:\s*colors\.bgDeep/g,
    (match) => {
      if (filePath.includes('ScreenHeader')) {
        return match.replace('colors.bgDeep', 'colors.screenRoot');
      }
      return match;
    },
  );

  if (src !== original) {
    fs.writeFileSync(filePath, src, 'utf8');
    return true;
  }
  return false;
}

const files = walk(APP_DIR);
let count = 0;
for (const f of files) {
  if (patchFile(f)) {
    count++;
    console.log('patched', path.relative(APP_DIR, f));
  }
}
console.log(`Done. ${count} files patched.`);
