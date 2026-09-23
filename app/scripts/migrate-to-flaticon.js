/**
 * One-time migration: replace Ionicons/MaterialCommunityIcons with AppIcon.
 * Run: node scripts/migrate-to-flaticon.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set([
  path.join(ROOT, 'components', 'ui', 'FlaticonIcon.tsx'),
  path.join(ROOT, 'lib', 'flaticonIconSets.ts'),
]);

const APP_ICON_IMPORT = "import { AppIcon } from '@/components/ui/FlaticonIcon';";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function migrateFile(filePath) {
  if (SKIP.has(filePath)) return false;

  let src = fs.readFileSync(filePath, 'utf8');
  if (!src.includes('@expo/vector-icons')) return false;

  const hadVectorIcons = /Ionicons|MaterialCommunityIcons/.test(src);

  // Remove vector-icons import lines (single or combined)
  src = src.replace(
    /^import\s+\{[^}]*\}\s+from\s+'@expo\/vector-icons';\r?\n/gm,
    '',
  );

  if (hadVectorIcons && !src.includes("from '@/components/ui/FlaticonIcon'")) {
    const lines = src.split(/\r?\n/);
    let insertAt = 0;
    while (insertAt < lines.length && lines[insertAt].startsWith('//')) insertAt++;
    lines.splice(insertAt, 0, APP_ICON_IMPORT);
    src = lines.join('\n');
  }

  src = src.replace(/<Ionicons\b/g, '<AppIcon');
  src = src.replace(/<MaterialCommunityIcons\b/g, '<AppIcon');

  // Type cleanups
  src = src.replace(/keyof typeof Ionicons\.glyphMap/g, 'string');
  src = src.replace(/keyof typeof MaterialCommunityIcons\.glyphMap/g, 'string');
  src = src.replace(/\s+as keyof typeof Ionicons\.glyphMap/g, '');
  src = src.replace(/\s+as keyof typeof MaterialCommunityIcons\.glyphMap/g, '');
  src = src.replace(/name=\{([^}]+) as any\}/g, 'name={$1}');

  // Sidebar IconComponent pattern
  src = src.replace(
    /const IconComponent = item\.iconSet === 'ion' \? Ionicons : MaterialCommunityIcons;\s*\n/g,
    '',
  );
  src = src.replace(
    /<IconComponent name=\{item\.icon as any\}/g,
    '<AppIcon name={item.icon}',
  );

  fs.writeFileSync(filePath, src, 'utf8');
  return true;
}

let count = 0;
for (const file of walk(path.join(ROOT, 'app'))) {
  if (migrateFile(file)) count++;
}
for (const file of walk(path.join(ROOT, 'components'))) {
  if (migrateFile(file)) count++;
}

console.log(`[migrate] Updated ${count} files.`);
