export async function reverseGeocodeAsync() {
  return [];
}

export const Accuracy = { Balanced: 3 };

export const __mock = {
  permission: { status: 'granted', canAskAgain: true } as { status: string; canAskAgain: boolean },
  position: null as null | { coords: { latitude: number; longitude: number } },
};

export async function getForegroundPermissionsAsync() {
  return __mock.permission;
}

export async function requestForegroundPermissionsAsync() {
  return __mock.permission;
}

export async function getCurrentPositionAsync() {
  if (!__mock.position) throw new Error('no position');
  return __mock.position;
}

export async function getLastKnownPositionAsync() {
  return __mock.position;
}

export type LocationObject = { coords: { latitude: number; longitude: number } };

export default {
  reverseGeocodeAsync,
  Accuracy,
  getForegroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  getCurrentPositionAsync,
  getLastKnownPositionAsync,
};
