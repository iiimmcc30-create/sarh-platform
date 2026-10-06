import { PermissionsAndroid, Platform } from 'react-native';

export async function ensureLivePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const needed = [
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ];

  const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
    && await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

  if (already) return true;

  const result = await PermissionsAndroid.requestMultiple(needed);
  return (
    result[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED
    && result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED
  );
}

/**
 * «المجالس»: microphone only (no camera). Asked right before a member goes on stage.
 * On iOS the system prompt is shown by the audio SDK on first mic use.
 */
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const mic = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(mic)) return true;
  const result = await PermissionsAndroid.request(mic);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
