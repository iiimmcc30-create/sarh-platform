import { Image } from 'expo-image';
import { OnboardingDots } from '@/components/onboarding/OnboardingDots';
import { AppText } from '@/components/ui/AppText';
import { SarhLogoMark } from '@/components/ui/SarhLogoMark';
import { BRAND_NAME_AR } from '@/constants/brandCopy';
import {
  ONBOARDING_NEXT_LABEL,
  ONBOARDING_SKIP_LABEL,
  ONBOARDING_SLIDES,
  ONBOARDING_START_LABEL,
  type OnboardingSlide,
} from '@/constants/onboardingCopy';
import { motion } from '@/design-system';
import { SarhButton } from '@/design-system/components';
import { layout, radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { useOnboardingPager } from '@/hooks/useOnboardingPager';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  onboardingSkipOpacityRange,
  onboardingSlideMotion,
  type OnboardingPagerMode,
} from '@/lib/onboardingFlow';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Media card never grows past this on wide (web / tablet) screens. */
const CONTENT_MAX_WIDTH = 440;

export default function OnboardingScreen() {
  const { width: windowWidth, height } = useWindowDimensions();
  const { completeOnboarding } = useOnboarding();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  const finishOnboarding = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      // AuthGuard (app/_layout) redirects once the flag flips.
      await completeOnboarding();
    } catch {
      finishingRef.current = false;
      setFinishing(false);
    }
  }, [completeOnboarding]);

  const pager = useOnboardingPager({
    count: ONBOARDING_SLIDES.length,
    initialWidth: windowWidth,
    onFinish: () => void finishOnboarding(),
  });
  const { index, isLast, progress, width, mode, reduceMotion, next, pagerProps } = pager;

  const compact = height < 720;
  const contentWidth = Math.max(0, Math.min(width - layout.screenPadding * 2, CONTENT_MAX_WIDTH));
  const mediaHeight = Math.round(
    Math.min(contentWidth * (compact ? 0.78 : 1), height * (compact ? 0.34 : 0.42)),
  );

  const skipOpacity = progress.interpolate({
    ...onboardingSkipOpacityRange(ONBOARDING_SLIDES.length),
    extrapolate: 'clamp',
  });

  // CTA label cross-fade when reaching / leaving the last slide.
  // Reduced motion swaps the label instantly (no fade).
  const [labelIsLast, setLabelIsLast] = useState(isLast);
  const [labelOpacity] = useState(() => new Animated.Value(1));
  const shownIsLast = reduceMotion ? isLast : labelIsLast;
  useEffect(() => {
    if (reduceMotion || labelIsLast === isLast) return undefined;
    const fadeOut = Animated.timing(labelOpacity, {
      toValue: 0,
      duration: motion.duration.press,
      useNativeDriver: false,
    });
    fadeOut.start(({ finished }) => {
      if (!finished) return;
      setLabelIsLast(isLast);
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: motion.duration.ui,
        useNativeDriver: false,
      }).start();
    });
    return () => fadeOut.stop();
  }, [isLast, labelIsLast, labelOpacity, reduceMotion]);
  useEffect(() => () => labelOpacity.stopAnimation(), [labelOpacity]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <SarhLogoMark size={20} color={colors.textPrimary} accentColor={colors.electric} />
            <AppText style={styles.brandName}>{BRAND_NAME_AR}</AppText>
          </View>
          <Animated.View
            style={{ opacity: skipOpacity }}
            pointerEvents={isLast || finishing ? 'none' : 'auto'}
            accessibilityElementsHidden={isLast}
            importantForAccessibility={isLast ? 'no-hide-descendants' : 'auto'}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_SKIP_LABEL}
              onPress={() => void finishOnboarding()}
              disabled={finishing}
              hitSlop={8}
              style={({ pressed }) => [styles.skipBtn, pressed && styles.skipPressed]}
            >
              <AppText style={styles.skipText}>{ONBOARDING_SKIP_LABEL}</AppText>
            </Pressable>
          </Animated.View>
        </View>

        <ScrollView {...pagerProps} style={[styles.pager, pagerProps.style]}>
          {ONBOARDING_SLIDES.map((slide, slideIndex) => (
            <OnboardingSlideView
              key={slide.id}
              slide={slide}
              slideIndex={slideIndex}
              active={slideIndex === index}
              progress={progress}
              width={width}
              mode={mode}
              reduceMotion={reduceMotion}
              contentWidth={contentWidth}
              mediaHeight={mediaHeight}
              compact={compact}
              styles={styles}
            />
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <OnboardingDots count={ONBOARDING_SLIDES.length} activeIndex={index} progress={progress} />
          <Animated.View style={{ opacity: reduceMotion ? 1 : labelOpacity }}>
            <SarhButton
              title={shownIsLast ? ONBOARDING_START_LABEL : ONBOARDING_NEXT_LABEL}
              onPress={next}
              fullWidth
              loading={finishing}
              leftIcon={shownIsLast ? 'checkmark' : rtlForwardIcon()}
            />
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

type SlideProps = {
  slide: OnboardingSlide;
  slideIndex: number;
  active: boolean;
  progress: Animated.AnimatedInterpolation<number>;
  width: number;
  mode: OnboardingPagerMode;
  reduceMotion: boolean;
  contentWidth: number;
  mediaHeight: number;
  compact: boolean;
  styles: ReturnType<typeof createStyles>;
};

function OnboardingSlideView({
  slide,
  slideIndex,
  active,
  progress,
  width,
  mode,
  reduceMotion,
  contentWidth,
  mediaHeight,
  compact,
  styles,
}: SlideProps) {
  const m = onboardingSlideMotion(slideIndex, width, mode, reduceMotion);
  const at = (outputRange: number[]) =>
    progress.interpolate({ inputRange: m.inputRange, outputRange, extrapolate: 'clamp' });

  return (
    <View
      style={[styles.page, { width }]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[
          styles.media,
          { width: contentWidth, height: mediaHeight },
          {
            opacity: at(m.mediaOpacity),
            transform: [{ translateX: at(m.mediaTranslateX) }, { scale: at(m.mediaScale) }],
          },
        ]}
      >
        <Image
          source={slide.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          accessible={false}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.textBlock,
          compact && styles.textBlockCompact,
          { width: contentWidth },
          { opacity: at(m.textOpacity), transform: [{ translateX: at(m.textTranslateX) }] },
        ]}
      >
        <AppText style={styles.title}>{slide.title}</AppText>
        <View style={styles.accent} />
        <AppText style={styles.description}>{slide.description}</AppText>
      </Animated.View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
    },
    safe: {
      flex: 1,
    },
    header: {
      ...getRtlRow(),
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.sm,
      minHeight: 52,
    },
    brand: {
      ...getRtlRow(),
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: colors.bgGlass,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
    },
    brandName: {
      ...typography.cardHeading,
      color: colors.textPrimary,
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
    pager: {
      flex: 1,
    },
    page: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.lg,
    },
    media: {
      borderRadius: radius.xl,
      overflow: 'hidden',
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
    },
    textBlock: {
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.xxl,
    },
    textBlockCompact: {
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    title: {
      ...typography.display,
      color: colors.textPrimary,
      textAlign: 'center',
      width: '100%',
    },
    accent: {
      width: 32,
      height: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.electric,
    },
    description: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      width: '100%',
      maxWidth: 340,
      lineHeight: 26,
    },
    footer: {
      paddingHorizontal: layout.screenPadding,
      paddingBottom: spacing.lg,
      gap: spacing.sm,
      maxWidth: CONTENT_MAX_WIDTH + layout.screenPadding * 2,
      width: '100%',
      alignSelf: 'center',
    },
  });
}
