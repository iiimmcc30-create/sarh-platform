import { readFileSync } from 'fs';
import path from 'path';

const app = JSON.parse(readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
const plugin = (name: string) =>
  (app.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === name) as [string, Record<string, unknown>];
const arabic = /[\u0600-\u06FF]/;

describe('iOS permission purpose strings (App Review 5.1.1)', () => {
  const keys = [
    'NSCameraUsageDescription',
    'NSPhotoLibraryUsageDescription',
    'NSMicrophoneUsageDescription',
    'NSLocationWhenInUseUsageDescription',
  ];

  it('declares specific Arabic purpose strings in infoPlist', () => {
    for (const k of keys) {
      const v = app.ios.infoPlist[k] as string;
      expect(v).toMatch(arabic);
      expect(v.length).toBeGreaterThan(40);
      expect(v).not.toMatch(/\$\(PRODUCT_NAME\)|Allow /);
    }
  });

  it('plugins pass the same strings so their English defaults never win', () => {
    const ip = app.ios.infoPlist;
    const picker = plugin('expo-image-picker')[1];
    expect(picker.photosPermission).toBe(ip.NSPhotoLibraryUsageDescription);
    expect(picker.cameraPermission).toBe(ip.NSCameraUsageDescription);
    expect(picker.microphonePermission).toBe(ip.NSMicrophoneUsageDescription);
    expect(plugin('expo-audio')[1].microphonePermission).toBe(ip.NSMicrophoneUsageDescription);
    expect(plugin('expo-location')[1].locationWhenInUsePermission).toBe(
      ip.NSLocationWhenInUseUsageDescription,
    );
  });

  it('location is when-in-use only (no Always keys, no background location)', () => {
    const loc = plugin('expo-location')[1];
    expect(loc.locationAlwaysAndWhenInUsePermission).toBe(false);
    expect(loc.locationAlwaysPermission).toBe(false);
    expect(loc.isIosBackgroundLocationEnabled).toBe(false);
    expect(app.ios.infoPlist.UIBackgroundModes).not.toContain('location');
    expect(app.android.permissions).not.toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    for (const file of ['app/chat.tsx', 'lib/listingLocation.ts', 'lib/deviceCity.ts']) {
      const text = readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(text).not.toContain('requestBackgroundPermissionsAsync');
    }
  });
});
