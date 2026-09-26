/** Layout box for native video — position with left/top/width/height only (no transform). */

export type MediaViewerVideoLayout = {
  width: number;
  height: number;
  left: number;
  top: number;
};

export function mediaViewerVideoLayout(
  box: { width: number; height: number },
  frame: { width: number; height: number },
  scale: number,
  offsetX: number,
  offsetY: number,
): MediaViewerVideoLayout {
  const width = box.width * scale;
  const height = box.height * scale;
  const baseLeft = (frame.width - box.width) / 2;
  const baseTop = (frame.height - box.height) / 2;
  return {
    width,
    height,
    left: baseLeft + (box.width - width) / 2 + offsetX,
    top: baseTop + (box.height - height) / 2 + offsetY,
  };
}

export function formatViewerRemainingTime(duration: number, currentTime: number): string {
  if (!Number.isFinite(duration) || duration <= 0) return '-0:00';
  const rem = Math.max(0, duration - (Number.isFinite(currentTime) ? currentTime : 0));
  const total = Math.floor(rem);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `-${m}:${s.toString().padStart(2, '0')}`;
}
