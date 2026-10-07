import type { ReactElement } from 'react';
import type { ParamListBase, ScreenLayoutArgs } from '@react-navigation/native';
import type { NativeStackNavigationOptions, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SarhPatternBackground } from '@/components/ui/SarhPatternBackground';
import { screenHasOwnBackground } from '@/lib/screenTransition';

/**
 * Stack `screenLayout`: wraps each pushed screen in an opaque page (same bgDeep + subtle
 * dark pattern as the root), so native push / swipe-back moves a solid page over the
 * previous one instead of a see-through layer.
 */
export function patternScreenLayout({
  route,
  children,
}: ScreenLayoutArgs<
  ParamListBase,
  string,
  NativeStackNavigationOptions,
  NativeStackNavigationProp<ParamListBase>
>): ReactElement {
  if (screenHasOwnBackground(route.name)) return children;
  return <SarhPatternBackground>{children}</SarhPatternBackground>;
}
