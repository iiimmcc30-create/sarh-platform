import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText, SarhDivider, SarhSettingsRow } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { formatRelativeTimeAr } from '@/lib/formatRelativeTime';
import { getRtlRow } from '@/lib/rtl';
import { publicIpLabel, type ConnectedSession } from '@/services/userSettings';
import { formatArabicDate } from '@/services/verification';
import { SettingsActionRow, SettingsGroup, SettingsPill } from './SettingsRows';

export const SESSION_PLATFORM_ICON: Record<ConnectedSession['platform'], string> = {
  ios: 'phone-portrait-outline',
  android: 'phone-portrait-outline',
  web: 'globe-outline',
  unknown: 'phone-portrait-outline',
};

const PLATFORM_NAME: Record<ConnectedSession['platform'], string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'متصفح',
  unknown: 'جهاز',
};

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { alignItems: 'center', gap: 8 },
});

/** «آخر نشاط»: «نشط الآن» on this device, relative time for the others. */
export function sessionActivityLabel(session: ConnectedSession): string {
  if (session.current) return 'نشط الآن';
  const at = session.lastActiveAt ?? session.signedInAt;
  const rel = formatRelativeTimeAr(at);
  return rel === 'الآن' ? 'نشط الآن' : `آخر نشاط ${rel}`;
}

/** One signed-in device as an inset-grouped card: identity, details, sign-out. */
export function SessionDeviceCard({
  session,
  onSignOut,
  busy,
  groupTitle,
  groupFooter,
}: {
  groupTitle?: string;
  groupFooter?: string;
  session: ConnectedSession;
  /** Omit when the server cannot revoke (older API): the card is read-only. */
  onSignOut?: () => void;
  busy?: boolean;
}) {
  const { colors } = useTheme();
  const ip = publicIpLabel(session.ip);
  return (
    <SettingsGroup title={groupTitle} footer={groupFooter}>
      <View style={[styles.head, getRtlRow()]}>
        <View style={[styles.tile, { backgroundColor: colors.bgElevated }]}>
          <AppIcon name={SESSION_PLATFORM_ICON[session.platform]} size={22} color={colors.textPrimary} />
        </View>
        <View style={styles.texts}>
          <View style={[styles.titleRow, getRtlRow()]}>
            <AppText variant="label" color="textPrimary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {session.label}
            </AppText>
            {session.current ? <SettingsPill label="هذا الجهاز" tone="success" /> : null}
          </View>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {PLATFORM_NAME[session.platform]} · {sessionActivityLabel(session)}
          </AppText>
        </View>
      </View>
      <SarhDivider inset />
      <SarhSettingsRow
        title="تسجيل الدخول"
        value={formatArabicDate(session.signedInAt) || undefined}
        showDivider={!!ip || !!onSignOut}
      />
      {ip ? <SarhSettingsRow title="عنوان الشبكة" value={ip} valueLtr showDivider={!!onSignOut} /> : null}
      {onSignOut ? (
        <SettingsActionRow
          title={session.current ? 'تسجيل الخروج' : 'تسجيل خروج هذا الجهاز'}
          tone="danger"
          loading={busy}
          onPress={onSignOut}
        />
      ) : null}
    </SettingsGroup>
  );
}
