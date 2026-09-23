type PauseHandle = {
  id: string;
  pause: () => void;
};

let current: PauseHandle | null = null;

export function claimFeedPlayback(id: string, pause: () => void) {
  if (current && current.id !== id) {
    try {
      current.pause();
    } catch {
      // ignore
    }
  }
  current = { id, pause };
}

export function releaseFeedPlayback(id: string) {
  if (current?.id === id) current = null;
}

export function pauseAllFeedPlayback() {
  if (!current) return;
  try {
    current.pause();
  } catch {
    // ignore
  }
  current = null;
}
