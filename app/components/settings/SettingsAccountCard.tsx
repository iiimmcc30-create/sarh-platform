import { Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { AppText, SarhAvatar } from '@/design-system/components';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, rtlForwardIcon } from '@/lib/rtl';

export type SettingsAccountCardProps = {
  name: string;
  username: string | null;
  avatar?: string | null;
  verified: boolean;
  tier?: string | null;
  /** «مشترك ذهبي» for subscribers; omitted for free accounts (no plan line). */
  planLine?: string | null;
  onPress: () => void;
};

/** Top card: avatar, name + badge, @username, plan; tap opens edit profile. */
export function SettingsAccountCard({
  name,
  username,
  avatar,
  verified,
  tier,
  planLine,
  onPress,
}: SettingsAccountCardProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="settings-account-card"
        accessibilityRole="button"
        accessibilityLabel={`${name}، تعديل الملف الشخصي`}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          getRtlRow(),
          {
            backgroundColor: pressed ? colors.bgElevated : colors.bgSurface,
            borderColor: colors.borderSoft,
          },
        ]}
      >
        <SarhAvatar uri={avatar} name={name} size="lg" />
        <View style={styles.texts}>
          {/*
            Pass a themed DS AppText: VerifiedInlineName's fallback is the legacy
            AppText with no colour, which renders RN's default black and was
            invisible on the dark card.
          */}
          <VerifiedInlineName name={name} verified={verified} tier={tier} username={username}>
            <AppText
              testID="settings-account-name"
              variant="heading3"
              color="textPrimary"
              numberOfLines={1}
              style={styles.name}
            >
              {name}
            </AppText>
          </VerifiedInlineName>
          {username ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              @{username}
            </AppText>
          ) : null}
          {planLine ? (
            <AppText variant="caption" color="textSecondary" numberOfLines={1}>
              {planLine}
            </AppText>
          ) : null}
        </View>
        <AppIcon name={rtlForwardIcon()} size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 12 },
  card: {
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  name: { flexShrink: 1 },
});

export default SettingsAccountCard;
