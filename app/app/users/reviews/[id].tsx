import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { SarhBackButton } from '@/design-system/components';
import { AddReviewDialog } from '@/components/feature/AddReviewDialog';
import { useAuth } from '@/contexts/AuthContext';
import { profileStarFills } from '@/lib/aboutAccount';
import { formatReviewAgeAr } from '@/lib/formatReviewAge';
import { showAlert } from '@/lib/confirmDialog';
import { promptReport } from '@/services/reports';
import {
  createUserReview,
  fetchUserReviews,
  type CreateReviewInput,
  type ReviewAuthor,
  type UserReviewCard,
  type UserReviewsPage,
} from '@/services/reviews';

const BLUE = '#1A6FB5';
const GOLD = '#F5B400';
const GREEN = '#1F9D55';
const RED = '#E0453A';
const PAGE = '#F3F5F8';
const INK = '#1C2833';
const MUTED = '#66727C';

export default function UserReviewsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken, user } = useAuth();
  const [page, setPage] = useState<UserReviewsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const next = await fetchUserReviews(id);
    setPage(next);
    setFailed(!next);
    setLoading(false);
  }, [id]);

  const loadMore = useCallback(async () => {
    if (!id || !page?.hasMore || !page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    const next = await fetchUserReviews(id, page.nextCursor);
    setLoadingMore(false);
    if (!next) return;
    setPage((prev) =>
      prev
        ? {
            ...next,
            reviews: [...prev.reviews, ...next.reviews],
          }
        : next,
    );
  }, [id, loadingMore, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const viewerId = user?.id;
  const ownProfile = !!viewerId && viewerId === id;
  const already = page?.viewerHasReviewed === true;
  const targetName = displayName(page?.target);

  const openComposer = () => {
    if (!accessToken) {
      void showAlert('تسجيل الدخول', 'يجب تسجيل الدخول لإضافة تقييم');
      return;
    }
    if (ownProfile) {
      void showAlert('التقييمات', 'لا يمكنك تقييم حسابك');
      return;
    }
    if (already) {
      void showAlert('التقييمات', 'لقد أرسلت تقييمك ولا يمكن تعديله أو حذفه');
      return;
    }
    setDialog(true);
  };

  const submit = async (input: CreateReviewInput) => {
    if (!id) return;
    setSubmitting(true);
    const result = await createUserReview(id, input);
    setSubmitting(false);
    if (!result.ok) {
      void showAlert('تعذّر الإرسال', result.message);
      return;
    }
    setDialog(false);
    await load();
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <SarhBackButton onPress={() => router.back()} color="#FFFFFF" />
        <AppText style={styles.headerTitle}>التقييمات</AppText>
        <View style={styles.headerSide} />
      </View>

      {loading && !page ? (
        <ActivityIndicator color={BLUE} style={styles.loader} />
      ) : failed || !page ? (
        <View style={styles.emptyWrap}>
          <AppText style={styles.empty}>تعذّر تحميل التقييمات</AppText>
          <Pressable onPress={() => void load()}>
            <AppText style={styles.retry}>إعادة المحاولة</AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={page.reviews}
          keyExtractor={(item) => item.id}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96, paddingTop: 8 }}
          ListHeaderComponent={
            <View>
              <View style={styles.summary}>
                <View style={styles.identity}>
                  <Avatar person={page.target} size={54} />
                  <AppText style={styles.targetName} numberOfLines={2}>
                    {targetName}
                  </AppText>
                </View>
                <Stars rating={page.average} count={page.reviewCount} size={18} />
              </View>
              <View style={styles.counts}>
                <Count icon="thumbs-up" color={GREEN} value={page.positiveCount} label="تعليق ايجابي" />
                <Count icon="thumbs-down" color={MUTED} value={page.negativeCount} label="تعليق سلبي" />
              </View>
            </View>
          }
          ListEmptyComponent={<AppText style={styles.empty}>لا توجد تقييمات بعد</AppText>}
          renderItem={({ item }) => (
            <ReviewCard
              item={item}
              canReport={!!accessToken && item.reviewer.id !== viewerId}
              onReport={() => void promptReport('review', item.id, !!accessToken)}
            />
          )}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={BLUE} style={styles.loader} /> : null
          }
        />
      )}

      {!ownProfile ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={[styles.addButton, already && styles.addButtonDone]}
            onPress={openComposer}
            accessibilityRole="button"
          >
            <AppText style={styles.addLabel}>{already ? 'تم إرسال تقييمك' : 'إضافة تقييم'}</AppText>
          </Pressable>
        </View>
      ) : null}

      <AddReviewDialog
        visible={dialog}
        targetName={targetName}
        submitting={submitting}
        onClose={() => setDialog(false)}
        onSubmit={(input) => void submit(input)}
      />
    </View>
  );
}

function displayName(person?: ReviewAuthor | null): string {
  if (!person) return '';
  return person.arabicName || person.displayName || person.username;
}

function Avatar({ person, size }: { person: ReviewAuthor; size: number }) {
  const source = uriSource(person.avatar);
  if (source) {
    return <Image source={source} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <AppIcon name="person-circle-outline" size={size * 0.62} color={BLUE} />
    </View>
  );
}

function Stars({ rating, count, size }: { rating: number | null; count: number; size: number }) {
  const fills = profileStarFills(rating, count) ?? [0, 0, 0, 0, 0];
  return (
    <View style={styles.stars}>
      {fills.map((fill, index) => (
        <AppIcon
          key={index}
          name="star"
          variant={fill > 0 ? 'sr' : 'rr'}
          size={size}
          color={fill > 0 ? GOLD : '#D5DDE3'}
        />
      ))}
    </View>
  );
}

function Count({
  icon,
  color,
  value,
  label,
}: {
  icon: string;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <View style={styles.count}>
      <AppIcon name={icon} variant="sr" size={16} color={color} />
      <AppText style={[styles.countText, { color }]}>
        {value} {label}
      </AppText>
    </View>
  );
}

function ReviewCard({
  item,
  canReport,
  onReport,
}: {
  item: UserReviewCard;
  canReport: boolean;
  onReport: () => void;
}) {
  const positive = item.recommend;
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardIdentity}>
          <Avatar person={item.reviewer} size={36} />
          <AppText style={styles.reviewerName} numberOfLines={1}>
            {displayName(item.reviewer)}
          </AppText>
        </View>
        <View style={styles.cardMeta}>
          <AppText style={styles.age}>{formatReviewAgeAr(item.createdAt)}</AppText>
          {item.legacy ? (
            <Stars rating={item.rating} count={1} size={12} />
          ) : (
            <View style={[styles.badge, { backgroundColor: positive ? GREEN : RED }]}>
              <AppIcon name={positive ? 'thumbs-up' : 'thumbs-down'} variant="sr" size={14} color="#FFFFFF" />
            </View>
          )}
          {canReport ? (
            <Pressable onPress={onReport} hitSlop={8} accessibilityLabel="إبلاغ عن التقييم">
              <AppIcon name="flag-outline" size={14} color={MUTED} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {item.comment ? <AppText style={styles.comment}>{item.comment}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE },
  header: {
    backgroundColor: BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSide: { width: 44 },
  summary: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  targetName: {
    color: INK,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  stars: { flexDirection: 'row', gap: 2 },
  counts: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E3E8EE',
  },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6ECF2',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  reviewerName: { color: BLUE, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  age: { color: MUTED, fontSize: 13 },
  comment: { color: INK, fontSize: 15, lineHeight: 24, marginTop: 8 },
  avatarFallback: {
    backgroundColor: '#E7F1F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: { alignItems: 'center', paddingTop: 48, gap: 8 },
  empty: { textAlign: 'center', color: MUTED, marginTop: 28 },
  retry: { color: BLUE, fontWeight: '700' },
  loader: { marginTop: 24 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE,
  },
  addButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDone: { backgroundColor: '#8AA4B8' },
  addLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
