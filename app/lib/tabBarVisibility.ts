/**
 * Tab routes that render without the FloatingTabBar (pure, no RN imports).
 * Route-based so the bar returns by itself as soon as another tab is active.
 */
export const TAB_BAR_HIDDEN_ROUTES: readonly string[] = ['profile'];

export function isTabBarHiddenForRoute(routeName: string | null | undefined): boolean {
  return Boolean(routeName) && TAB_BAR_HIDDEN_ROUTES.includes(String(routeName));
}