/**
 * Whether the verification-page hero badge should move.
 * Unknown reduced-motion (still resolving) stays static so a user who asked
 * for less motion never sees a flash of animation.
 */
export function heroBadgeShouldAnimate(focused: boolean, reduceMotion: boolean | null): boolean {
  return focused && reduceMotion === false;
}
