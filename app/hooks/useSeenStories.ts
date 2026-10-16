import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { trimSeenIds } from '@/lib/storySeen';

const KEY = 'sarh.stories.seen.v1';
let seen = new Set<string>();
let loaded = false;
const listeners = new Set<(s: Set<string>) => void>();

function emit() {
  const snap = new Set(seen);
  listeners.forEach((l) => l(snap));
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const ids: string[] = raw ? JSON.parse(raw) : [];
    seen = new Set([...ids, ...seen]);
    emit();
  } catch {
    // ignore corrupt cache
  }
}

/** Mark a story seen locally (immediate) and persist. */
export function markStorySeenLocally(storyId: string) {
  if (!storyId || seen.has(storyId)) return;
  seen.add(storyId);
  emit();
  void AsyncStorage.setItem(KEY, JSON.stringify(trimSeenIds([...seen]))).catch(() => {});
}

export function useSeenStoryIds(): Set<string> {
  const [snap, setSnap] = useState<Set<string>>(() => new Set(seen));
  useEffect(() => {
    listeners.add(setSnap);
    void load();
    setSnap(new Set(seen));
    return () => {
      listeners.delete(setSnap);
    };
  }, []);
  return snap;
}
