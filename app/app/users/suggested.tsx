import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { UserIdentityRow, USER_IDENTITY } from '@/components/ui/UserIdentityRow';
import { AppText, SarhBackButton } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow } from '@/lib/rtl';
import { showToast } from '@/lib/toast';
import { fetchSearchExplore, type ExploreAccountItem } from '@/services/searchDiscovery';
import { setFollowUser } from '@/services/users';

/** «حسابات مقترحة» — opened from the add-user button on the community page. */
export default function SuggestedAccountsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const [users, setUsers] = useState<ExploreAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    void fetchSearchExplore()
      .then((data) => {
        if (!alive) return;
        const sec = (data.sections ?? []).find((s) => s.type === 'accounts');
        setUsers(((sec?.items ?? []) as ExploreAccountItem[]).filter(Boolean));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (id: string) => {
    if (!isAuthenticated) {
      router.push('/auth/welcome' as never);
      return;
    }
    const next = !following[id];
    setFollowing((m) => ({ ...m, [id]: next }));
    const res = await setFollowUser(id, next);
    if (!res) {
      setFollowing((m) => ({ ...m, [id]: !next }));
      void showToast('تعذّرت المتابعة، حاول مجدداً', 'error');
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.header, getRtlRow()]}>
        <SarhBackButton onPress={() => router.back()} />
        <AppText variant="heading3" color="textPrimary" style={styles.title}>
          حسابات مقترحة
        </AppText>
      </View>
      <ScreenBody padBottom="xxxl">
        {loading ? (
          <ActivityIndicator color={colors.textPrimary} style={{ marginTop: 32 }} />
        ) : users.length === 0 ? (
          <AppText variant="body" color="textMuted" align="center" style={{ marginTop: 32 }}>
            لا توجد اقتراحات الآن
          </AppText>
        ) : (
          <Stack gap="sm">
            {users.map((u) => {
              const on = following[u.id] === true;
              return (
                <UserIdentityRow
                  key={u.id}
                  avatarUri={u.avatar}
                  displayName={u.arabicName || u.displayName || u.username}
                  username={u.username}
                  verified={u.verified}
                  verifiedTier={u.verifiedTier}
                  avatarSize={USER_IDENTITY.listAvatarSize}
                  avatarRadius={USER_IDENTITY.listAvatarRadius}
                  avatarBorderWidth={USER_IDENTITY.listAvatarBorder}
                  onPress={() => router.push({ pathname: '/users/[id]', params: { id: u.id } } as never)}
                  trailing={
                    <Pressable
                      onPress={() => void toggle(u.id)}
                      accessibilityRole="button"
                      style={[
                        styles.pill,
                        on
                          ? { borderColor: colors.borderSoft }
                          : { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
                      ]}
                    >
                      <AppText
                        variant="caption"
                        style={{ fontWeight: '700', color: on ? colors.textPrimary : colors.screenRoot }}
                      >
                        {on ? 'متابَع' : 'تابِع'}
                      </AppText>
                    </Pressable>
                  }
                />
              );
            })}
          </Stack>
        )}
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  title: { flex: 1 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
