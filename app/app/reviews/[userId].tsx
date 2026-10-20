import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddReviewDialog } from '@/components/feature/AddReviewDialog';
import { reviewPalette as palette } from '@/components/feature/reviews/reviewPalette';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppText, SarhBackButton } from '@/design-system/components';
import { Screen } from '@/design-system/layout';
import { useApp } from '@/hooks/useApp';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { showAlert } from '@/lib/confirmDialog';
import { formatReviewAgeAr } from '@/lib/reviewAge';
import { negativeReviewsLabel, positiveReviewsLabel } from '@/lib/reviewForm';
import { profileStarFills } from '@/lib/aboutAccount';
import { getRtlRow } from '@/lib/rtl';
import { promptReport } from '@/services/reports';
import {
  createUserReview,
  fetchUserReviews,
  type ReviewPerson,
  type UserReviewCard,
  type UserReviewsPage,
} from '@/services/reviews';
import { forgetCachedUserProfile } from '@/services/users';
import { openUserProfile } from '@/lib/openUserProfile';

function displayName(person?: Pick<ReviewPerson, 'arabicName' | 'displayName' | 'username'> | null) {
  return person?.arabicName || person?.displayName || person?.username || '';
}

function Avatar({ person, size }: { person?: ReviewPerson | null; size: number }) {
  const source = uriSource(person?.avatar);
  const letter = displayName(person).slice(0, 1) || '؟';
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {source ? (
        <Image source={source} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <AppText variant="label" style={{ color: palette.onHeader }}>
          {letter}
        </AppText>
      )}
    </View>
  );
}

function StarAverage({ rating, count }: { rating: number | null; count: number }) {
  const fills = profileStarFills(rating, count) ?? [0, 0, 0, 0, 0];
  return (
    <View
      style={[getRtlRow(), styles.stars]}
      accessibilityLabel={
        count > 0 && rating != null
          ? `متوسط التقييم ${rating.toFixed(1)} من 5، ${count} تقييم`
          : 'لا توجد تقييمات بعد'
      }
    >
      {fills.map((fill, index) => (
        <View key={index} style={styles.starSlot}>
          <AppIcon name="star" variant="rr" size={22} color={palette.starEmpty} />
          {fill > 0 ? (
            <View style={[styles.starFill, { width: fill === 1 ? 22 : 11 }]}>
              <AppIcon name="star" variant="sr" size={22} color={palette.star} />
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function ReviewCard({
  item,
  onReport,
}: {
  item: UserReviewCard;
  onReport: (id: string) => void;
}) {
  const positive = item.recommend;
  return (
    <Pressable
      onLongPress={() => onReport(item.id)}
      delayLongPress={350}
      style={styles.card}
      testID="review-card"
    >
      <View style={[getRtlRow(), styles.cardTop]}>
        <Avatar person={item.reviewer} size={36} />
        <AppText variant="label" numberOfLines={1} style={styles.reviewerName}>
          {displayName(item.reviewer)}
        </AppText>
        <AppText variant="caption" style={styles.age}>
          {formatReviewAgeAr(item.createdAt)}
        </AppText>
        <View style={styles.flex} />
        <View style={[styles.badge, { backgroundColor: positive ? palette.positiveSoft : palette.negativeSoft }]}>
          <AppIcon
            name={positive ? 'thumbs-up' : 'thumbs-down'}
            size={16}
            color={positive ? palette.positive : palette.negative}
          />
        </View>
      </View>
      {item.comment ? (
        <AppText variant="body" style={styles.comment}>
          {item.comment}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function UserReviewsScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { me } = useApp();
  const { accessToken } = useAuth();
  const [page, setPage] = useState<UserReviewsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setFailed(true);
      setLoading(false);
      return;
    }
    setFailed(false);
    const next = await fetchUserReviews(userId);
    if (!next) {
      setFailed(true);
    } else {
      setPage(next);
    }
    setLoading(false);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      void load();
      return () => setStatusBarStyle(isDark ? 'light' : 'dark');
    }, [isDark, load]),
  );

  const loadMore = useCallback(async () => {
    if (!userId || !page?.hasMore || !page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const next = await fetchUserReviews(userId, page.nextCursor);
    setLoadingMore(false);
    if (!next) return;
    setPage((prev) => {
      if (!prev) return next;
      const seen = new Set(prev.reviews.map((row) => row.id));
      return {
        ...next,
        reviews: [...prev.reviews, ...next.reviews.filter((row) => !seen.has(row.id))],
      };
    });
  }, [loadingMore, page, userId]);

  const ownProfile = Boolean(userId && me.id && userId === me.id);
  const name = displayName(page?.target);

  const openAdd = () => {
    if (!accessToken) {
      showAlert('تسجيل الدخول', 'يجب تسجيل الدخول لإضافة تقييم');
      return;
    }
    if (page?.myReviewId) {
      showAlert('التقييم', 'لقد أضفت تقييمك مسبقاً ولا يمكن تعديله');
      return;
    }
    setError(null);
    setDialogKey((value) => value + 1);
    setDialog(true);
  };

  const header = (
    <View>
      <View style={styles.summary}>
        <View style={[getRtlRow(), styles.summaryRow]}>
          <Pressable
            onPress={() => page?.target.id && openUserProfile(router, page.target.id)}
            style={[getRtlRow(), styles.identity]}
          >
            <Avatar person={page?.target} size={48} />
            <AppText variant="label" numberOfLines={2} style={styles.targetName}>
              {name || '…'}
            </AppText>
          </Pressable>
          <StarAverage rating={page?.average ?? null} count={page?.reviewCount ?? 0} />
        </View>
      </View>
      <View style={[getRtlRow(), styles.counts]}>
        <View style={[getRtlRow(), styles.countItem]}>
          <AppIcon name="thumbs-up" size={16} color={palette.positive} />
          <AppText variant="caption" style={styles.countPositive}>
            {positiveReviewsLabel(page?.positiveCount ?? 0)}
          </AppText>
        </View>
        <View style={[getRtlRow(), styles.countItem]}>
          <AppIcon name="thumbs-down" size={16} color={palette.text} />
          <AppText variant="caption" style={styles.countNegative}>
            {negativeReviewsLabel(page?.negativeCount ?? 0)}
          </AppText>
        </View>
      </View>
    </View>
  );

  return (
    <Screen edges={[]} pattern={false} style={styles.screen} testID="reviews-screen">
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={[getRtlRow(), styles.headerRow]}>
          <SarhBackButton color={palette.onHeader} onPress={() => router.back()} />
          <AppText variant="heading3" style={styles.headerTitle}>
            التقييمات
          </AppText>
          <View style={styles.headerSpacer} />
        </View>
      </View>

      {loading && !page ? (
        <ActivityIndicator color={palette.header} style={styles.loader} />
      ) : failed && !page ? (
        <Pressable onPress={() => void load()} style={styles.loader}>
          <AppText variant="body" style={styles.empty}>
            تعذّر تحميل التقييمات. اضغط للمحاولة مرة أخرى
          </AppText>
        </Pressable>
      ) : (
        <FlatList
          data={page?.reviews ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ReviewCard
              item={item}
              onReport={(id) => {
                void promptReport('review', id, !!accessToken);
              }}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <AppText variant="body" style={styles.empty}>
              لا توجد تقييمات بعد
            </AppText>
          }
          contentContainerStyle={{ paddingBottom: ownProfile ? 24 : 96 + insets.bottom }}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={palette.header} style={{ marginVertical: 12 }} /> : null
          }
        />
      )}

      {ownProfile ? null : (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إضافة تقييم"
            onPress={openAdd}
            style={styles.addButton}
            testID="reviews-add-button"
          >
            <AppText variant="button" style={styles.addLabel}>
              إضافة تقييم
            </AppText>
          </Pressable>
        </View>
      )}

      <AddReviewDialog
        key={dialogKey}
        visible={dialog}
        targetName={name}
        submitting={submitting}
        error={error}
        onClose={() => setDialog(false)}
        onSubmit={(input) => {
          if (!userId) return;
          setSubmitting(true);
          setError(null);
          void createUserReview(userId, { ...input, oathAccepted: true }).then((result) => {
            setSubmitting(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            forgetCachedUserProfile(userId);
            setDialog(false);
            setLoading(true);
            void load();
          });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: palette.page },
  header: { backgroundColor: palette.header },
  headerRow: {
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 8,
  },
  headerTitle: {
    flex: 1,
    color: palette.onHeader,
    textAlign: 'center',
  },
  headerSpacer: { width: 40 },
  loader: { marginTop: 48, alignItems: 'center' },
  summary: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: palette.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  summaryRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  identity: {
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  targetName: {
    color: palette.text,
    flexShrink: 1,
  },
  stars: { alignItems: 'center', gap: 2 },
  starSlot: { width: 22, height: 22 },
  starFill: {
    position: 'absolute',
    top: 0,
    start: 0,
    height: 22,
    overflow: 'hidden',
  },
  counts: {
    marginTop: 8,
    marginHorizontal: 12,
    backgroundColor: palette.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countItem: { alignItems: 'center', gap: 6 },
  countPositive: { color: palette.positive },
  countNegative: { color: palette.text },
  card: {
    marginTop: 10,
    marginHorizontal: 12,
    backgroundColor: palette.card,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTop: { alignItems: 'center', gap: 8 },
  reviewerName: { color: palette.name, flexShrink: 1 },
  age: { color: palette.muted },
  flex: { flex: 1 },
  badge: {
    width: 34,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comment: {
    color: palette.text,
    marginTop: 8,
    lineHeight: 22,
  },
  empty: {
    color: palette.muted,
    textAlign: 'center',
    marginTop: 28,
    paddingHorizontal: 24,
  },
  avatar: {
    backgroundColor: palette.header,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  footer: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: palette.page,
  },
  addButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { color: palette.onHeader },
});
