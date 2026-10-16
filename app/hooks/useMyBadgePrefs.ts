import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { OwnBadgePrefs } from '@/lib/goldSeller';

// The signed-in user's own badge-visibility switches, kept on-device so the
// owner's «بائع ذهبي» / badge hide everywhere instantly, regardless of what a
// (possibly older, unmasked) API response or cached profile says.
const KEY = 'sarh.badgePrefs.v1';
let current: OwnBadgePrefs | null = null;
let loaded = false;
const listeners = new Set<(p: OwnBadgePrefs | null) => void>();

export function setMyBadgePrefs(prefs: OwnBadgePrefs) {
  current = prefs;
  listeners.forEach((l) => l(prefs));
  void AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
}

export function useMyBadgePrefs(): OwnBadgePrefs | null {
  const [p, setP] = useState(current);
  useEffect(() => {
    listeners.add(setP);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY)
        .then((raw) => {
          if (raw && !current) {
            current = JSON.parse(raw);
            listeners.forEach((l) => l(current));
          }
        })
        .catch(() => {});
    }
    setP(current);
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}
