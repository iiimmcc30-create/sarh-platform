import { SarhChip, SarhChipRow } from '@/design-system/components';
// Powered by OnSpace.AI
// SAFAT — Live Tab (البث المباشر)
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useAppChromeScroll } from '@/hooks/useAppChrome';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { showLiveBroadcastComingSoonAlert } from '@/lib/liveStreamAccess';
import { LiveStreamItem } from '@/components/feature/LiveStreamItem';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import type { LiveStream } from '@/services/types';
import { marginAutoStart } from '@/lib/rtl';

const LIVE_CATEGORIES = ['الكل', 'إبل', 'خيول', 'أغنام', 'صقور', 'معز'] as const;
const LIVE_CAT_MAP: Record<string, string> = {
  'إبل': 'camels',
  'خيول': 'horses',
  'أغنام': 'sheep',
  'صقور': 'falcons',
  'معز': 'goats',
};
const LIVE_REFRESH_TTL_MS = 45_000;
const LIVE_ROW_HEIGHT = 200 + spacing.md;

export default function LiveScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { onChromeScroll } = useAppChromeScroll();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accessToken } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('الكل');
  const [streamsList, setStreamsList] = useState<LiveStream[]>([]);
  const lastFetchAt = useRef(0);

  const fetchStreams = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchAt.current < LIVE_REFRESH_TTL_MS && streamsList.length > 0) {
      return;
    }
    try {
      const headers: HeadersInit = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const res = await fetch(`${API_BASE}/api/livestreams`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setStreamsList(json.data);
          lastFetchAt.current = Date.now();
        }
      }
    } catch (err) {
      console.warn('[LiveScreen] Failed to fetch streams:', err);
    }
  }, [accessToken, streamsList.length]);

  useFocusEffect(
    useCallback(() => {
      void fetchStreams();
    }, [fetchStreams]),
  );

  const filtered = useMemo(() => {
    if (activeCategory === 'الكل') return streamsList;
    const target = LIVE_CAT_MAP[activeCategory];
    return streamsList.filter(
      (l) =>
        l.category?.toLowerCase() === target ||
        l.category?.toLowerCase().includes(activeCategory),
    );
  }, [streamsList, activeCategory]);

  const featured = filtered[0] ?? null;
  const listData = useMemo(() => filtered.slice(1), [filtered]);

  const totalViewers = useMemo(
    () => streamsList.reduce((sum, l) => sum + (l.viewers || 0), 0),
    [streamsList],
  );

  const openWatch = useCallback(
    (id: string) => router.push({ pathname: '/live/watch/[id]', params: { id } } as never),
    [router],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LiveStream>) => (
      <Pressable onPress={() => openWatch(item.id)}>
        <LiveStreamItem stream={item} height={200} />
      </Pressable>
    ),
    [openWatch],
  );

  const keyExtractor = useCallback((item: LiveStream) => item.id, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: LIVE_ROW_HEIGHT,
      offset: LIVE_ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  const ListHeader = useCallback(
    () => (
      <View>
        <SarhChipRow contentPaddingHorizontal={0} style={styles.catRow}>
          {LIVE_CATEGORIES.map((cat) => (
            <SarhChip appearance="filter"
              key={cat}
              label={cat}
              selected={activeCategory === cat}
              onPress={() => setActiveCategory(cat)}
            />
          ))}
        </SarhChipRow>

        {featured ? (
          <Pressable style={styles.featured} onPress={() => openWatch(featured.id)}>
            <Image
              source={uriSource(featured.thumbnail)}
              style={styles.featuredImg}
              contentFit="cover"
              transition={150}
              priority="high"
            />
            <LinearGradient
              colors={['transparent', 'rgba(6,9,26,0.95)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.liveTag}>
              <View style={styles.liveDotSmall} />
              <Text style={styles.liveTagText}>LIVE</Text>
            </View>
            <View style={styles.featuredContent}>
              <UserProfileLink userId={featured.host?.id} style={styles.hostRow}>
                <Image source={uriSource(featured.host?.avatar)} style={styles.hostAvatar} contentFit="cover" transition={0} />
                <View>
                  <Text style={styles.hostName}>{featured.host?.arabicName || 'مستخدم سرح'}</Text>
                  <Text style={styles.hostHandle}>@{featured.host?.username || 'user'}</Text>
                </View>
              </UserProfileLink>
              <Text style={styles.featuredTitle} numberOfLines={2}>{featured.arabicTitle}</Text>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <AppIcon name="eye" size={14} color={colors.textMuted} />
                  <Text style={styles.statText}>{(featured.viewers ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.stat}>
                  <AppIcon name="heart" size={14} color={colors.rose} />
                  <Text style={styles.statText}>{(featured.likes ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.catBadge}>
                  <Text style={styles.catBadgeText}>{featured.category}</Text>
                </View>
              </View>
            </View>
          </Pressable>
        ) : null}
      </View>
    ),
    [activeCategory, colors.rose, colors.textMuted, featured, openWatch, styles],
  );

  const ListEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>📡</Text>
        <Text style={styles.emptyText}>لا يوجد بث مباشر الآن</Text>
      </View>
    ),
    [styles.empty, styles.emptyIcon, styles.emptyText],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveBadgeText}>مباشر</Text>
        </View>
        <Text style={styles.title}>البث المباشر</Text>
        <View style={styles.viewersWrap}>
          <AppIcon name="eye" size={14} color={colors.textMuted} />
          <Text style={styles.viewersCount}>{(totalViewers / 1000).toFixed(1)}k</Text>
        </View>
      </View>

      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={filtered.length === 0 ? ListEmpty : null}
        ListFooterComponent={<View style={{ height: 100 + insets.bottom }} />}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onChromeScroll}
        removeClippedSubviews
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
      />

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, spacing.lg) + 58 }]}
        onPress={() => showLiveBroadcastComingSoonAlert()}
      >
        <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.fabGrad}>
          <View style={styles.fabDot} />
          <Text style={styles.fabText}>قريباً</Text>
        </LinearGradient>
      </Pressable>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.screenRoot },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    backgroundColor: `${colors.liveRed}20`,
    borderRadius: radius.pill, borderWidth: 1, borderColor: `${colors.liveRed}40`,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.liveRed },
  liveBadgeText: { ...typography.micro, color: colors.liveRed },
  title: { ...typography.h2, color: colors.textPrimary },
  viewersWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewersCount: { ...typography.caption, color: colors.textMuted },
  catRow: { paddingBottom: spacing.md },
  scroll: { paddingHorizontal: spacing.lg },
  featured: {
    height: 220, borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.lg,
  },
  featuredImg: { ...StyleSheet.absoluteFillObject },
  liveTag: {
    position: 'absolute', top: spacing.md, right: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.liveRed, borderRadius: radius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveTagText: { ...typography.badge, color: '#fff', letterSpacing: 0.5 },
  featuredContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.lg, gap: spacing.sm,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  hostAvatar: { width: 28, height: 28, borderRadius: 16, borderWidth: 1, borderColor: colors.borderMid },
  hostName: { ...typography.caption, color: colors.textPrimary, fontWeight: '600' },
  hostHandle: { ...typography.micro, color: colors.textMuted },
  featuredTitle: { ...typography.h3, color: '#fff' },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { ...typography.caption, color: colors.textMuted },
  catBadge: {
    ...marginAutoStart(), paddingHorizontal: 8, paddingVertical: 2,
    backgroundColor: colors.bgGlass, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.borderSoft,
  },
  catBadgeText: { ...typography.micro, color: colors.textSecondary },
  empty: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.md },
  emptyIcon: { fontSize: 40 },
  emptyText: { ...typography.body, color: colors.textMuted },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
  },
  fabDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  fabText: { ...typography.button, color: '#fff' },
  });
}
