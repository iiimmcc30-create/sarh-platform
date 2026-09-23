const { spawn, execFile } = require('child_process');
const path = require('path');
const { networkInterfaces } = require('os');
const { resolveDevApiUrls } = require('./resolve-dev-api-urls');

const API_PORT = 3001;
const SOCKET_PORT = 3002;
const EXPO_PORT = process.env.EXPO_PORT || '8081';
const ADB_TIMEOUT_MS = 45000;

function resolveAdbPath() {
  if (process.env.ANDROID_HOME) {
    return path.join(
      process.env.ANDROID_HOME,
      'platform-tools',
      process.platform === 'win32' ? 'adb.exe' : 'adb',
    );
  }
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    const winSdk = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
    if (require('fs').existsSync(winSdk)) return winSdk;
  }
  return 'adb';
}

const ADB = resolveAdbPath();

function runAdb(args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { timeout: ADB_TIMEOUT_MS }, (err, stdout, stderr) => {
      const out = `${stdout ?? ''}${stderr ?? ''}`.trim();
      if (err && !allowFailure) {
        reject(new Error(out || err.message));
        return;
      }
      resolve(out);
    }).on('error', (err) => {
      if (allowFailure) {
        resolve('');
        return;
      }
      reject(new Error(`adb not found (${ADB}): ${err.message}`));
    });
  });
}

function parseDevices(output) {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state] = line.split(/\s+/);
      return { id, state };
    });
}

async function getDeviceState() {
  try {
    const output = await runAdb(['devices']);
    const devices = parseDevices(output);
    if (devices.length === 0) return { kind: 'none' };
    const unauthorized = devices.filter((d) => d.state === 'unauthorized');
    if (unauthorized.length > 0) {
      return { kind: 'unauthorized', ids: unauthorized.map((d) => d.id) };
    }
    const ready = devices.filter((d) => d.state === 'device');
    if (ready.length > 0) {
      return { kind: 'ready', ids: ready.map((d) => d.id) };
    }
    if (devices.some((d) => d.state === 'offline')) return { kind: 'offline' };
    return { kind: 'unknown', devices };
  } catch {
    return { kind: 'unknown', devices: [] };
  }
}

function getLanIp() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address.startsWith('192.168.')) {
        return entry.address;
      }
    }
  }
  return null;
}

function printUsbHelp(state) {
  if (state.kind === 'unauthorized') {
    console.error('[start:usb] موبايل/موبايلين متصلين لكن غير مصرّح.');
    if (state.ids?.length) {
      console.error(`[start:usb] الأجهزة: ${state.ids.join(', ')}`);
    }
    console.error('[start:usb] افتح كل موبايل ووافق على "Allow USB debugging" ثم أعد المحاولة.');
    return;
  }
  if (state.kind === 'offline') {
    console.error('[start:usb] الموبايل offline — افصل الكابل وأعد توصيله.');
    return;
  }
  console.error('[start:usb] لم يُعثر على موبايل متصل.');
  console.error('[start:usb] 1) وصّل الموبايل بالUSB');
  console.error('[start:usb] 2) فعّل USB debugging من Developer options');
  console.error('[start:usb] 3) وافق على رسالة التصريح على شاشة الموبايل');
}

function printLanFallback() {
  const lanIp = getLanIp();
  if (!lanIp) return;
  console.error(`[start:usb] بديل: شغّل بالواي فاي → npm run start:lan`);
  console.error(`[start:usb] وتأكد أن EXPO_PUBLIC_API_URL=http://${lanIp}:${API_PORT}`);
}

async function applyUsbReverse(deviceId) {
  await runAdb(['-s', deviceId, 'reverse', `tcp:${API_PORT}`, `tcp:${API_PORT}`]);
  await runAdb(['-s', deviceId, 'reverse', `tcp:${SOCKET_PORT}`, `tcp:${SOCKET_PORT}`]);
  await runAdb(['-s', deviceId, 'reverse', `tcp:${EXPO_PORT}`, `tcp:${EXPO_PORT}`]);
}

async function applyUsbReverseAll(deviceIds) {
  for (const id of deviceIds) {
    await applyUsbReverse(id);
  }
}

async function setupUsbReverse(state) {
  if (state.kind === 'ready') {
    await applyUsbReverseAll(state.ids);
    const label = state.ids.length === 1 ? state.ids[0] : `${state.ids.length} devices (${state.ids.join(', ')})`;
    console.log(`[start:usb] adb reverse OK (${label}) — API :${API_PORT}, socket :${SOCKET_PORT}`);
    return {
      apiUrl: `http://127.0.0.1:${API_PORT}`,
      socketUrl: `http://127.0.0.1:${SOCKET_PORT}`,
      deviceIds: state.ids,
    };
  }

  throw new Error('no_ready_device');
}

async function openAppOnAllDevices(deviceIds = []) {
  if (!deviceIds.length) return;

  for (const id of deviceIds) {
    console.log(`[start:usb] Opening app on ${id}...`);

    try {
      await runAdb([
        '-s',
        id,
        'shell',
        'monkey',
        '-p',
        'com.sarh.app',
        '1',
      ]);

      console.log(`[start:usb] App opened on ${id}`);
    } catch (e) {
      console.warn(
        `[start:usb] Failed on ${id}: ${
          e instanceof Error ? e.message : e
        }`,
      );
    }
  }
}

function watchMetroReadyAndOpen(expo, deviceIds) {
  let opened = false;

  function handle(chunk, stream) {
    const text = chunk.toString();

    stream.write(chunk);

    if (opened) return;

    if (
      text.includes('Metro waiting on') ||
      text.includes('Logs for your project will appear below')
    ) {
      opened = true;

      setTimeout(() => {
        openAppOnAllDevices(deviceIds).catch(console.error);
      }, 1000);
    }
  }

  expo.stdout?.on('data', (c) => handle(c, process.stdout));
  expo.stderr?.on('data', (c) => handle(c, process.stderr));
}

async function main() {
  let state;
  try {
    state = await getDeviceState();
  } catch (err) {
    console.error('[start:usb] adb error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  if (state.kind !== 'ready') {
    printUsbHelp(state);
    printLanFallback();
    process.exit(1);
  }

  let urls;
  try {
    urls = await setupUsbReverse(state);
    const remote = resolveDevApiUrls(null);
    if (remote.mode === 'remote') {
      urls = { ...urls, apiUrl: remote.apiUrl, socketUrl: remote.socketUrl };
      console.log('[start:usb] Remote API:', remote.apiUrl);
    }
  } catch (err) {
    console.error('[start:usb] adb error:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const expoPort = EXPO_PORT;

  console.log('[start:usb] Starting Expo on port', expoPort);

  const expo = spawn(
    'npx',
    ['expo', 'start', '--dev-client', '--localhost', '--clear', '--port', expoPort],
    {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        EXPO_PUBLIC_API_URL: urls.apiUrl,
        EXPO_PUBLIC_SOCKET_URL: urls.socketUrl,
      },
    },
  );

  watchMetroReadyAndOpen(expo, urls.deviceIds ?? []);

  expo.on('exit', (code) => process.exit(code ?? 0));
}

/** Best-effort USB reverse (Metro / dev). Does not exit the process on failure. */
async function trySetupUsbReverse() {
  try {
    const state = await getDeviceState();
    // Always re-apply — Expo may only reverse :8081; reconnecting USB clears rules.
    return state.kind === 'ready' ? await setupUsbReverse(state) : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== 'no_ready_device') {
      console.warn('[usb] adb reverse:', msg);
    }
    return null;
  }
}

const DEBUG_APK = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

/** Install the debug APK on every connected authorized device. */
async function installApkOnAllDevices(apkPath = DEBUG_APK) {
  const fs = require('fs');
  if (!fs.existsSync(apkPath)) {
    throw new Error(`APK not found: ${apkPath}`);
  }
  const state = await getDeviceState();
  if (state.kind !== 'ready') {
    throw new Error('no_ready_device');
  }
  for (const id of state.ids) {
    console.log(`[start:usb] installing APK on ${id}...`);
    await runAdb(['-s', id, 'install', '-r', '-d', apkPath]);
  }
  return state.ids;
}

module.exports = {
  setupUsbReverse,
  trySetupUsbReverse,
  applyUsbReverse,
  applyUsbReverseAll,
  getDeviceState,
  installApkOnAllDevices,
};

if (require.main === module) {
  main();
}
