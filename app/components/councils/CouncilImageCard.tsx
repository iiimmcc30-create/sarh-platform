import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ImageViewerModal } from '@/components/ui/ImageViewerModal';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { resolveMediaUrl } from '@/services/media';
import { councilUserName, type CouncilImage } from '@/services/councils';

type Props = {
  image: CouncilImage;
  onOpenListing?: (listingId: string) => void;
  /** Owner / moderator / poster menu, or «إبلاغ» for everyone else. */
  onMore: () => void;
};

/**
 * «عرض صورة»: the image pinned at the top of the room for everyone. Tap for the
 * fullscreen viewer; a listing photo adds «عرض الإعلان». Fades in on change.
 */
function CouncilImageCardBase({ image, onOpenListing, onMore }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [viewer, setViewer] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [image.url, fade]);

  const resolved = resolveMediaUrl(image.url) ?? image.url;
  const by = image.by ? councilUserName(image.by) : null;
  return (
    <Animated.View style={[styles.card, { opacity: fade }]} testID="council-image-card">
      <Pressable
        onPress={() => setViewer(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel="الصورة المعروضة في المجلس، اضغط للتكبير"
      >
        <Image source={uriSource(image.url)} style={styles.image} contentFit="cover" transition={150} />
      </Pressable>
      <Pressable
        onPress={onMore}
        hitSlop={8}
        style={styles.more}
        accessibilityRole="button"
        accessibilityLabel="خيارات الصورة"
      >
        <AppIcon name="ellipsis-horizontal" size={16} color={colors.textPrimary} />
      </Pressable>
      <Row gap="sm" align="center" style={styles.footer}>
        <AppIcon name="image-outline" size={14} color={colors.textMuted} />
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.caption}>
          {image.listing?.title ?? (by ? `يعرضها ${by}` : 'صورة معروضة')}
        </AppText>
        {image.listingId && onOpenListing ? (
          <Pressable
            onPress={() => onOpenListing(image.listingId!)}
            style={styles.listingBtn}
            accessibilityRole="button"
            testID="council-image-listing"
          >
            <AppText variant="caption" color="textPrimary">
              عرض الإعلان
            </AppText>
          </Pressable>
        ) : null}
      </Row>
      <ImageViewerModal visible={viewer} images={[resolved]} onClose={() => setViewer(false)} />
    </Animated.View>
  );
}

export const CouncilImageCard = memo(CouncilImageCardBase);

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    image: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.bgElevated },
    more: {
      position: 'absolute',
      top: spacing.sm,
      end: spacing.sm,
      width: 30,
      height: 30,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    caption: { flex: 1 },
    listingBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
  });
}
