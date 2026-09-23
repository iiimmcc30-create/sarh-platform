/**
 * Wi‑Fi dev: start Metro + generate QR for the installed سرح dev app.
 * Usage: npm run start:qr
 */
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { networkInterfaces } = require('os');

const { resolveDevApiUrlsAsync } = require('./resolve-dev-api-urls');

const API_PORT = 3001;
const SOCKET_PORT = 3002;
const EXPO_PORT = process.env.EXPO_PORT || '8081';
/** Expo project slug (EAS). Dev-client URLs use exp+{slug}, not the store scheme. */
const EXPO_SLUG = 'safat';
const ROOT = path.join(__dirname, '..');
const QR_PATH = path.join(ROOT, 'expo-qr.png');

function getLanIp() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        if (
          entry.address.startsWith('192.168.') ||
          entry.address.startsWith('10.') ||
          entry.address.startsWith('172.')
        ) {
          return entry.address;
        }
      }
    }
  }
  return null;
}

function buildDevClientUrl(lanIp, port = EXPO_PORT) {
  const metroUrl = `http://${lanIp}:${port}`;
  return `exp+${EXPO_SLUG}://expo-development-client/?url=${encodeURIComponent(metroUrl)}`;
}

function buildExpoGoUrl(lanIp, port = EXPO_PORT) {
  return `exp://${lanIp}:${port}`;
}

function downloadQr(data, outPath) {
  return new Promise((resolve, reject) => {
    const url =
      'https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=' +
      encodeURIComponent(data);
    const file = fs.createWriteStream(outPath);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`QR download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(outPath)));
      })
      .on('error', reject);
  });
}

function openFile(filePath) {
  if (process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', filePath], () => {});
  } else if (process.platform === 'darwin') {
    execFile('open', [filePath], () => {});
  } else {
    execFile('xdg-open', [filePath], () => {});
  }
}

function killProjectMetro() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve();
      return;
    }
    const appPath = ROOT.replace(/\\/g, '\\\\');
    const timer = setTimeout(() => resolve(), 8000);
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$root = '${ROOT.replace(/'/g, "''")}'; ` +
          'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" -ErrorAction SilentlyContinue | ' +
          'Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$root*") -and ($_.CommandLine -match "expo|metro|@expo/cli") } | ' +
          'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
      ],
      () => {
        clearTimeout(timer);
        resolve();
      },
    ).on('error', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function isPortListening(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(false);
      return;
    }
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { 'yes' }`,
      ],
      (_err, stdout) => resolve(String(stdout ?? '').trim() === 'yes'),
    ).on('error', () => resolve(false));
  });
}

async function resolveExpoPort() {
  const preferred = Number(process.env.EXPO_PORT) || 8081;
  for (let port = preferred; port < preferred + 10; port += 1) {
    if (!(await isPortListening(port))) return String(port);
  }
  return String(preferred);
}

function killPort(port) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve();
      return;
    }
    const timer = setTimeout(() => resolve(), 4000);
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess; if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }`,
      ],
      () => {
        clearTimeout(timer);
        resolve();
      },
    ).on('error', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function clearMetroCache() {
  const targets = [
    path.join(ROOT, '.expo'),
    path.join(ROOT, 'node_modules', '.cache'),
  ];
  for (const target of targets) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function main() {
  const lanIp = getLanIp();
  if (!lanIp) {
    console.error('[start:qr] لم يُعثر على IP للشبكة المحلية. اتصل بالواي فاي.');
    process.exit(1);
  }

  await killProjectMetro();
  const expoPort = await resolveExpoPort();
  if (expoPort !== (process.env.EXPO_PORT || '8081')) {
    console.log(`[start:qr] المنفذ ${process.env.EXPO_PORT || '8081'} مشغول — استخدام ${expoPort}`);
  }
  await killPort(expoPort);
  clearMetroCache();

  const devClientUrl = buildDevClientUrl(lanIp, expoPort);
  const expoGoUrl = buildExpoGoUrl(lanIp, expoPort);
  const resolved = await resolveDevApiUrlsAsync(lanIp);
  const apiUrl = resolved.apiUrl;
  const socketUrl = resolved.socketUrl;
  const mode = resolved.mode;
  const webSameOrigin = mode === 'remote' ? 'false' : process.env.EXPO_PUBLIC_WEB_SAME_ORIGIN;

  try {
    await downloadQr(devClientUrl, QR_PATH);
    openFile(QR_PATH);
    console.log('[start:qr] تم إنشاء QR:', QR_PATH);
  } catch (err) {
    console.warn('[start:qr] تعذّر إنشاء صورة QR:', err instanceof Error ? err.message : err);
  }

  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  سرح — تشغيل Metro للواي فاي');
  console.log('══════════════════════════════════════════');
  console.log('  IP:', lanIp);
  console.log('  Dev app (امسح QR):', devClientUrl);
  console.log('  Expo Go (بديل):', expoGoUrl);
  const remoteLabel =
    mode === 'remote' || mode === 'railway-fallback' ? '(Railway)' : '';
  console.log('  API:', apiUrl, remoteLabel);
  console.log('  Socket:', socketUrl, remoteLabel);
  console.log('  DevTools:', `http://localhost:${expoPort}`);
  console.log('');
  console.log('  1) ثبّت التطبيق أولاً: npm run android');
  console.log('  2) نفس شبكة Wi‑Fi للهاتف والكمبيوتر');
  console.log('  3) امسح expo-qr.png من تطبيق سرح المثبّت');
  console.log('══════════════════════════════════════════');
  console.log('');

  const expo = spawn(
    'npx',
    [
      'expo',
      'start',
      '--dev-client',
      '--lan',
      '--clear',
      '--port',
      expoPort,
      '--max-workers',
      '2',
    ],
    {
      stdio: 'inherit',
      shell: true,
      cwd: ROOT,
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: apiUrl,
        EXPO_PUBLIC_SOCKET_URL: socketUrl,
        EXPO_PUBLIC_WEB_SAME_ORIGIN: webSameOrigin ?? 'false',
        EXPO_NO_DOTENV: '1',
        EXPO_NO_METRO_WORKSPACE_ROOT: '1',
        EXPO_PORT: expoPort,
        RCT_METRO_PORT: expoPort,
        WATCHMAN_DISABLE: '1',
        METRO_DISABLE_WATCHMAN: '1',
        // Polling retriggers rebuild loops on Windows during bundle writes — avoid it.
        CHOKIDAR_USEPOLLING: '0',
      },
    },
  );

  expo.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error('[start:qr]', err instanceof Error ? err.message : err);
  process.exit(1);
});
