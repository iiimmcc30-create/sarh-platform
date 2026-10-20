export type ConnectivitySnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

/**
 * Offline only when the radio or the reachability check says so.
 * `null` means "unknown yet" and must not flash the banner at launch.
 */
export function isOfflineSnapshot(state: ConnectivitySnapshot): boolean {
  if (state.isConnected === false) return true;
  if (state.isInternetReachable === false) return true;
  return false;
}
