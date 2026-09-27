/**
 * Home stories row visibility (pure, no React Native imports so it is unit-testable).
 *
 * - Logged in: always shown, with the add-your-story slot first (even with an empty feed).
 * - Logged out: never the add slot; shown only when there are stories to watch.
 */
export type HomeStoriesRowMode = 'hidden' | 'withAdd' | 'storiesOnly';

export const HOME_ADD_STORY_LABEL = 'أضف قصتك';

export function homeStoriesRowMode(input: {
  isAuthenticated: boolean;
  feedCount: number;
}): HomeStoriesRowMode {
  if (input.isAuthenticated) return 'withAdd';
  return input.feedCount > 0 ? 'storiesOnly' : 'hidden';
}
