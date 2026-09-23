import { useBindChromeScroll } from '@/hooks/useAppChrome';
import { useScreenBodyContentInset } from '@/design-system/layout/screenBodyContentInset';
import React, { forwardRef } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

function withNestedBodyInset(
  style: StyleProp<ViewStyle> | undefined,
  extra: number,
): StyleProp<ViewStyle> {
  if (!extra) return style;
  const current = StyleSheet.flatten(style)?.paddingBottom;
  const base = typeof current === 'number' ? current : 0;
  return style == null ? { paddingBottom: extra } : [style, { paddingBottom: base + extra }];
}

type AppFlatListProps<T> = FlatListProps<T>;

/**
 * Shared list defaults for Sarh — smooth momentum + light virtualization tuning.
 * Visual layout is unchanged; callers can override any prop.
 */
function AppFlatListInner<T>(
  props: AppFlatListProps<T>,
  ref: React.ForwardedRef<FlatList<T>>,
) {
  const {
    showsVerticalScrollIndicator = false,
    showsHorizontalScrollIndicator = false,
    keyboardShouldPersistTaps = 'handled',
    scrollEventThrottle = 16,
    decelerationRate = 'normal',
    bounces = true,
    alwaysBounceVertical,
    overScrollMode,
    maxToRenderPerBatch = Platform.OS === 'android' ? 6 : 10,
    updateCellsBatchingPeriod = 50,
    windowSize = Platform.OS === 'android' ? 7 : 11,
    initialNumToRender = Platform.OS === 'android' ? 6 : 8,
    removeClippedSubviews = Platform.OS === 'android',
    onScroll,
    contentContainerStyle,
    ...rest
  } = props;
  const boundScroll = useBindChromeScroll(onScroll);
  const nestedBodyInset = useScreenBodyContentInset();

  return (
    <FlatList
      ref={ref}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      scrollEventThrottle={scrollEventThrottle}
      decelerationRate={decelerationRate}
      bounces={bounces}
      alwaysBounceVertical={alwaysBounceVertical ?? bounces}
      overScrollMode={overScrollMode ?? (Platform.OS === 'android' ? 'always' : undefined)}
      maxToRenderPerBatch={maxToRenderPerBatch}
      updateCellsBatchingPeriod={updateCellsBatchingPeriod}
      windowSize={windowSize}
      initialNumToRender={initialNumToRender}
      removeClippedSubviews={removeClippedSubviews}
      onScroll={boundScroll}
      contentContainerStyle={withNestedBodyInset(contentContainerStyle, nestedBodyInset)}
      {...rest}
    />
  );
}

export const AppFlatList = forwardRef(AppFlatListInner) as <T>(
  props: AppFlatListProps<T> & { ref?: React.Ref<FlatList<T>> },
) => React.ReactElement | null;

export default AppFlatList;
