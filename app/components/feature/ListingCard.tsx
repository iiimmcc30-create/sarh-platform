// Powered by OnSpace.AI
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { memo, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaViewerModal } from '@/components/ui/MediaViewerModal';
import { measureMediaOrigin, type MediaOriginRect } from '@/lib/mediaOrigin';
import { ambientShadow } from '@/constants/designSystem';
import {
  imageCardOverlay,
  imageCardOverlayStrong,
  radius,
  spacing,
  typography,
  type ThemeColors,
} from '@/constants/theme';
import { MENU_CARD } from '@/components/feature/SidebarMenu';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { getRtlText, getRtlDirection, getRtlRow } from '@/lib/rtl';
import { listingHasVideo, listingPhotoUris, listingThumbUri } from '@/lib/listingMedia';
import { collectListingMedia } from '@/lib/postMedia';
import { Listing, getCountryInfo } from '@/services/types';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { isManagedListing, listingAdvertiserName } from '@/lib/managedListing';
import { ListingBoostTitleIcons } from '@/components/listing/ListingBoostTitleIcons';
import { VerificationBadge } from '@/components/ui/VerificationBadge';

interface ListingCardProps {
  listing: Listing;
  onPress?: () => void;
  variant?: 'grid' | 'feature' | 'profile' | 'list';
  /** Feed list layout variant for home vs market screens. */
  listMode?: 'home' | 'market';
  compact?: boolean;
}

const CATEGORY_ICONS: Record<Listing['category'], string> = {
  camels: '🐪',
  sheep: '🐑',
  goats: '🐐',
  cows: '🐄',
  horses: '🐎',
  birds: '🐔',
  feed: '🌾',
  equipment: '🔧',
  livestock: '🐪',
  transport: '🚚',
  slaughter: '🥩',
};

const NEW_LISTING_MS = 24 * 60 * 60 * 1000;
/** Square list thumb — matches the Haraj market row, never stretches. */
const LIST_THUMB = 120;
const LIST_THUMB_RADIUS = 14;

function listingTimeLabel(listing: Listing): string {
  if (listing.createdAt) return formatRelativeTimeAr(listing.createdAt);
  return listing.postedAt || '';
}

function isNewListing(listing: Listing): boolean {
  if (!listing.createdAt) return false;
  const t = new Date(listing.createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_LISTING_MS;
}

/** Western digits with thousands separators — e.g. 1,700 */
function formatEnNumber(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  const rounded = value % 1 === 0 ? Math.round(value) : value;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function toWesternDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function ListingCardInner({
  listing,
  onPress,
  variant = 'grid',
  listMode = 'market',
  compact = false,
}: ListingCardProps) {
  const country = getCountryInfo(listing.country);
  const thumbUri = listingThumbUri(listing);
  const { scheme, colors } = useTheme();
  const styles = useThemedStyles(({ colors: c, scheme: s }) => createStyles(c, s));
  const mediaItems = useMemo(() => collectListingMedia(listing), [listing]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerOrigin, setViewerOrigin] = useState<MediaOriginRect | null>(null);
  const thumbRef = useRef<View>(null);
  const cardOverlay = imageCardOverlay(scheme);
  const cardOverlayStrong = imageCardOverlayStrong(scheme);
  const desc = listing.arabicDescription || listing.description;
  const timeLabel = listingTimeLabel(listing);
  const title = listing.arabicTitle || listing.title;
  const location = listing.arabicLocation || listing.location;
  const seller = listing.seller;
  const managed = isManagedListing(listing);
  const sellerName = listingAdvertiserName(listing);
  const sellerId = managed ? undefined : seller?.id;
  const photoCount = listingPhotoUris(listing).length;

  if (variant === 'list') {
    const showNew = isNewListing(listing);
    const hasVideo = listingHasVideo(listing);
    const displayTime = toWesternDigits(timeLabel || 'الآن');
    return (
      <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.listRow,
          styles.listRowChrome,
          getRtlDirection(),
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.listContent}>
          <View style={[styles.listTitleRow, getRtlRow()]}>
            <View style={styles.listTitleShell}>
              <Text style={styles.listTitle} numberOfLines={2} ellipsizeMode="tail">
                {title}
              </Text>
            </View>
            <ListingBoostTitleIcons pinned={listing.pinned} featured={listing.featured} />
            {!listing.pinned && !listing.featured && showNew ? (
              <Text style={styles.listStatusNew}>جديد</Text>
            ) : null}
          </View>

          <View style={[styles.listMetaRow, getRtlRow()]}>
            <View style={[styles.listMetaCluster, getRtlRow()]}>
              <AppIcon name="map-marker-outline" size={12} color={colors.textPrimary} />
              <Text style={styles.listMetaText} numberOfLines={1} ellipsizeMode="tail">
                {location}
              </Text>
            </View>
            <View style={[styles.listMetaClusterFixed, getRtlRow()]}>
              <AppIcon name="time-outline" size={12} color={colors.textPrimary} />
              <Text style={styles.listMetaText} numberOfLines={1}>
                {displayTime}
              </Text>
            </View>
            {listing.price > 0 ? (
              <View style={[styles.listMetaClusterFixed, getRtlRow()]}>
                <Text style={styles.listPriceAmount} numberOfLines={1}>{formatEnNumber(listing.price)}</Text>
                <Text style={styles.listRiyalText}>﷼</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.listSellerRow, getRtlRow()]}>
            <UserProfileLink userId={sellerId} style={[styles.listSeller, getRtlRow()]}>
              <Image
                source={uriSource(seller?.avatar)}
                style={styles.listAvatar}
                contentFit="cover"
              />
              {seller?.verified ? <VerificationBadge size={14} /> : null}
              <View style={styles.listSellerNameShell}>
                <Text style={styles.listSellerName} numberOfLines={1}>
                  {sellerName}
                </Text>
              </View>
            </UserProfileLink>
          </View>
        </View>

        <View ref={thumbRef} collapsable={false} style={styles.listThumbWrap}>
          {thumbUri ? (
            <Image
              source={uriSource(thumbUri)}
              style={styles.listThumb}
              contentFit="cover"
              transition={0}
              priority="low"
            />
          ) : (
            <View style={styles.listThumbPlaceholder}>
              <Text style={styles.listThumbIcon}>{CATEGORY_ICONS[listing.category] || '📦'}</Text>
            </View>
          )}
          {hasVideo ? (
            <Pressable
              style={styles.listVideoBadge}
              onPress={() => {
                void measureMediaOrigin(thumbRef.current).then((origin) => {
                  setViewerOrigin(origin);
                  setViewerVisible(true);
                });
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="عرض الفيديو"
            >
              <AppIcon name="play" size={10} color="#fff" variant="sr" />
            </Pressable>
          ) : null}
          {photoCount > 1 ? (
            <View style={styles.listPhotoCountBadge}>
              <AppIcon name="image-outline" size={10} color="#fff" />
              <Text style={styles.listPhotoCountText}>{formatEnNumber(photoCount)}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      <MediaViewerModal
        visible={viewerVisible}
        items={mediaItems}
        origin={viewerOrigin}
        onClose={() => setViewerVisible(false)}
      />
      </>
    );
  }

  if (variant === 'profile') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.profileCard, getRtlDirection(), pressed && styles.pressed]}
      >
        {thumbUri ? (
          <Image source={uriSource(thumbUri)} style={styles.profileImg} contentFit="cover" transition={250} />
        ) : (
          <View style={styles.profilePlaceholder}>
            <Text style={styles.profilePlaceholderIcon}>{CATEGORY_ICONS[listing.category] || '📦'}</Text>
          </View>
        )}
        <LinearGradient
          colors={cardOverlay}
          style={styles.profileOverlay}
        />
        <View style={styles.profileInfo}>
          <View style={[styles.profileTitleRow, getRtlRow()]}>
            <Text style={styles.profileTitle} numberOfLines={2}>
              {listing.arabicTitle}
            </Text>
            <ListingBoostTitleIcons pinned={listing.pinned} featured={listing.featured} size="md" />
          </View>
          <Text style={styles.profilePrice}>
            {listing.price.toLocaleString('ar-SA')} {listing.currency}
          </Text>
        </View>
      </Pressable>
    );
  }

  if (variant === 'feature') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.feature,
          compact && styles.featureCompact, getRtlDirection(),
          pressed && styles.pressed,
        ]}
      >
        <Image source={uriSource(thumbUri)} style={styles.featureImg} contentFit="cover" transition={250} />
        <LinearGradient
          colors={cardOverlayStrong}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.featureContent, compact && styles.featureContentCompact]}>
          <View style={[styles.featureTitleRow, getRtlRow()]}>
            <Text style={[styles.featureTitle, compact && styles.featureTitleCompact]} numberOfLines={2}>
              {listing.arabicTitle}
            </Text>
            <ListingBoostTitleIcons pinned={listing.pinned} featured={listing.featured} size="md" />
          </View>
          <View style={[styles.row, getRtlRow()]}>
            <Text style={[styles.featurePrice, compact && styles.featurePriceCompact]}>
              {listing.price.toLocaleString('ar-SA')} {listing.currency}
            </Text>
            <View style={styles.locationPill}>
              <Text style={styles.flag}>{country.flag}</Text>
              <Text style={[styles.locationText, compact && styles.locationTextCompact]} numberOfLines={1}>
                {listing.arabicLocation}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  // تغذية مثل حراج: بطاقات بعرض كامل تحت بعض
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.harajCard, getRtlDirection(), pressed && styles.pressed]}
    >
      <View style={[styles.harajTitleRow, getRtlRow()]}>
        <Text style={styles.harajTitle} numberOfLines={2}>
          {title}
        </Text>
        <ListingBoostTitleIcons pinned={listing.pinned} featured={listing.featured} />
      </View>

      <View style={[styles.harajMeta, getRtlRow()]}>
        <View style={[styles.harajMetaItem, getRtlRow()]}>
          <AppIcon name="map-marker-outline" size={13} color={colors.textPrimary} />
          <Text style={styles.harajMetaText}>{location}</Text>
        </View>
        <View style={[styles.harajMetaItem, getRtlRow()]}>
          <AppIcon name="time-outline" size={13} color={colors.textPrimary} />
          <Text style={styles.harajMetaText}>{timeLabel || 'الآن'}</Text>
        </View>
      </View>

      <View style={[styles.harajSellerRow, getRtlRow()]}>
        <UserProfileLink userId={sellerId} style={[styles.harajSellerInfo, getRtlRow()]}>
          <Image
            source={uriSource(seller?.avatar)}
            style={styles.harajAvatar}
            contentFit="cover"
          />
          {seller?.verified ? <VerificationBadge size={14} /> : null}
          <View style={styles.harajSellerNameShell}>
            <Text style={styles.harajSellerName} numberOfLines={1}>
              {sellerName}
            </Text>
          </View>
        </UserProfileLink>
      </View>

      {desc ? (
        <Text style={styles.harajDesc} numberOfLines={8}>
          {desc}
        </Text>
      ) : null}

      {listing.price > 0 ? (
        <Text style={styles.harajPrice}>
          {listing.price.toLocaleString('ar-SA')} {listing.currency}
        </Text>
      ) : null}

      <View style={styles.harajImgWrap}>
        {thumbUri ? (
          <Image source={uriSource(thumbUri)} style={styles.harajImg} contentFit="cover" transition={250} />
        ) : (
          <View style={styles.harajImgPlaceholder}>
            <Text style={styles.harajImgPlaceholderIcon}>
              {CATEGORY_ICONS[listing.category] || '📦'}
            </Text>
          </View>
        )}
        {photoCount > 1 ? (
          <View style={styles.harajPhotoCountBadge}>
            <AppIcon name="image-outline" size={11} color="#fff" />
            <Text style={styles.harajPhotoCountText}>{photoCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, _scheme: 'light' | 'dark') {
  return StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },

  // Haraj market row — inset square thumb, rounded on both sides, no stretch.
  listRow: {
    ...getRtlRow(),
    alignItems: 'flex-start',
    flexGrow: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: _scheme === 'light' ? '#FFFFFF' : colors.bgSurface,
  },
  listContent: {
    flex: 1,
    minWidth: 0,
    height: LIST_THUMB,
    justifyContent: 'space-between',
  },
  listTitleRow: {
    alignItems: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  listTitleShell: {
    flex: 1,
    minWidth: 0,
      },
  listTitle: {
    ...typography.cardHeading,
    color: _scheme === 'light' ? colors.electric : colors.textPrimary,
    width: '100%',
    writingDirection: 'rtl',
  },
  listMetaRow: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 10,
    width: '100%',
  },
  listMetaCluster: {
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  listMetaClusterFixed: {
    alignItems: 'center',
    gap: 3,
    flexShrink: 0,
  },
  listMetaText: {
    ...typography.caption,
    color: colors.textPrimary,
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  listPriceAmount: {
    ...typography.caption,
    color: colors.textPrimary,
    writingDirection: 'ltr',
    fontVariant: ['tabular-nums'],
  },
  listRiyalText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  listStatusNew: {
    ...typography.badge,
    color: colors.cyan,
    flexShrink: 0,
  },
  listSellerRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  listSeller: {
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  listSellerNameShell: {
        flexShrink: 1,
    minWidth: 0,
  },
  listAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgElevated,
    flexShrink: 0,
  },
  listSellerName: {
    ...typography.caption,
    color: colors.textPrimary,
        writingDirection: 'rtl',
  },
  listThumbWrap: {
    width: LIST_THUMB,
    height: LIST_THUMB,
    aspectRatio: 1,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    position: 'relative',
    borderRadius: LIST_THUMB_RADIUS,
  },
  listThumb: {
    ...StyleSheet.absoluteFillObject,
  },
  listThumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listThumbIcon: { fontSize: 28 },
  listVideoBadge: {
    position: 'absolute',
    top: 6,
    start: 6,
    width: 20,
    height: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listPhotoCountBadge: {
    position: 'absolute',
    bottom: 6,
    end: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  listPhotoCountText: {
    ...typography.badge,
    color: '#fff',
  },
  listRowChrome: {
    borderRadius: MENU_CARD.radius,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    marginHorizontal: spacing.sm,
    ...ambientShadow(_scheme, 'soft'),
  },

  profileCard: {
    borderRadius: MENU_CARD.radius,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: 0,
    aspectRatio: 0.82,
  },
  profileImg: {
    width: '100%',
    height: '100%',
  },
  profilePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  profilePlaceholderIcon: { fontSize: 36 },
  profileOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  profileInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    gap: 2,
  },
  profileTitleRow: {
    alignItems: 'center',
    gap: 6,
  },
  profileTitle: {
    ...typography.cardHeading,
    color: '#fff',
        flex: 1,
  },
  profilePrice: {
    ...typography.value,
    color: colors.gold,
      },
  profileStar: {
    position: 'absolute',
    top: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Feature
  feature: {
    width: 280,
    height: 380,
    borderRadius: MENU_CARD.radius,
    overflow: 'hidden',
    marginEnd: spacing.lg,
    borderWidth: 0,
    backgroundColor: colors.bgElevated,
  },
  featureCompact: {
    width: 248,
    height: 268,
    borderRadius: MENU_CARD.radius,
    marginEnd: spacing.md,
  },
  featureImg: {
    width: '100%',
    height: '100%',
  },
  featureContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  featureContentCompact: {
    padding: spacing.md,
  },
  featureTitleRow: {
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 2,
  },
  featureTitle: {
    ...typography.cardHeadingLarge,
    color: '#fff',
    marginBottom: 2,
    flex: 1,
  },
  featureTitleCompact: {
    ...typography.cardHeading,
    marginBottom: 0,
  },
  featurePrice: {
    ...typography.valueLarge,
    color: colors.gold,
  },
  featurePriceCompact: {
    ...typography.value,
  },
  featuredBadge: {
    position: 'absolute',
    ...getRtlRow(),
    alignItems: 'center',
    backgroundColor: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
  },
  featuredText: {
    ...typography.badge,
    color: '#1A1300',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bgOverlay,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  locationText: {
    ...typography.caption,
    color: '#fff',
  },
  locationTextCompact: {
    ...typography.caption,
    maxWidth: 88,
  },
  row: {
    ...getRtlRow(),
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flag: {
    fontSize: 14,
  },

  harajCard: {
    width: '100%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  harajTitleRow: {
    alignItems: 'flex-start',
    gap: 8,
  },
  harajTitle: {
    ...typography.cardHeadingLarge,
    color: colors.textBrandStrong,
    ...getRtlText(),
    ...getRtlText(),
    lineHeight: 26,
    flex: 1,
  },
  harajMeta: {
    ...getRtlRow(),
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  harajMetaItem: {
    ...getRtlRow(),
    alignItems: 'center',
    gap: 4,
  },
  harajMetaText: {
    ...typography.caption,
    color: colors.textMuted,
    writingDirection: 'rtl',
  },
  harajSellerRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  harajSellerInfo: {
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  harajSellerNameShell: {
        flexShrink: 1,
    minWidth: 0,
  },
  harajAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgElevated,
    flexShrink: 0,
  },
  harajSellerName: {
    ...typography.cardHeading,
    color: colors.textPrimary,
    flexShrink: 1,
        writingDirection: 'rtl',
  },
  harajFeatured: {
    ...getRtlRow(),
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.gold,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  harajFeaturedText: {
    ...typography.badge,
    color: '#1A1300',
  },
  harajDesc: {
    ...typography.secondary,
    color: colors.textSecondary,
    ...getRtlText(),
    ...getRtlText(),
    lineHeight: 24,
  },
  harajPrice: {
    ...typography.valueLarge,
    color: colors.textPrimary,
    ...getRtlText(),
    ...getRtlText(),
  },
  harajImgWrap: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    marginTop: spacing.xs,
  },
  harajImg: {
    width: '100%',
    height: '100%',
  },
  harajImgPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  harajImgPlaceholderIcon: { fontSize: 40 },
  harajPhotoCountBadge: {
    position: 'absolute',
    bottom: 8,
    end: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  harajPhotoCountText: {
    ...typography.badge,
    color: '#fff',
  },
  });
}

export const ListingCard = memo(ListingCardInner, (prev, next) =>
  prev.variant === next.variant &&
  prev.listMode === next.listMode &&
  prev.compact === next.compact &&
  prev.onPress === next.onPress &&
  prev.listing.id === next.listing.id &&
  prev.listing.price === next.listing.price &&
  prev.listing.featured === next.listing.featured &&
  prev.listing.pinned === next.listing.pinned &&
  prev.listing.images?.[0] === next.listing.images?.[0] &&
  prev.listing.arabicTitle === next.listing.arabicTitle &&
  prev.listing.views === next.listing.views,
);

export default ListingCard;
