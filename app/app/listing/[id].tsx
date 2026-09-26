import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppText, SarhButton } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody } from '@/design-system/layout';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { sarhListingShareUrl } from '@/constants/sarhOfficial';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { useApp } from '@/hooks/useApp';
import { type Listing } from '@/services/types';
import { useAuth } from '@/contexts/AuthContext';
import { fetchUserProfile, setFollowUser } from '@/services/users';
import { openUserProfile } from '@/lib/openUserProfile';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { promptReport } from '@/services/reports';
import { alertMessage, presentActionSheet } from '@/lib/actionSheet';
import { showToast } from '@/lib/toast';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MediaViewerModal } from '@/components/ui/MediaViewerModal';
import { measureMediaOrigin, type MediaOriginRect } from '@/lib/mediaOrigin';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { ListingCommentsSection } from '@/components/feature/ListingCommentsSection';
import { ListingContactSheet } from '@/components/listing/ListingContactSheet';
import { ListingFeePaymentSheet } from '@/components/listing/ListingFeePaymentSheet';
import { ListingDeleteDialog } from '@/components/listing/ListingDeleteDialog';
import { listingPhotoUris, listingVideoUrl } from '@/lib/listingMedia';
import { collectListingMedia } from '@/lib/postMedia';
import { isManagedListing, managedSeller } from '@/lib/managedListing';
import { isListingFavorited, toggleListingFavorite } from '@/lib/listingFavorite';
import { resolveMediaUrl } from '@/services/media';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import {
  LISTING_EDIT_LIMIT_MESSAGE_AR,
  listingAllowsOwnerEdit,
} from '@/lib/listingLimits';
import { usePaidServices } from '@/hooks/usePaidServices';
import { firstEnabledPromoteGoal, isPromoteGoalEnabled } from '@/services/paidServices';

const CATEGORY_LABELS: Record<string, string> = {
  camels: 'إبل',
  sheep: 'أغنام',
  goats: 'ماعز',
  cows: 'أبقار',
  horses: 'خيول',
  birds: 'دواجن',
  feed: 'أعلاف',
  equipment: 'معدات',
  livestock: 'المواشي',
  transport: 'النقل',
  slaughter: 'الذبائح',
};

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isAuthenticated, user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { listings, me, removeListing } = useApp();
  const { width: screenWidth } = useWindowDimensions();
  const cachedListing = useMemo(
    () => listings.find((l) => l.id === id) ?? null,
    [listings, id],
  );
  const [listing, setListing] = useState<Listing | null>(cachedListing);
  const listingRef = useRef<Listing | null>(listing);
  listingRef.current = listing;
  const [loading, setLoading] = useState(!cachedListing);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [mediaViewerVisible, setMediaViewerVisible] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  const [mediaViewerOrigin, setMediaViewerOrigin] = useState<MediaOriginRect | null>(null);
  const imageRefs = useRef<Array<View | null>>([]);
  const videoPreviewRef = useRef<View | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);

  // Load local favorite state
  useEffect(() => {
    if (!id) return;
    isListingFavorited(id).then(setIsFavorited).catch(() => {});
  }, [id]);

  // ─── Boost / promote ────────────────────────────────────────────────────
  const [feeModalVisible, setFeeModalVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [contactSheetVisible, setContactSheetVisible] = useState(false);
  const { flags: paidFlags, hasAnyBoostService } = usePaidServices();

  const loadListing = useCallback(async () => {
    if (!id) return;
    let failed = false;
    try {
      const res = await (accessToken
        ? authFetch(`${API_BASE}/api/listings/${id}`)
        : fetch(`${API_BASE}/api/listings/${id}`));
      if (!res.ok) {
        if (res.status !== 404) failed = true;
        return;
      }
      const json = await res.json();
      if (!json.success || !json.data) return;
      const raw = json.data;
      setListing({
        id: raw.id,
        title: raw.title,
        arabicTitle: raw.arabicTitle,
        price: raw.price,
        currency: raw.currency || 'SAR',
        category: raw.category,
        categoryId: raw.categoryId ?? raw.marketCategory?.id,
        subcategoryId: raw.subcategoryId ?? raw.marketSubcategory?.id,
        categoryNameAr: raw.marketCategory?.nameAr,
        subcategoryNameAr: raw.marketSubcategory?.nameAr,
        breed: raw.breed || '',
        age: raw.age || '',
        location: raw.location,
        arabicLocation: raw.arabicLocation,
        country: raw.country,
        contactPhone: raw.contactPhone || undefined,
        weightKg: typeof raw.weightKg === 'number' ? raw.weightKg : undefined,
        requiresWeight:
          raw.marketCategory?.requiresWeight === true ||
          raw.marketSubcategory?.requiresWeight === true ||
          raw.category === 'slaughter',
        images: (raw.images ?? [])
          .map((uri: string) => {
            const rawUri = typeof uri === 'string' ? uri.trim() : '';
            return resolveMediaUrl(rawUri) ?? rawUri;
          })
          .filter((uri: string) => uri.length > 0),
        videoUrl: resolveMediaUrl(
          listingVideoUrl({ images: raw.images, videoUrl: raw.videoUrl }),
        ),
        thumbnailUrl: resolveMediaUrl(
          typeof raw.thumbnailUrl === 'string' && raw.thumbnailUrl.trim()
            ? raw.thumbnailUrl
            : undefined,
        ),
        description: raw.description,
        arabicDescription: raw.arabicDescription,
        origin: raw.origin === 'ADMIN_MANAGED' ? 'ADMIN_MANAGED' : 'USER',
        displayUsername: raw.displayUsername || undefined,
        displaySellerName: raw.displaySellerName || undefined,
        displayPhone: raw.displayPhone || undefined,
        displayRegion: raw.displayRegion || undefined,
        seller: isManagedListing(raw)
          ? managedSeller(raw)
          : {
          id: raw.seller?.id,
          username: raw.seller?.username || '',
          displayName: raw.seller?.displayName || '',
          arabicName: raw.seller?.arabicName || '',
          avatar: raw.seller?.avatar,
          verified: raw.seller?.verified ?? false,
          followers: raw.seller?.followersCount ?? raw.seller?.followers ?? 0,
          following: raw.seller?.followingCount ?? 0,
          rating: typeof raw.seller?.rating === 'number' ? raw.seller.rating : null,
          reviewCount: raw.seller?.reviewCount ?? 0,
          country: raw.seller?.country || 'SA',
          bio: raw.seller?.bio || '',
        },
        featured: raw.featured ?? false,
        pinned: raw.pinned ?? false,
        postedAt: new Date(raw.createdAt).toLocaleDateString('ar-SA'),
        createdAt: raw.createdAt,
        editCount: typeof raw.editCount === 'number' ? raw.editCount : 0,
      });
    } catch {
      failed = true;
    } finally {
      if (failed && !listingRef.current) return;
      setLoading(false);
    }
  }, [id, accessToken]);

  useEffect(() => {
    if (!cachedListing) return;
    setListing((prev) => {
      if (!prev || prev.id !== cachedListing.id) return cachedListing;
      return prev;
    });
  }, [cachedListing]);

  useEffect(() => {
    if (!id) return;
    if (!listing) setLoading(true);
    void loadListing();
  }, [id, accessToken, loadListing]);

  const sellerId = listing?.seller.id;

  const refreshSellerFollowState = useCallback(async (force = false) => {
    if (!sellerId || sellerId === me.id || !isAuthenticated || !accessToken) {
      setIsFollowing(null);
      return null;
    }
    const profile = await fetchUserProfile(sellerId, { force });
    setIsFollowing(profile?.isFollowing ?? null);
    return profile;
  }, [accessToken, isAuthenticated, sellerId, me.id]);

  useEffect(() => {
    void refreshSellerFollowState();
  }, [refreshSellerFollowState]);

  const openSellerChat = (draftMessage?: string) => {
    if (!listing || isManagedListing(listing) || !listing.seller.id) return;
    if (!isAuthenticated) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول لمراسلة البائع');
      return;
    }
    const image =
      listing.images?.[0] ||
      listing.thumbnailUrl ||
      undefined;
    void import('@/lib/messageListingContext').then(({ saveMessageListingContext }) =>
      saveMessageListingContext({
        listingId: listing.id,
        title: listing.arabicTitle || listing.title,
        price: listing.price,
        currency: listing.currency || 'SAR',
        image,
        location: listing.arabicLocation || listing.location,
        peerUserId: listing.seller.id,
      }),
    );
    router.push({
      pathname: '/chat',
      params: {
        receiverId: listing.seller.id,
        receiverName: listing.seller.arabicName,
        receiverAvatar: listing.seller.avatar ?? '',
        accountType: 'LIVESTOCK_TRADER',
        threadType: 'DIRECT',
        listingId: listing.id,
        listingTitle: listing.arabicTitle || listing.title,
        listingPrice: String(listing.price),
        listingCurrency: listing.currency || 'SAR',
        listingImage: image ?? '',
        listingLocation: listing.arabicLocation || listing.location || '',
        ...(draftMessage?.trim() ? { draftMessage: draftMessage.trim() } : {}),
      },
    } as never);
  };

  const openSellerCall = async () => {
    if (!listing) return;
    if (!listing.contactPhone) {
      Alert.alert('لا يوجد رقم', 'لم يُذكر رقم تواصل في هذا الإعلان.');
      return;
    }
    const phone = listing.contactPhone.replace(/\D/g, '');
    if (!phone) {
      Alert.alert('رقم غير صالح', 'تعذّر قراءة رقم التواصل.');
      return;
    }
    try {
      await Linking.openURL(`tel:${phone}`);
    } catch {
      Alert.alert('تعذّر الاتصال', 'تحقق من صحة رقم التواصل.');
    }
  };

  const handleFollowSeller = async () => {
    if (!listing || !accessToken || isFollowing === null) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    setFollowLoading(true);
    try {
      const result = await setFollowUser(listing.seller.id, !isFollowing);
      if (!result) throw new Error('follow_failed');
      const refreshed = await refreshSellerFollowState(true);
      if (!refreshed) throw new Error('profile_refetch_failed');
    } catch (error) {
      await refreshSellerFollowState(true);
      void showToast('تعذّرت المتابعة', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading && !listing) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader variant="screen" title="" showBack />
        <ScreenBody scroll={false}>
          <ActivityIndicator style={{ marginTop: 80 }} color={colors.electricBright} />
        </ScreenBody>
      </Screen>
    );
  }

  if (!listing) {
    return (
      <Screen edges={['top']}>
        <ScreenHeader variant="screen" title="" showBack />
        <ScreenBody scroll={false}>
          <AppText variant="body" color="textMuted" align="center" style={styles.notFound}>
            لم يتم العثور على الإعلان
          </AppText>
        </ScreenBody>
      </Screen>
    );
  }

  const isOwner = !!me.id && listing.seller.id === me.id;

  const openPromote = (promoteGoal?: 'visibility' | 'pinned' | 'featured') => {
    // زر ترقية الإعلان يتبع تبديل الرسوم/الترقية في لوحة الإدارة
    if (!paidFlags.listingFeesEnabled) return;
    const goal =
      promoteGoal && isPromoteGoalEnabled(promoteGoal, paidFlags)
        ? promoteGoal
        : firstEnabledPromoteGoal(paidFlags);
    if (!goal) return;
    router.push(`/listing/${listing.id}/promote?goal=${goal}` as never);
  };

  const timeLabel = listing.createdAt
    ? formatRelativeTimeAr(listing.createdAt)
    : listing.postedAt;
  const weightLabel =
    typeof listing.weightKg === 'number' && listing.weightKg > 0
      ? `${(listing.weightKg % 1 === 0 ? Math.round(listing.weightKg) : listing.weightKg).toLocaleString('ar-SA')} كجم`
      : null;
  const images = listingPhotoUris(listing);
  const videoUri = listingVideoUrl(listing);
  const mediaItems = useMemo(() => collectListingMedia(listing), [listing]);
  const categoryLabel = CATEGORY_LABELS[listing.category] ?? '';

  const openMediaViewer = useCallback(
    (index: number, originNode: View | null) => {
      void measureMediaOrigin(originNode).then((origin) => {
        setMediaViewerOrigin(origin);
        setMediaViewerIndex(index);
        setMediaViewerVisible(true);
      });
    },
    [],
  );

  const handleStartLive = () => {
    Alert.alert('البث المباشر', 'قريباً 🔴\nميزة البث المباشر للإعلانات ستتوفر قريباً.');
  };

  const canEditListing = listingAllowsOwnerEdit(listing.editCount, user?.role);

  const handleEdit = () => {
    if (!canEditListing) {
      Alert.alert('تعديل غير متاح', LISTING_EDIT_LIMIT_MESSAGE_AR);
      return;
    }
    void navigateToCreateListing({ editId: listing.id });
  };

  const handleDelete = () => {
    setDeleteDialogVisible(true);
  };

  const confirmDeleteListing = async (choice: { sold: boolean; reason: string }) => {
    if (!listing) return;
    const result = await removeListing(listing.id, choice);
    if (result.ok) {
      setDeleteDialogVisible(false);
      router.back();
    } else {
      await alertMessage(
        'خطأ',
        result.error || 'فشل حذف الإعلان. يرجى المحاولة لاحقاً.',
      );
    }
  };

  const galleryImageHeight = screenWidth * 0.72;

  // Owner management actions — single horizontal row
  const ownerActions = [
    {
      key: 'live',
      icon: 'signal-stream',
      label: 'بث مباشر',
      onPress: handleStartLive,
      badge: 'قريباً',
      danger: false,
    },
    ...(canEditListing
      ? [
          {
            key: 'edit',
            icon: 'create-outline',
            label: 'تعديل',
            onPress: handleEdit,
            danger: false,
          },
        ]
      : []),
    ...(paidFlags.listingFeesEnabled
      ? [
          {
            key: 'pay-fee',
            icon: 'receipt-outline',
            label: 'سداد الرسوم',
            onPress: () => setFeeModalVisible(true),
            danger: false,
          },
          ...(hasAnyBoostService
            ? [
                {
                  key: 'promote',
                  icon: 'rocket-outline',
                  label: 'ترقية الإعلان',
                  onPress: () => openPromote(),
                  danger: false,
                },
              ]
            : []),
        ]
      : []),
    {
      key: 'delete',
      icon: 'trash-outline',
      label: 'حذف',
      onPress: handleDelete,
      danger: true,
    },
  ];

  const showOwnerMenu = async () => {
    const key = await presentActionSheet({
      title: 'إدارة الإعلان',
      message: 'اختر الإجراء المطلوب',
      items: [
        ...(canEditListing
          ? [{ key: 'edit', label: 'تعديل الإعلان', icon: 'create-outline' }]
          : []),
        ...(paidFlags.listingFeesEnabled
          ? [
              { key: 'pay-fee', label: 'سداد الرسوم', icon: 'receipt-outline' },
              ...(hasAnyBoostService
                ? [{ key: 'promote', label: 'ترقية الإعلان', icon: 'rocket-outline' }]
                : []),
            ]
          : []),
        { key: 'delete', label: 'حذف الإعلان', icon: 'trash-outline', destructive: true },
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ],
    });
    if (key === 'edit') handleEdit();
    if (key === 'pay-fee' && paidFlags.listingFeesEnabled) setFeeModalVisible(true);
    if (key === 'promote' && paidFlags.listingFeesEnabled) openPromote();
    if (key === 'delete') void handleDelete();
  };

  const showVisitorMenu = async () => {
    const key = await presentActionSheet({
      title: 'الإعلان',
      items: [
        { key: 'share', label: 'مشاركة', icon: 'share-outline' },
        {
          key: 'favorite',
          label: isFavorited ? 'إزالة من المفضلة' : 'حفظ في المفضلة',
          icon: isFavorited ? 'heart' : 'heart-outline',
        },
        { key: 'report', label: 'إبلاغ', icon: 'flag-outline' },
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ],
    });
    if (key === 'share') {
      void Share.share({
        message: `${listing.arabicTitle} — ${listing.price.toLocaleString()} ${listing.currency}\n${sarhListingShareUrl(listing.id)}`,
      });
    }
    if (key === 'favorite') {
      try {
        const next = await toggleListingFavorite(listing.id);
        setIsFavorited(next);
        showToast(next ? 'تم الحفظ في المفضلة ♥' : 'تمت الإزالة من المفضلة', 'success');
      } catch {
        showToast('تعذّر تحديث المفضلة', 'error');
      }
    }
    if (key === 'report') promptReport('listing', listing.id, isAuthenticated);
  };

  return (
    <Screen edges={['top']}>
      <ScreenHeader
        variant="screen"
        title=""
        showBack
        rightIcon="ellipsis-vertical"
        onRightPress={() => (isOwner ? void showOwnerMenu() : void showVisitorMenu())}
        rightAccessibilityLabel="المزيد"
      />
      <ScreenBody
        gutter={false}
        width="full"
        padBottom="xl"
        bottomInset={isOwner ? 'none' : 'action'}
      >
        <View style={styles.headerSection}>
          <View style={styles.titleBlock}>
            <AppText variant="sectionTitle" style={styles.title} numberOfLines={3} ellipsizeMode="tail">
              {listing.arabicTitle || listing.title}
            </AppText>
          </View>

          <Row gap="sm" align="center" style={styles.headerMetaRow}>
            <Row gap="xs" align="center" style={styles.headerMetaChip}>
              <AppText variant="caption" color="textMuted" style={styles.headerMetaText} numberOfLines={1}>
                {listing.arabicLocation || listing.location}
              </AppText>
              <AppIcon name="map-marker-outline" size={13} color={colors.textMuted} />
            </Row>
            <Row gap="xs" align="center" style={styles.headerMetaChip}>
              <AppText variant="caption" color="textMuted" style={styles.headerMetaText} numberOfLines={1}>
                {timeLabel || 'الآن'}
              </AppText>
              <AppIcon name="time-outline" size={13} color={colors.textMuted} />
            </Row>
            {weightLabel ? (
              <Row gap="xs" align="center" style={styles.headerMetaChip}>
                <AppText variant="caption" color="textMuted" style={styles.headerMetaText} numberOfLines={1}>
                  {weightLabel}
                </AppText>
              </Row>
            ) : null}
          </Row>

          {!isOwner ? (
            isManagedListing(listing) ? (
              <View style={styles.sellerRow}>
                <AppText variant="cardTitle" color="textSecondary" numberOfLines={1}>
                  {listing.displayUsername || listing.seller.username}
                </AppText>
                <AppText variant="body" color="textMuted" numberOfLines={1}>
                  {listing.displaySellerName || listing.seller.arabicName}
                  {listing.displayRegion || listing.arabicLocation
                    ? ` · ${listing.displayRegion || listing.arabicLocation}`
                    : ''}
                </AppText>
              </View>
            ) : (
            <Row gap="sm" align="center" justify="between" style={styles.sellerRow}>
              <Pressable
                onPress={() => openUserProfile(router, listing.seller.id)}
                style={styles.sellerTitleCluster}
                accessibilityRole="button"
                accessibilityLabel={
                  listing.seller.arabicName || listing.seller.displayName || listing.seller.username
                }
              >
                <Row gap="sm" align="center">
                  <Image
                    source={uriSource(listing.seller.avatar)}
                    style={styles.sellerInlineAvatar}
                    contentFit="cover"
                  />
                  {listing.seller.verified ? <VerificationBadge size={16} /> : null}
                  <AppText variant="cardTitle" color="textSecondary" style={styles.sellerInlineName} numberOfLines={1}>
                    {listing.seller.arabicName || listing.seller.displayName || listing.seller.username}
                  </AppText>
                </Row>
              </Pressable>
              <SarhButton
                title={isFollowing ? 'متابَع' : 'متابعة'}
                variant={isFollowing ? 'secondary' : 'primary'}
                size="sm"
                onPress={handleFollowSeller}
                loading={followLoading || (isFollowing === null && isAuthenticated)}
              />
            </Row>
            )
          ) : null}

          {listing.contactPhone ? (
            <Pressable
              onPress={() => void openSellerCall()}
              style={styles.contactPhoneRow}
            >
              <Row gap="xs" align="center">
                <AppText variant="caption" color="textMuted" style={styles.contactPhoneText} numberOfLines={1}>
                  {listing.contactPhone}
                </AppText>
                <AppIcon name="call-outline" size={14} color={colors.electricBright} />
              </Row>
            </Pressable>
          ) : null}
        </View>

        <MediaViewerModal
          visible={mediaViewerVisible}
          items={mediaItems}
          initialIndex={mediaViewerIndex}
          origin={mediaViewerOrigin}
          onClose={() => setMediaViewerVisible(false)}
        />

        {(listing.arabicDescription || listing.description || categoryLabel || listing.breed || listing.age || weightLabel) ? (
          <View style={styles.descriptionSection}>
            {categoryLabel || listing.breed || listing.age || weightLabel ? (
              <View style={{ width: '100%' }}>
                <Row wrap gap="sm" style={styles.specMetaLine}>
                  {categoryLabel ? (
                    <AppText variant="caption" color="textMuted">{categoryLabel}</AppText>
                  ) : null}
                  {listing.breed ? (
                    <AppText variant="caption" color="textMuted">{listing.breed}</AppText>
                  ) : null}
                  {listing.age ? (
                    <AppText variant="caption" color="textMuted">{listing.age}</AppText>
                  ) : null}
                  {weightLabel ? (
                    <AppText variant="caption" color="textMuted">{weightLabel}</AppText>
                  ) : null}
                </Row>
              </View>
            ) : null}
            {listing.arabicDescription ? (
              <View style={{ width: '100%' }}>
                <AppText variant="body" style={styles.descArabic}>{listing.arabicDescription}</AppText>
              </View>
            ) : null}
            {listing.description && listing.description !== listing.arabicDescription ? (
              <View style={{ width: '100%' }}>
                <AppText variant="body" color="textSecondary">{listing.description}</AppText>
              </View>
            ) : null}
          </View>
        ) : null}

        {videoUri ? (
          <View style={styles.mediaSection}>
            <View style={styles.mediaLabelWrap}>
              <View style={{ width: '100%' }}>
                <AppText variant="bodySmall" color="textMuted">الفيديو</AppText>
              </View>
            </View>
            <Pressable
              ref={videoPreviewRef}
              collapsable={false}
              style={styles.mediaBleed}
              onPress={() => {
                const videoIndex = mediaItems.findIndex((m) => m.kind === 'video');
                openMediaViewer(videoIndex >= 0 ? videoIndex : 0, videoPreviewRef.current);
              }}
              accessibilityRole="button"
              accessibilityLabel="فتح الفيديو"
            >
              <Image
                source={uriSource(listing.thumbnailUrl || videoUri)}
                style={{ width: '100%', height: galleryImageHeight }}
                contentFit="cover"
                transition={250}
              />
              <View style={styles.videoPlayOverlay} pointerEvents="none">
                <View style={styles.videoPlayBtn}>
                  <AppIcon name="play" size={24} color="#fff" variant="sr" />
                </View>
              </View>
            </Pressable>
          </View>
        ) : null}

        {images.length > 0 ? (
          <View style={styles.mediaSection}>
            <View style={styles.mediaLabelWrap}>
              <View style={{ width: '100%' }}>
                <AppText variant="bodySmall" color="textMuted">
                  الصور ({images.length.toLocaleString('ar-SA')})
                </AppText>
              </View>
            </View>
            {images.map((uri, index) => (
              <Pressable
                key={`${uri}-${index}`}
                ref={(node) => {
                  imageRefs.current[index] = node;
                }}
                collapsable={false}
                onPress={() => {
                  const mediaIndex = mediaItems.findIndex((m) => m.uri === uri);
                  openMediaViewer(mediaIndex >= 0 ? mediaIndex : index, imageRefs.current[index]);
                }}
                style={styles.mediaBleed}
              >
                <Image
                  source={uriSource(uri)}
                  style={{ width: '100%', height: galleryImageHeight }}
                  contentFit="cover"
                  transition={250}
                />
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.priceSection}>
          {listing.price > 0 ? (
            <View style={{ width: '100%' }}>
              <AppText variant="price" style={styles.price}>
                {`السعر: ${(listing.price % 1 === 0 ? Math.round(listing.price) : listing.price).toLocaleString('ar-SA')} ريال`}
              </AppText>
            </View>
          ) : (
            <View style={{ width: '100%' }}>
              <AppText variant="price" style={styles.priceOnRequest}>السعر عند الطلب</AppText>
            </View>
          )}
          {(listing.pinned || listing.featured) ? (
            <Row wrap gap="sm" justify="end">
              {listing.pinned ? (
                <Row gap="xs" align="center" style={styles.pinned}>
                  <AppIcon name="pin" size={11} color="#fff" />
                  <AppText variant="caption" style={styles.pinnedText}>مثبّت</AppText>
                </Row>
              ) : null}
              {listing.featured ? (
                <Row gap="xs" align="center" style={styles.featured}>
                  <AppIcon name="star" size={11} color="#1A1300" />
                  <AppText variant="caption" style={styles.featuredText}>مميز</AppText>
                </Row>
              ) : null}
            </Row>
          ) : null}
        </View>

        {isOwner ? (
          <Row wrap gap="sm" style={styles.ownerToolsSection}>
            {ownerActions.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.ownerToolChip,
                  a.danger && styles.ownerToolChipDanger,
                  pressed && styles.ownerActionPressed,
                ]}
              >
                <Row gap="xs" align="center">
                  <AppIcon
                    name={a.icon}
                    size={18}
                    color={a.danger ? colors.rose : colors.textSecondary}
                  />
                  <AppText
                    variant="bodySmall"
                    color="textSecondary"
                    style={a.danger ? styles.ownerActionTextDanger : undefined}
                  >
                    {a.label}
                  </AppText>
                </Row>
              </Pressable>
            ))}
          </Row>
        ) : null}

        <ListingCommentsSection listingId={listing.id} layout="edge" />
      </ScreenBody>

      {!isOwner ? (
        <BottomAction>
          <SarhButton
            title="تواصل"
            variant="primary"
            leftIcon="chatbubbles"
            onPress={() => setContactSheetVisible(true)}
            fullWidth
          />
        </BottomAction>
      ) : null}

      <ListingContactSheet
        visible={contactSheetVisible}
        onClose={() => setContactSheetVisible(false)}
        onMessage={() => openSellerChat()}
        onCall={() => void openSellerCall()}
        canCall={Boolean(listing?.contactPhone)}
        allowMessage={!listing || !isManagedListing(listing)}
      />

      {listing ? (
        <ListingFeePaymentSheet
          visible={feeModalVisible && paidFlags.listingFeesEnabled}
          listingId={listing.id}
          listingTitle={listing.arabicTitle || listing.title}
          onClose={() => setFeeModalVisible(false)}
        />
      ) : null}
      <ListingDeleteDialog
        visible={deleteDialogVisible}
        onClose={() => setDeleteDialogVisible(false)}
        onConfirm={(choice) => void confirmDeleteListing(choice)}
      />
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    notFound: { marginTop: 80 },
    headerSection: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      backgroundColor: colors.bgElevated,
    },
    headerMetaRow: {
      width: '100%',
      flexWrap: 'nowrap',
    },
    headerMetaChip: {
      flexGrow: 0,
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    headerMetaText: {
      flexShrink: 1,
    },
    descriptionSection: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.screenRoot,
    },
    specMetaLine: {
      width: '100%',
    },
    mediaSection: {
      gap: spacing.sm,
      backgroundColor: colors.screenRoot,
    },
    mediaLabelWrap: {
      paddingHorizontal: spacing.lg,
    },
    mediaBleed: {
      width: '100%',
      overflow: 'hidden',
      backgroundColor: colors.bgElevated,
    },
    mediaPlayer: {
      borderRadius: 0,
      width: '100%',
    },
    videoPlayOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoPlayBtn: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingStart: 4,
    },
    priceSection: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.screenRoot,
    },
    price: {
      color: colors.electricBright,
    },
    priceOnRequest: {
      color: colors.textBrandStrong,
    },
    featured: {
      backgroundColor: colors.gold,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    featuredText: { color: '#1A1300' },
    pinned: {
      backgroundColor: colors.electric,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.pill,
    },
    pinnedText: { color: '#fff' },
    titleBlock: {
      width: '100%',
      gap: spacing.sm,
    },
    title: {
      color: colors.electricBright,
    },
    sellerTitleCluster: {
      flex: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    sellerRow: {
      width: '100%',
      paddingTop: spacing.xs,
    },
    sellerInlineAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bgElevated,
      borderWidth: 1.5,
      borderColor: colors.electric,
      flexShrink: 0,
    },
    sellerInlineName: {
      flexShrink: 1,
      minWidth: 0,
    },
    contactPhoneRow: {
      paddingTop: spacing.xs,
    },
    contactPhoneText: {
      flexShrink: 1,
    },
    ownerToolsSection: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.screenRoot,
      width: '100%',
    },
    ownerToolChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      flexShrink: 0,
    },
    ownerToolChipDanger: {
      backgroundColor: `${colors.rose}10`,
    },
    ownerActionPressed: {
      opacity: 0.82,
    },
    ownerActionTextDanger: {
      color: colors.rose,
    },
    descArabic: {
      color: colors.textPrimary,
    },
  });
}
