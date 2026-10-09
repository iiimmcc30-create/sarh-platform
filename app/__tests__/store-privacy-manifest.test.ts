// App Store "required reason API" declarations + Android storage permissions.
// React Native, AsyncStorage, expo-file-system, expo-device, expo-constants and
// expo-notifications read these APIs; when their pods are linked statically the
// per-pod manifests can be dropped, so the app-level manifest must cover them.
import appJson from '../app.json';

type ApiType = { NSPrivacyAccessedAPIType: string; NSPrivacyAccessedAPITypeReasons: string[] };

const expo = (appJson as { expo: any }).expo;
const manifest = expo.ios.privacyManifests;

function reasonsFor(category: string): string[] {
  const entry = (manifest.NSPrivacyAccessedAPITypes as ApiType[]).find(
    (t) => t.NSPrivacyAccessedAPIType === `NSPrivacyAccessedAPICategory${category}`,
  );
  return entry?.NSPrivacyAccessedAPITypeReasons ?? [];
}

describe('store privacy manifest', () => {
  it('declares no tracking', () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
  });

  it('declares every required-reason API the bundled native modules use', () => {
    expect(reasonsFor('UserDefaults')).toContain('CA92.1');
    expect(reasonsFor('FileTimestamp')).toEqual(expect.arrayContaining(['C617.1', '0A2A.1', '3B52.1']));
    expect(reasonsFor('SystemBootTime')).toContain('35F9.1');
    expect(reasonsFor('DiskSpace')).toEqual(expect.arrayContaining(['E174.1', '85F4.1']));
  });

  it('never ships broad Android storage access (the system photo picker needs none)', () => {
    const requested: string[] = expo.android.permissions;
    const blocked: string[] = expo.android.blockedPermissions;
    for (const p of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE']) {
      expect(requested).not.toContain(`android.permission.${p}`);
      expect(blocked).toContain(`android.permission.${p}`);
    }
  });
});
