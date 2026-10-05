import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { SkeletonRegion, UserIdentityRowSkeleton } from '@/components/ui/skeleton';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton, SarhDivider, SarhInput } from '@/design-system/components';
import { BottomAction, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { openUserProfile } from '@/lib/openUserProfile';
import { safeReplace } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COLLECTION_NO_MEMBERS_TEXT,
  addCollectionMember,
  fetchCollectionMembers,
  removeCollectionMember,
  searchCollectionUsers,
  type CollectionCandidate,
  type CollectionUser,
} from '@/services/collections';

type Row =
  | { kind: 'header'; id: string; title: string }
  | { kind: 'user'; id: string; user: CollectionCandidate | (CollectionUser & { isMember?: boolean }) }
  | { kind: 'empty'; id: string; text: string };

export default function CollectionMembersScreen() {
  const router = useRouter();
  const { gutter } = useLayout();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const { isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ id?: string; setup?: string }>();
  const collectionId = typeof params.id === 'string' ? params.id : '';
  const isSetup = params.setup === '1';

  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [candidates, setCandidates] = useState<CollectionCandidate[]>([]);
  const [members, setMembers] = useState<CollectionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const load = useCallback(async (q: string) => {
    if (!collectionId) return;
    setLoading(true);
    try {
      const [usersPage, membersPage] = await Promise.all([
        searchCollectionUsers(q, collectionId),
        isSetup
          ? Promise.resolve({ users: [] as CollectionUser[] })
          : fetchCollectionMembers(collectionId),
      ]);
      if (!mounted.current) return;
      setCandidates(usersPage.users);
      if (!isSetup) setMembers(membersPage.users);
    } catch (err) {
      void showToast(err instanceof Error ? err.message : 'تعذّر تحميل الحسابات', 'error');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [collectionId, isSetup]);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setApplied(query.trim()), 280);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const markAdded = useCallback((userId: string) => {
    setCandidates((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isMember: true } : u)),
    );
  }, []);

  const add = useCallback(
    async (user: CollectionCandidate) => {
      if (!isAuthenticated || user.isMember || busyId) return;
      setBusyId(user.id);
      try {
        await addCollectionMember(collectionId, user.id);
        markAdded(user.id);
        setMembers((prev) =>
          prev.some((m) => m.id === user.id) ? prev : [user, ...prev],
        );
      } catch (err) {
        void showToast(err instanceof Error ? err.message : 'تعذّر إضافة الحساب', 'error');
      } finally {
        if (mounted.current) setBusyId(null);
      }
    },
    [busyId, collectionId, isAuthenticated, markAdded],
  );

  const remove = useCallback(
    async (userId: string) => {
      if (!isAuthenticated || busyId) return;
      setBusyId(userId);
      try {
        await removeCollectionMember(collectionId, userId);
        setMembers((prev) => prev.filter((m) => m.id !== userId));
        setCandidates((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, isMember: false } : u)),
        );
      } catch (err) {
        void showToast(err instanceof Error ? err.message : 'تعذّر إزالة الحساب', 'error');
      } finally {
        if (mounted.current) setBusyId(null);
      }
    },
    [busyId, collectionId, isAuthenticated],
  );

  const finish = useCallback(() => {
    safeReplace(
      { pathname: '/collections/[id]', params: { id: collectionId } },
      undefined,
      router,
    );
  }, [collectionId, router]);

  const rows: Row[] = [];
  if (!isSetup) {
    rows.push({ kind: 'header', id: 'h-members', title: 'أعضاء المجموعة' });
    if (!loading && members.length === 0) {
      rows.push({ kind: 'empty', id: 'e-members', text: COLLECTION_NO_MEMBERS_TEXT });
    } else {
      for (const u of members) {
        rows.push({ kind: 'user', id: `m-${u.id}`, user: { ...u, isMember: true } });
      }
    }
  }
  rows.push({
    kind: 'header',
    id: 'h-suggested',
    title: applied ? 'نتائج البحث' : 'حسابات مقترحة',
  });
  if (!loading && candidates.length === 0) {
    rows.push({
      kind: 'empty',
      id: 'e-suggested',
      text: applied ? 'لم نعثر على حسابات مطابقة' : COLLECTION_NO_MEMBERS_TEXT,
    });
  } else {
    for (const u of candidates) {
      // During manage mode, skip already-listed members in the suggested section.
      if (!isSetup && u.isMember) continue;
      rows.push({ kind: 'user', id: `c-${u.id}`, user: u });
    }
  }

  const renderItem = ({ item, index }: ListRenderItemInfo<Row>) => {
    if (item.kind === 'header') {
      return (
        <AppText variant="label" color="textPrimary" style={styles.section}>
          {item.title}
        </AppText>
      );
    }
    if (item.kind === 'empty') {
      return (
        <AppText variant="body" color="textMuted" align="center" style={styles.empty}>
          {item.text}
        </AppText>
      );
    }
    const user = item.user;
    const isMember = Boolean(user.isMember);
    const next = rows[index + 1];
    const showDivider = next?.kind === 'user';
    return (
      <>
        <Pressable
          style={[styles.userRow, { paddingHorizontal: gutter }]}
          onPress={() => openUserProfile(router, user.id)}
        >
          <UserIdentityRow
            avatarUri={user.avatar}
            displayName={user.arabicName || user.displayName || user.username}
            username={user.username}
            verified={user.verified}
            verifiedTier={user.verifiedTier}
            avatarSize={USER_IDENTITY.listAvatarSize}
            avatarRadius={USER_IDENTITY.listAvatarRadius}
            avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
            avatarSide="end"
            nameLines={2}
            colors={colors}
            trailing={
              <SarhButton
                title={isMember ? (isSetup ? 'تمت الإضافة' : 'إزالة') : 'إضافة'}
                variant={isMember ? 'secondary' : 'primary'}
                size="sm"
                shape="pill"
                loading={busyId === user.id}
                disabled={isSetup && isMember}
                onPress={() =>
                  void (isMember && !isSetup ? remove(user.id) : add(user as CollectionCandidate))
                }
              />
            }
          />
        </Pressable>
        {showDivider ? <SarhDivider /> : null}
      </>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        variant="screen"
        title={isSetup ? 'أضف أعضاء مجموعتك' : 'إدارة الأعضاء'}
        showBack={!isSetup}
        onBackPress={isSetup ? finish : undefined}
      />
      <ScreenBody scroll={false} gutter={false} bottomInset={isSetup ? 'action' : undefined}>
        {isSetup ? (
          <AppText variant="body" color="textSecondary" style={styles.subtitle}>
            اختر الحسابات التي تريد ظهور محتواها في مجموعتك.
          </AppText>
        ) : null}
        <View style={styles.searchWrap}>
          <SarhInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث بالاسم أو @username"
            leadingIcon="search"
            size="compact"
            shape="pill"
            appearance="theme"
            accessibilityRole="search"
            accessibilityLabel="بحث عن حسابات"
            trailingIcon={query ? 'close-circle' : undefined}
            onTrailingPress={query ? () => setQuery('') : undefined}
          />
        </View>

        {loading && candidates.length === 0 && members.length === 0 ? (
          <SkeletonRegion style={styles.skel}>
            {[0, 1, 2, 3, 4].map((i) => (
              <UserIdentityRowSkeleton key={i} />
            ))}
          </SkeletonRegion>
        ) : (
          <Stack fill>
            {/* FlatList via native — AppFlatList for consistency */}
            <MembersList
              data={rows}
              renderItem={renderItem}
              loadingMore={false}
              colors={colors}
            />
          </Stack>
        )}
      </ScreenBody>
      {isSetup ? (
        <BottomAction>
          <SarhButton title="تخطي" variant="secondary" shape="pill" fullWidth onPress={finish} />
        </BottomAction>
      ) : null}
    </Screen>
  );
}

function MembersList({
  data,
  renderItem,
  loadingMore,
  colors,
}: {
  data: Row[];
  renderItem: (info: ListRenderItemInfo<Row>) => ReactElement | null;
  loadingMore: boolean;
  colors: ThemeColors;
}) {
  return (
    <AppFlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xxxl }}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator color={colors.electric} style={{ marginVertical: spacing.md }} />
        ) : null
      }
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    subtitle: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    searchWrap: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: colors.screenRoot,
    },
    section: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.sm,
    },
    empty: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
    userRow: { paddingVertical: spacing.sm },
    skel: { paddingTop: spacing.md, gap: spacing.sm },
  });
}
