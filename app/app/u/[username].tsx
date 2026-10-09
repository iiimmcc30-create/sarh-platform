// Shared profile link: sarhsa.online/u/<username> (sarhProfileShareUrl) → the user profile.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText } from '@/design-system/components';
import { Screen } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { safeReplace } from '@/lib/safeNavigate';
import { shareLinkUsername } from '@/lib/shareLinks';
import { resolveUsername } from '@/services/users';

export default function SharedProfileLink() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = shareLinkUsername(params.username);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!username) return;
    let alive = true;
    void resolveUsername(username).then((id) => {
      if (!alive) return;
      if (id) safeReplace({ pathname: '/users/[id]', params: { id } }, { force: true }, router);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [router, username]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={username ? `@${username}` : 'الملف الشخصي'} showBack />
      <View style={styles.center}>
        {!username || failed ? (
          <AppText variant="body" color="textSecondary" align="center">
            الحساب غير موجود
          </AppText>
        ) : (
          <ActivityIndicator color={colors.textMuted} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
