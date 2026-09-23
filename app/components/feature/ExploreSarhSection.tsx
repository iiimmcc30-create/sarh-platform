import { Image } from '@/components/ui/AppImage';
import { colors, radius, space } from '@/design-system';
import { SarhButton } from '@/design-system/components';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { type ExploreSarhBannerView } from '@/lib/exploreSarhBanners';
import { HOME_BANNER_CTA_HREF, HOME_BANNER_CTA_LABEL } from '@/lib/homeQuickAccess';
import { safePush } from '@/lib/safeNavigate';
import { fetchExploreSarhBanners } from '@/services/exploreSarhBanners';
import { useRouter } from 'expo-router';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

const AUTO_ADVANCE_MS = 5000;
const BANNER_ASPECT = 16 / 9;

export type ExploreSarhSectionHandle = {
  refresh: () => Promise<void>;
};

export const ExploreSarhSection = forwardRef<ExploreSarhSectionHandle>(
  function ExploreSarhSection(_props, ref) {
  const router = useRouter();
  const { scheme } = useTheme();
  const { width } = useWindowDimensions();
  const { gutter } = useLayout();
  const styles = useThemedStyles(() => createStyles());
  const [banners, setBanners] = useState<ExploreSarhBannerView[]>([]);
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const inflightRef = useRef(false);
  const slideWidth = width;
  const bannerWidth = slideWidth - gutter * 2;
  const indexRef = useRef(index);
  const bannersRef = useRef(banners);
  indexRef.current = index;
  bannersRef.current = banners;

  const load = async (force = false) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const next = await fetchExploreSarhBanners(force ? { force: true } : undefined);
      if (next.length === 0) return;
      setBanners(next);
      if (force) {
        setIndex(0);
        scroller.current?.scrollTo({ x: 0, animated: false });
      }
    } finally {
      inflightRef.current = false;
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: () => load(true),
  }));

  useEffect(() => {
    void load(false);
  }, []);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (next !== indexRef.current && next >= 0 && next < bannersRef.current.length) {
      setIndex(next);
    }
  };

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => {
      const len = bannersRef.current.length;
      if (len <= 1) return;
      const next = (indexRef.current + 1) % len;
      setIndex(next);
      scroller.current?.scrollTo({ x: next * slideWidth, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [slideWidth, banners.length]);

  const openBannerCta = () => safePush(HOME_BANNER_CTA_HREF, undefined, router);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {banners.map((banner) => (
          <View key={banner.id} style={[styles.slide, { width: slideWidth }]}>
            <View
              style={[styles.banner, { width: bannerWidth }]}
              accessibilityRole="image"
              accessibilityLabel={banner.accessibilityLabel}
            >
              <Image
                source={banner.image}
                style={styles.image}
                contentFit="cover"
                pointerEvents="none"
              />
              <View pointerEvents="box-none" style={styles.ctaLayer}>
                <SarhButton
                  title={HOME_BANNER_CTA_LABEL}
                  size="sm"
                  shape="rounded"
                  variant={scheme === 'light' ? 'secondary' : 'inverse'}
                  accessibilityLabel={HOME_BANNER_CTA_LABEL}
                  onPress={openBannerCta}
                />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {banners.length > 1 ? (
        <View style={[styles.dots, { paddingHorizontal: gutter }]}>
          {banners.map((banner, i) => (
            <Pressable
              key={banner.id}
              accessibilityRole="button"
              accessibilityLabel={`بنر ${i + 1} من ${banners.length}`}
              onPress={() => {
                setIndex(i);
                scroller.current?.scrollTo({ x: i * slideWidth, animated: true });
              }}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

function createStyles() {
  return StyleSheet.create({
    wrap: {
      paddingTop: space[12],
      paddingBottom: space[8],
    },
    slide: {
      alignItems: 'center',
    },
    banner: {
      aspectRatio: BANNER_ASPECT,
      borderRadius: radius[20],
      overflow: 'hidden',
      backgroundColor: colors.surfaceElevated,
    },
    image: {
      ...StyleSheet.absoluteFillObject,
    },
    ctaLayer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
      alignItems: 'flex-end',
      padding: space[16],
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: space[8],
      marginTop: space[12],
    },
    dot: {
      width: space[8],
      height: space[8],
      borderRadius: radius[999],
      backgroundColor: colors.border,
    },
    dotActive: {
      width: space[16],
      backgroundColor: colors.primary,
    },
  });
}

export default ExploreSarhSection;
