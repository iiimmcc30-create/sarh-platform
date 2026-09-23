import { Image, uriSource } from '@/components/ui/AppImage';
import { MinistryServiceCard } from '@/components/feature/MinistryServiceCard';
import { PostItem } from '@/components/feature/PostItem';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { MEWA_FALLBACK_AVATAR, MEWA_FALLBACK_COVER, MEWA_USERNAME } from '@/constants/branding';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody } from '@/design-system/layout';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useApp } from '@/hooks/useApp';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { openPostDetail } from '@/lib/openPost';
import { requireAuth, sharePost, showPostMenu } from '@/lib/postInteractions';
import { safePush } from '@/lib/safeNavigate';
import {
  fetchMinistryAccount,
  fetchMinistryPosts,
  fetchOfficialServices,
  type MinistryAccount,
  type OfficialService,
} from '@/services/officialServices';
import { setFollowUser } from '@/services/users';
import { showToast } from '@/lib/toast';
import type { Post } from '@/services/types';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  View,
} from 'react-native';

type MinistryTab = 'info' | 'posts' | 'services';

const TABS: Array<{ key: MinistryTab; label: string }> = [
  { key: 'info', label: 'المعلومات' },
  { key: 'posts', label: 'المنشورات' },
  { key: 'services', label: 'الخدمات' },
];

function formatFollowersAr(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}م مُتابع`;
  }
  if (n >= 10_000) {
    const v = n / 1_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)} ألف مُتابع`;
  }
  return `${n.toLocaleString('en-US')} مُتابع`;
}

function parseTab(value?: string): MinistryTab {
  if (value === 'posts' || value === 'services' || value === 'info') return value;
  return 'info';
}

export default function MinistryProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const {
    me,
    likedPosts,
    bookmarkedPosts,
    repostedPosts,
    toggleLike,
    toggleRepost,
    toggleBookmark,
    deletePost,
  } = useApp();

  const [tab, setTab] = useState<MinistryTab>(parseTab(params.tab));
  const [account, setAccount] = useState<MinistryAccount | null>(null);
  const [services, setServices] = useState<OfficialService[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoadFailed, setPostsLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const load = useCallback(async (force = false) => {
    const [nextAccount, servicesResult] = await Promise.all([
      fetchMinistryAccount({ force }),
      fetchOfficialServices({ force }),
    ]);
    if (nextAccount) setAccount(nextAccount);
    if (servicesResult.fromApi || servicesResult.services.length > 0) {
      setServices(servicesResult.services.filter((item) => item.active !== false));
    }
    if (nextAccount?.id) {
      try {
        const userPosts = await fetchMinistryPosts(nextAccount.id, { force });
        setPosts(userPosts);
        setPostsLoadFailed(false);
      } catch {
        setPostsLoadFailed(true);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          await load(false);
        } catch {
          /* keep previous ministry data */
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const followersLabel = useMemo(
    () => formatFollowersAr(account?.followersCount ?? 0),
    [account?.followersCount],
  );

  const handleFollow = async () => {
    if (!account?.id) {
      Alert.alert('الحساب', 'تعذّر تحميل حساب الوزارة حالياً');
      return;
    }
    if (!isAuthenticated) {
      Alert.alert('تسجيل الدخول', 'يجب تسجيل الدخول للمتابعة');
      return;
    }
    if (followLoading) return;
    setFollowLoading(true);
    try {
      const result = await setFollowUser(account.id, !account.isFollowing);
      if (!result) throw new Error('follow_failed');
      const refreshed = await fetchMinistryAccount({ force: true });
      if (refreshed) setAccount(refreshed);
    } catch {
      void showToast('تعذّرت المتابعة، حاول مجدداً', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `${account?.arabicName || ''}\n${sarhProfileShareUrl(account?.username || MEWA_USERNAME)}`,
      });
    } catch {
      // dismissed
    }
  };

  const openService = (service: OfficialService) => {
    safePush(`/ministry/services/${service.id}`, undefined, router);
  };

  const renderInfo = () => (
    <View style={styles.block}>
      <AppText variant="heading3">الوصف</AppText>
      {account?.about ? (
        <AppText variant="bodySmall" color="textMuted">
          {account.about}
        </AppText>
      ) : null}
      <AppText variant="heading3" style={styles.sectionSpaced}>
        المعلومات
      </AppText>
      {account?.website ? (
        <InfoRow
          styles={styles}
          label="الموقع الإلكتروني"
          value={account.website}
          onPress={() => void Linking.openURL(account.website!)}
          link
        />
      ) : null}
      {account?.publicPhone ? (
        <InfoRow
          styles={styles}
          label="الهاتف"
          value={account.publicPhone}
          onPress={() => void Linking.openURL(`tel:${account.publicPhone}`)}
        />
      ) : null}
      {account?.publicEmail ? (
        <InfoRow
          styles={styles}
          label="البريد الإلكتروني"
          value={account.publicEmail}
          onPress={() => void Linking.openURL(`mailto:${account.publicEmail}`)}
        />
      ) : null}
    </View>
  );

  const renderPosts = () => {
    if (postsLoadFailed && posts.length === 0) {
      return (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.electricBright} />
        </View>
      );
    }
    if (posts.length === 0) {
      return (
        <View style={styles.empty}>
          <AppText variant="body" color="textMuted">لا توجد منشورات بعد</AppText>
        </View>
      );
    }
    return posts.map((post) => (
      <PostItem
        key={post.id}
        variant="profile"
        post={{
          ...post,
          liked: likedPosts.has(post.id),
          bookmarked: bookmarkedPosts.has(post.id),
          reposted: repostedPosts.has(post.id),
        }}
        onPress={() => openPostDetail(router, post.id)}
        onLike={() => requireAuth(isAuthenticated, 'الإعجاب') && void toggleLike(post.id)}
        onRepost={() => requireAuth(isAuthenticated, 'إعادة النشر') && void toggleRepost(post.id)}
        onComment={() => openPostDetail(router, post.id, { focusComment: isAuthenticated })}
        onBookmark={() => requireAuth(isAuthenticated, 'الحفظ') && toggleBookmark(post.id)}
        onShare={() => sharePost(post)}
        onMenu={() => showPostMenu(post, me, router, deletePost, isAuthenticated)}
      />
    ));
  };

  const renderServices = () => {
    if (services.length === 0) {
      return (
        <View style={styles.empty}>
          <AppText variant="body" color="textMuted">لا توجد خدمات متاحة حالياً</AppText>
        </View>
      );
    }
    return (
      <View style={styles.serviceList}>
        {services.map((service) => (
          <MinistryServiceCard
            key={service.id}
            service={service}
            onPress={() => openService(service)}
          />
        ))}
      </View>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        variant="screen"
        title=""
        showBack
        rightIcon="share-outline"
        onRightPress={() => void handleShare()}
        rightAccessibilityLabel="مشاركة"
      />

      <ScreenBody
        gutter={false}
        padBottom="xxxl"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.electricBright}
          />
        }
      >
        <View style={styles.coverWrap}>
          <Image
            source={account?.coverImage ? uriSource(account.coverImage) : MEWA_FALLBACK_COVER}
            style={styles.cover}
            contentFit="cover"
          />
        </View>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarRing}>
            <Image
              source={account?.avatar ? uriSource(account.avatar) : MEWA_FALLBACK_AVATAR}
              style={styles.avatar}
              contentFit="cover"
              accessibilityLabel={account?.arabicName || ''}
            />
          </View>
        </View>

        <View style={styles.identity}>
          <Row justify="center" align="center" gap="sm" style={styles.nameRow}>
            <AppText variant="heading2" align="center">
              {account?.arabicName || ''}
            </AppText>
            {account?.verified ? <VerificationBadge size={18} /> : null}
          </Row>
          <AppText variant="caption" color="primary">
            {followersLabel}
          </AppText>
          {account?.bio ? (
            <AppText variant="bodySmall" color="textMuted" align="center">
              {account.bio}
            </AppText>
          ) : null}
          <SarhButton
            title={account?.isFollowing ? 'متابَع' : 'متابعة'}
            variant={account?.isFollowing ? 'secondary' : 'primary'}
            size="sm"
            onPress={() => void handleFollow()}
            loading={followLoading}
            accessibilityLabel={account?.isFollowing ? 'متابَع' : 'متابعة'}
          />
        </View>

        <Row style={styles.tabs}>
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={styles.tabItem}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <AppText variant="caption" color={active ? 'primary' : 'textMuted'}>
                  {item.label}
                </AppText>
                {active ? <View style={styles.tabLine} /> : <View style={styles.tabLineOff} />}
              </Pressable>
            );
          })}
        </Row>

        {loading && !account ? (
          <ActivityIndicator color={colors.electricBright} style={styles.loader} />
        ) : tab === 'info' ? (
          renderInfo()
        ) : tab === 'posts' ? (
          renderPosts()
        ) : (
          renderServices()
        )}
      </ScreenBody>
    </Screen>
  );
}

function InfoRow({
  styles,
  label,
  value,
  onPress,
  link,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string;
  onPress: () => void;
  link?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={styles.infoRow} accessibilityRole="link">
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="body" color={link ? 'primary' : 'textPrimary'}>
        {value}
      </AppText>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    coverWrap: {
      height: 148,
      backgroundColor: colors.bgDeep,
    },
    cover: {
      width: '100%',
      height: '100%',
    },
    avatarWrap: {
      alignItems: 'center',
      marginTop: -48,
    },
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.bgSurface,
      borderWidth: 4,
      borderColor: colors.screenRoot,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatar: {
      width: 78,
      height: 78,
    },
    identity: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    nameRow: {
      justifyContent: 'center',
    },
    tabs: {
      marginTop: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderHairline,
      paddingHorizontal: spacing.sm,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingTop: spacing.sm,
    },
    tabLine: {
      marginTop: 8,
      height: 2,
      width: '70%',
      backgroundColor: colors.electric,
      borderRadius: 2,
    },
    tabLineOff: {
      marginTop: 8,
      height: 2,
    },
    loader: { marginTop: spacing.xl },
    block: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      gap: spacing.sm,
    },
    sectionSpaced: {
      marginTop: spacing.md,
    },
    infoRow: {
      paddingVertical: spacing.sm,
      gap: 4,
    },
    empty: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
    },
    serviceList: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      gap: spacing.md,
    },
  });
}
