/**
 * USB debug build: adb reverse on all devices, then expo run:android.
 * Use android:dev (expo start only) for daily JS work — much faster.
 *
 * Skip USB checks (e.g. adb stuck): SAFAT_SKIP_USB=1 npm run android:rebuild
 */
const { spawn } = require('child_process');
const path = require('path');

const skipBundler = process.argv.includes('--no-bundler');

function printUsbHelp(state) {
  if (state?.kind === 'unauthorized') {
    console.error('[android:usb] الموبايل متصل لكن USB debugging غير مصرّح.');
    console.error('[android:usb] وافقي على "Allow USB debugging" على شاشة الموبايل.');
    return;
  }
  if (state?.kind === 'offline') {
    console.error('[android:usb] الموبايل offline — افصلي الكابل وأعيدي التوصيل.');
    return;
  }
  console.error('[android:usb] لم يُعثر على موبايل متصل عبر USB.');
  console.error('[android:usb] 1) وصّلي الموبايل بالUSB');
  console.error('[android:usb] 2) فعّلي USB debugging من Developer options');
  console.error('[android:usb] 3) وافقي على رسالة التصريح على الموبايل');
}

async function loadUsbSetup() {
  if (process.env.SAFAT_SKIP_USB === '1') {
    console.warn('[android:usb] SAFAT_SKIP_USB=1 — تخطي adb reverse');
    return {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3001',
      socketUrl: process.env.EXPO_PUBLIC_SOCKET_URL || 'http://127.0.0.1:3002',
      deviceIds: [],
    };
  }

  const mod = require('./start-usb.js');
  let state;
  try {
    state = await mod.getDeviceState();
  } catch (err) {
    throw new Error(`adb فشل: ${err instanceof Error ? err.message : err}`);
  }

  if (state.kind !== 'ready') {
    printUsbHelp(state);
    throw new Error('no_ready_device');
  }

  return mod.setupUsbReverse(state);
}

async function main() {
  let urls;
  try {
    urls = await loadUsbSetup();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg !== 'no_ready_device') {
      console.error('[android:usb]', msg);
    }
    console.error('[android:usb] إذا adb معلّق: adb kill-server ثم adb start-server');
    console.error('[android:usb] أو: $env:SAFAT_SKIP_USB=1; npm run android:rebuild');
    process.exit(1);
  }

  const deviceIds = urls.deviceIds ?? [];
  const serial = process.env.ANDROID_SERIAL || deviceIds[0];

  console.log('[android:usb] API →', urls.apiUrl);
  console.log('[android:usb] Socket →', urls.socketUrl);
  if (deviceIds.length > 1) {
    console.log('[android:usb] أجهزة متصلة:', deviceIds.join(', '));
    console.log('[android:usb] التثبيت على:', serial);
    console.log('[android:usb] بعد البناء: npm run android:install-all لتثبيت على الباقي');
  } else if (serial) {
    console.log('[android:usb] الجهاز:', serial);
  }
  console.log('[android:usb] تأكدي أن الباك إند شغال: cd backend && npm run dev:all');
  console.log('[android:usb] Gradle قد يستغرق 1-3 دقائق — انتظري حتى يكتمل البناء');

  const expoArgs = ['expo', 'run:android'];
  if (skipBundler) {
    expoArgs.push('--no-bundler');
  }

  const useUsbLocalhost =
    urls.apiUrl.includes('127.0.0.1') || urls.apiUrl.includes('localhost');

  const child = spawn('npx', expoArgs, {
    stdio: 'inherit',
    shell: true,
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      EXPO_PUBLIC_API_URL: urls.apiUrl,
      EXPO_PUBLIC_SOCKET_URL: urls.socketUrl,
      ...(useUsbLocalhost
        ? {
            REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
            RCT_METRO_PORT: process.env.EXPO_PORT || '8081',
          }
        : {}),
      ...(serial ? { ANDROID_SERIAL: serial } : {}),
      SAFAT_USB_REVERSE_DONE: '1',
      ORG_GRADLE_PROJECT_reactNativeArchitectures: 'arm64-v8a',
    },
  });

  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error('[android:usb] خطأ غير متوقع:', err instanceof Error ? err.message : err);
  process.exit(1);
});
