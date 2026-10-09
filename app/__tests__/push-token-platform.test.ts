const mockGetExpoPushTokenAsync = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  getDevicePushTokenAsync: (...args: unknown[]) => mockGetDevicePushTokenAsync(...args),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    executionEnvironment: 'standalone',
    expoConfig: { extra: { eas: { projectId: 'proj-123' } } },
  },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  multiGet: jest.fn(),
}));

import { Platform } from 'react-native';
import { fetchPlatformPushToken } from '@/lib/notifications';

function setOS(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
}

describe('push token per platform (iOS → Expo push token, Android → FCM)', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockGetExpoPushTokenAsync.mockReset();
    mockGetDevicePushTokenAsync.mockReset();
  });

  afterAll(() => setOS(originalOS as 'ios' | 'android'));

  it('iOS registers an Expo push token with the EAS project id (not a raw APNs token)', async () => {
    setOS('ios');
    mockGetExpoPushTokenAsync.mockResolvedValue({
      type: 'expo',
      data: 'ExponentPushToken[abc]',
    });
    await expect(fetchPlatformPushToken()).resolves.toBe('ExponentPushToken[abc]');
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'proj-123',
    });
    expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('Android keeps the native FCM registration token', async () => {
    setOS('android');
    mockGetDevicePushTokenAsync.mockResolvedValue({
      type: 'android',
      data: 'fcm:token',
    });
    await expect(fetchPlatformPushToken()).resolves.toBe('fcm:token');
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});
