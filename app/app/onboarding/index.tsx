import { Image } from 'expo-image';
import { OnboardingDots } from '@/components/onboarding/OnboardingDots';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { AppText } from '@/components/ui/AppText';
import { SarhLogoMark } from '@/components/ui/SarhLogoMark';
import {
  ONBOARDING_NEXT_LABEL,
  ONBOARDING_SKIP_LABEL,
  ONBOARDING_SLIDES,
  ONBOARDING_START_LABEL,
} from '@/constants/onboardingCopy';
import { motion } from '@/design-system';
import { layout, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { paddingStart, rtlForwardIcon } from '@/lib/rtl';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SarhButton } from '@/design-system/components';

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const { completeOnboarding } = useOnboarding();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const listRef = useRef<FlatList<(typeof ONBOARDING_SLIDES)[number]>>(null);
  const finishingRef = useRef(false);

  const isLastSlide = currentIndex === ONBOARDING_SLIDES.length - 1;
  const compact = height < 720;

  const finishOnboarding = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await completeOnboarding();
    } catch {
      finishingRef.current = false;
    }
  }, [completeOnboarding]);

  const handleSkip = useCallback(() => {
    void finishOnboarding();
  }, [finishOnboarding]);

  const handleNext = useCallback(() => {
    if (isLastSlide) {
      void finishOnboarding();
      return;
    }
    listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  }, [currentIndex, finishOnboarding, isLastSlide]);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false },
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / width);
      setCurrentIndex(Math.max(0, Math.min(ONBOARDING_SLIDES.length - 1, index)));
    },
    [width],
  );

  const renderSlide = useCallback(
    ({ item }: ListRenderItemInfo<(typeof ONBOARDING_SLIDES)[number]>) => {
      return (
        <View style={[styles.slide, { width }]}>
          <Image source={item.image} style={StyleSheet.absoluteFillObject} contentFit="cover" />
          <LinearGradient
            colors={[`${colors.bgDeep}F2`, `${colors.bgDeep}CC`, `${colors.bgDeep}66`, 'transparent']}
            locations={[0, 0.22, 0.42, 0.68]}
            style={styles.fadeTop}
          />
          <LinearGradient
            colors={['transparent', `${colors.bgDeep}99`, colors.bgDeep]}
            locations={[0.35, 0.72, 1]}
            style={styles.fadeBottom}
          />
          <View style={[styles.textBlock, compact && styles.textBlockCompact]}>
            <SarhLogoMark size={compact ? 40 : 48} color={colors.textPrimary} />
            <AppText style={styles.title}>{item.title}</AppText>
            <View style={styles.divider} />
            <AppText style={styles.description}>{item.description}</AppText>
          </View>
        </View>
      );
    },
    [colors.bgDeep, colors.textPrimary, compact, styles, width],
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.bgDeep, colors.bgPrimary, colors.bgDeep]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[`${colors.electric}18`, 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
      />
      <View style={styles.pagerShell}>
        <Animated.FlatList
          ref={listRef}
          data={ONBOARDING_SLIDES}
          keyExtractor={(item) => item.id}
          renderItem={renderSlide}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          style={styles.list}
        />
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.header} pointerEvents="box-none">
          {!isLastSlide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_SKIP_LABEL}
              onPress={handleSkip}
              style={({ pressed }) => [styles.skipBtn, pressed && styles.skipPressed]}
            >
              <AppText style={styles.skipText}>{ONBOARDING_SKIP_LABEL}</AppText>
            </Pressable>
          ) : (
            <View style={styles.skipBtn} />
          )}
        </View>

        <View style={styles.footer}>
          <OnboardingDots
            count={ONBOARDING_SLIDES.length}
            activeIndex={currentIndex}
            scrollX={scrollX}
            slideWidth={width}
          />
          <SarhButton
            title={isLastSlide ? ONBOARDING_START_LABEL : ONBOARDING_NEXT_LABEL}
            onPress={handleNext}
            fullWidth
            leftIcon={isLastSlide ? 'checkmark' : rtlForwardIcon()}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    glow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 240,
    },
    pagerShell: {
      ...StyleSheet.absoluteFillObject,
      // Horizontal pager keeps LTR scroll physics; slide content stays RTL.
      direction: 'ltr',
    },
    list: {
      flex: 1,
    },
    slide: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    fadeTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: '52%',
    },
    fadeBottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '48%',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
    },
    header: {
      alignItems: 'flex-start',
      ...paddingStart(layout.screenPadding),
      paddingTop: spacing.sm,
    },
    skipBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    skipPressed: { opacity: motion.press.opacity },
    skipText: {
      ...typography.secondary,
      color: colors.textMuted,
    },
    textBlock: {
      position: 'absolute',
      top: '14%',
      left: layout.screenPadding,
      right: layout.screenPadding,
      alignItems: 'center',
      gap: spacing.md,
    },
    textBlockCompact: {
      top: '10%',
      gap: spacing.sm,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
      textAlign: 'center',
      width: '100%',
    },
    divider: {
      width: 42,
      height: 2,
      backgroundColor: colors.electric,
      borderRadius: 1,
    },
    description: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      width: '100%',
      maxWidth: 340,
    },
    footer: {
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
      maxWidth: layout.contentMaxWidth,
      width: '100%',
      alignSelf: 'center',
    },
  });
}
