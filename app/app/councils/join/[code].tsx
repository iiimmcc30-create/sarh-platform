// «المجالس» invite link: /councils/join/<code> → resolves the council and opens the room.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { Screen } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { safeReplace } from '@/lib/safeNavigate';
import { COUNCIL_WEB_TEXT, councilErrorMessage, resolveCouncilInvite } from '@/services/councils';

export default function CouncilInviteScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code : '';
  const validCode = /^[A-Za-z0-9]{6,32}$/.test(code);
  const [resolveError, setError] = useState<string | null>(null);
  const error = validCode ? resolveError : 'رابط الدعوة غير صالح';

  useEffect(() => {
    if (Platform.OS === 'web' || !validCode) return;
    void resolveCouncilInvite(code)
      .then((r) =>
        safeReplace({ pathname: '/councils/[id]', params: { id: r.councilId, code: r.code } }, undefined, router),
      )
      .catch((err) => setError(councilErrorMessage(err)));
  }, [code, router, validCode]);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="دعوة إلى مجلس" showBack />
      {Platform.OS === 'web' ? (
        <CouncilNotice title="المجالس في التطبيق" message={COUNCIL_WEB_TEXT} />
      ) : error ? (
        <CouncilNotice
          icon="lock-closed-outline"
          title="تعذّر فتح الدعوة"
          message={error}
          actionLabel="المجالس"
          onAction={() => safeReplace('/councils', undefined, router)}
        />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
