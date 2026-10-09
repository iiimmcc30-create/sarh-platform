import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** «الإصدار 1.0.0 (12)» from the running app config (no hard-coded number). */
export function appVersionLabel(): string {
  const cfg = Constants.expoConfig;
  const version = cfg?.version ?? '1.0.0';
  const build =
    Platform.OS === 'ios'
      ? cfg?.ios?.buildNumber
      : Platform.OS === 'android'
        ? cfg?.android?.versionCode
        : undefined;
  return build ? `سرح · الإصدار ${version} (${build})` : `سرح · الإصدار ${version}`;
}
