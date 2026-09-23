/**
 * Install debug APK on every connected authorized Android device.
 */
const path = require('path');
const { execFile } = require('child_process');
const { installApkOnAllDevices, getDeviceState } = require('./start-usb.js');

const DEBUG_APK = path.join(__dirname, '..', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function printUsbHelp(state) {
  if (state?.kind === 'unauthorized') {
    console.error('[android:install-all] الموبايل متصل لكن USB debugging غير مصرّح.');
    console.error('[android:install-all] وافقي على "Allow USB debugging" على شاشة الموبايل.');
    return;
  }
  if (state?.kind === 'offline') {
    console.error('[android:install-all] الموبايل offline — افصلي الكابل وأعيدي التوصيل.');
    return;
  }
  console.error('[android:install-all] لم يُعثر على موبايل متصل عبر USB.');
  console.error('[android:install-all] 1) وصّلي الموبايلين بالUSB');
  console.error('[android:install-all] 2) فعّلي USB debugging');
  console.error('[android:install-all] 3) وافقي على رسالة التصريح');
}

function restartAdb() {
  return new Promise((resolve) => {
    const adb = process.env.ANDROID_HOME
      ? `${process.env.ANDROID_HOME}\\platform-tools\\adb.exe`
      : 'adb';
    execFile(adb, ['start-server'], { timeout: 20000 }, () => resolve());
  });
}

async function main() {
  const fs = require('fs');
  if (!fs.existsSync(DEBUG_APK)) {
    console.error('[android:install-all] ملف APK غير موجود:');
    console.error(`  ${DEBUG_APK}`);
    console.error('[android:install-all] شغّلي البناء أولاً: npm run android:rebuild');
    process.exit(1);
  }

  await restartAdb();
  const state = await getDeviceState();
  if (state.kind !== 'ready') {
    printUsbHelp(state);
    console.error('[android:install-all] إذا adb معلّق: taskkill /F /IM adb.exe ثم adb devices');
    process.exit(1);
  }

  const ids = await installApkOnAllDevices(DEBUG_APK);
  console.log(`[android:install-all] تم التثبيت على: ${ids.join(', ')}`);
}

main().catch((err) => {
  const msg = err?.message || String(err);
  if (msg === 'no_ready_device') {
    printUsbHelp();
  } else {
    console.error('[android:install-all]', msg);
  }
  process.exit(1);
});
