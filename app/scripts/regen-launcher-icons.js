const sharp = require('../../backend-nest/node_modules/sharp');
const fs = require('fs');
const path = require('path');

const src = path.join('assets', 'images', 'adaptive-icon.png');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fgSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

async function main() {
  for (const [d, s] of Object.entries(sizes)) {
    const dir = path.join('android', 'app', 'src', 'main', 'res', `mipmap-${d}`);
    await sharp(src).resize(s, s, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(src).resize(s, s, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  }
  for (const [d, s] of Object.entries(fgSizes)) {
    const dir = path.join('android', 'app', 'src', 'main', 'res', `mipmap-${d}`);
    await sharp(src)
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }

  fs.writeFileSync(
    path.join('android', 'app', 'src', 'main', 'res', 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#284E39"/>
</shape>
`,
  );

  // Prefer PNG over webp for launcher to avoid AAPT conflicts
  for (const d of Object.keys(sizes)) {
    const dir = path.join('android', 'app', 'src', 'main', 'res', `mipmap-${d}`);
    for (const name of [
      'ic_launcher.webp',
      'ic_launcher_round.webp',
      'ic_launcher_foreground.webp',
    ]) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }

  console.log('launcher icons regenerated');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
