import { ListingBoostTitleIcons } from '@/components/listing/ListingBoostTitleIcons';
import { PromotionStatsSheet } from '@/components/listing/PromotionStatsSheet';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SIDEBAR_MENU_ITEM } from '@/components/ui/SidebarMenuItem';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAppUser } from '@/hooks/useApp';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { resolveCurrentUserId } from '@/lib/currentUser';
import { rtlForwardIcon } from '@/lib/rtl';
import { listingThumbUri } from '@/lib/listingMedia';
import { searchAllSellerListings } from '@/services/listings';
import type { Listing } from '@/services/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { usePaidServices } from '@/hooks/usePaidServices';
import { AppText, SarhButton } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';

const CATEGORY_ICONS: Record<Listing['category'], string> = {
  camels: '🐪',
  sheep: '🐑',
  goats: '🐐',
  cows: '🐄',
  horses: '🐎',
  birds: '🦅',
  feed: '🌾',
  equipment: '⚙️',
  livestock: '🐄',
  transport: '🚚',
  slaughter: '🥩',
};

function listingThumb(listing: Listing): string | undefined {
  return listingThumbUri(listing);
}

export default function PromoteHubScreen() {
  const { styles, colors } = useThemedStyles((theme) => ({
    styles: createStyles(theme.colors),
    colors: theme.colors,
  }));
  const router = useRouter();
  const { me } = useAppUser();
  const { user, accessToken } = useAuth();
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [statsListingId, setStatsListingId] = useState<string | null>(null);
  const { hasAnyBoostService } = usePaidServices();

  const userId = resolveCurrentUserId(user, me);

  const loadListings = useCallback(async () => {
    if (!userId) {
      setMyListings([]);
      setLoadingListings(false);
      return;
    }
    setLoadingListings(true);
    try {
      const rows = await searchAllSellerListings(userId, accessToken);
      setMyListings(rows);
    } catch {
      /* keep current listings */
    } finally {
      setLoadingListings(false);
    }
  }, [accessToken, userId]);

  useFocusEffect(
    useCallback(() => {
      void loadListings();
    }, [loadListings]),
  );

  const openPromote = (listingId: string) => {
    if (!hasAnyBoostService) return;
    router.push(`/listing/${listingId}/promote` as never);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="تعزيز سرح" showBack />
      <ScreenBody padTop="xs" padBottom="xxl" gap="lg">
        {!hasAnyBoostService ? (
          <View style={styles.hero}>
            <View style={styles.heroIconWrap}>
              <AppIcon name="rocket-outline" size={28} color={colors.textMuted} />
            </View>
            <AppText variant="heading3" color="textPrimary" align="center">خدمات الترقية غير مفعّلة حالياً</AppText>
            <AppText variant="caption" color="textMuted" align="center">يمكنك العودة لاحقاً عند تفعيلها من الإدارة.</AppText>
          </View>
        ) : null}

        {hasAnyBoostService ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroIconWrap}>
                <AppIcon name="rocket-outline" size={28} color={colors.electric} />
              </View>
              <AppText variant="heading3" color="textPrimary" align="center">اختر إعلاناً لبدء الترويج</AppText>
              <AppText variant="caption" color="textMuted" align="center" style={styles.heroSub}>
                زِد ظهور إعلانك، ثبّته في الأعلى، أو أضف نجمة مميزة — كل خيار له تأثير مختلف
              </AppText>
            </View>

            {loadingListings && myListings.length === 0 ? (
              <ActivityIndicator color={colors.electric} style={{ marginVertical: spacing.xl }} />
            ) : myListings.length === 0 ? (
              <View style={styles.emptyBox}>
                <View style={styles.emptyIconWrap}>
                  <AppIcon name="megaphone-outline" size={36} color={colors.textMuted} />
                </View>
                <AppText variant="label" color="textPrimary" align="center">لا توجد إعلانات بعد</AppText>
                <AppText variant="caption" color="textMuted" align="center" style={styles.emptySub}>انشر إعلاناً في السوق ثم عد لترويجه ورفع مشاهداته</AppText>
                <SarhButton
                  title="إنشاء إعلان"
                  onPress={() => void navigateToCreateListing()}
                  leftIcon="add-circle-outline"
                />
              </View>
            ) : (
              <View style={styles.listingsList}>
                {myListings.map((listing, index) => {
                    const thumb = listingThumb(listing);
                    const title = listing.arabicTitle || listing.title;
                    const location = listing.arabicLocation || listing.location;
                    const metaParts = [
                      listing.price > 0
                        ? `${listing.price.toLocaleString('ar-SA')} ${listing.currency}`
                        : null,
                      location || null,
                    ].filter(Boolean);

                    return (
                      <Pressable
                        key={listing.id}
                        style={({ pressed }) => [
                          styles.listingRow,
                          index < myListings.length - 1 && styles.listingRowDivider,
                          pressed && styles.listingRowPressed,
                        ]}
                        onPress={() => openPromote(listing.id)}
                      >
                        <AppIcon
                          name={rtlForwardIcon()}
                          size={SIDEBAR_MENU_ITEM.chevronSize}
                          color={colors.textSubtle}
                        />

                        {listing.promoted ? (
                          <Pressable
                            style={styles.statsBtn}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setStatsListingId(listing.id);
                            }}
                            hitSlop={8}
                            accessibilityLabel="إحصائيات الترويج"
                          >
                            <AppIcon name="stats-chart-outline" size={16} color="#7C3AED" />
                          </Pressable>
                        ) : null}

                        <View style={styles.spacer} />

                        <View style={styles.listingContent}>
                          <View style={styles.textWrap}>
                            <View style={styles.titleRow}>
                              <ListingBoostTitleIcons
                                pinned={listing.pinned}
                                featured={listing.featured}
                              />
                              <AppText variant="label" color="textPrimary" numberOfLines={2} style={{ flexShrink: 1 }}>
                                {title}
                              </AppText>
                            </View>
                            {metaParts.length > 0 ? (
                              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                                {metaParts.join(' · ')}
                              </AppText>
                            ) : null}
                            {listing.promoted ? (
                              <AppText variant="micro" style={styles.reachText}>ترويج نشط — زيادة ظهور</AppText>
                            ) : null}
                          </View>

                          <View style={styles.thumbWrap}>
                            {thumb ? (
                              <Image source={uriSource(thumb)} style={styles.thumb} contentFit="cover" />
                            ) : (
                              <View style={styles.thumbPlaceholder}>
                                <AppText variant="heading2">
                                  {CATEGORY_ICONS[listing.category] || '📦'}
                                </AppText>
                              </View>
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                })}
              </View>
            )}
          </>
        ) : null}
      </ScreenBody>

      <PromotionStatsSheet
        visible={!!statsListingId}
        listingId={statsListingId}
        listingTitle={
          myListings.find((l) => l.id === statsListingId)?.arabicTitle ??
          myListings.find((l) => l.id === statsListingId)?.title
        }
        onClose={() => setStatsListingId(null)}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    hero: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    heroIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 20,
      backgroundColor: `${colors.electric}14`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    heroSub: {
      lineHeight: 20,
      paddingHorizontal: spacing.md,
    },
    emptyBox: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgElevated,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
    },
    emptySub: {
      lineHeight: 20,
    },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: 999,
      backgroundColor: colors.electric,
    },
    listingsList: {
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgElevated,
      overflow: 'hidden',
    },
    listingRow: {
      flexDirection: 'row',
            alignItems: 'center',
      gap: SIDEBAR_MENU_ITEM.gap,
      paddingHorizontal: SIDEBAR_MENU_ITEM.paddingHorizontal,
      paddingVertical: SIDEBAR_MENU_ITEM.paddingVertical,
      minHeight: 72,
    },
    listingRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    listingRowPressed: {
      opacity: 0.76,
    },
    spacer: {
      flex: 1,
      minWidth: SIDEBAR_MENU_ITEM.gap,
    },
    listingContent: {
      flexDirection: 'row',
            alignItems: 'center',
      gap: SIDEBAR_MENU_ITEM.gap,
      flexShrink: 1,
      maxWidth: '88%',
    },
    textWrap: {
      flexShrink: 1,
      gap: 3,
      minWidth: 0,
    },
    titleRow: {
      flexDirection: 'row',
            alignItems: 'center',
      gap: 6,
      justifyContent: 'flex-end',
    },
    reachText: {
      color: '#7C3AED',
    },
    thumbWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      overflow: 'hidden',
      flexShrink: 0,
      backgroundColor: colors.bgDeep,
    },
    thumb: {
      width: '100%',
      height: '100%',
    },
    thumbPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsBtn: {
      width: 32,
      height: 32,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#7C3AED30',
      backgroundColor: '#7C3AED08',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
  });
}
