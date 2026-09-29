/** Wrap a cleanup so it runs at most once (safe from success, failure, cancel and unmount paths). */
export function onceCleanup(fn: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try {
      fn();
    } catch {
      /* cleanup must never throw into messaging */
    }
  };
}
