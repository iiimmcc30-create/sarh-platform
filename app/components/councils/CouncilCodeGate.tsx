import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  COUNCIL_GOLDEN_LABEL,
  councilUserName,
  isValidCouncilJoinCode,
  type CouncilMeta,
} from '@/services/councils';

type Props = {
  council: Pick<CouncilMeta, 'name' | 'description' | 'owner' | 'golden'>;
  joining: boolean;
  /** Host was already asked in this session. */
  requested: boolean;
  requesting: boolean;
  onSubmit: (code: string) => void;
  onRequestCode: () => void;
};

/**
 * Locked private council: it is listed publicly but the room needs the host's code.
 * «طلب الرمز» sends the host an in-app request (server rate-limited); the host answers
 * with the code or a one-time invite, or ignores it.
 */
export function CouncilCodeGate({ council, joining, requested, requesting, onSubmit, onRequestCode }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const valid = isValidCouncilJoinCode(code);
  return (
    <Stack gap="lg" align="center" style={styles.wrap} testID="council-code-gate">
      <View style={styles.iconCircle}>
        <AppIcon name="lock-closed-outline" size={26} color={colors.textSecondary} />
      </View>
      <Stack gap="xs" align="center">
        <AppText variant="heading3" color="textPrimary" align="center">
          {council.name}
        </AppText>
        {council.golden ? (
          <AppText variant="caption" color="textMuted">
            {COUNCIL_GOLDEN_LABEL}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textMuted" align="center">
          {councilUserName(council.owner)}
        </AppText>
      </Stack>
      {council.description ? (
        <AppText variant="bodySmall" color="textSecondary" align="center" numberOfLines={3}>
          {council.description}
        </AppText>
      ) : null}
      <AppText variant="bodySmall" color="textMuted" align="center">
        هذا المجلس خاص — أدخل الرمز الذي يعطيك إياه المضيف
      </AppText>
      <View style={styles.field}>
        <SarhInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/[^A-Za-z0-9\s-]/g, '').slice(0, 20))}
          placeholder="رمز الدخول"
          appearance="theme"
          autoCapitalize="characters"
          autoCorrect={false}
          testID="council-code-input"
        />
      </View>
      <SarhButton
        title="دخول"
        shape="pill"
        fullWidth
        disabled={!valid}
        loading={joining}
        onPress={() => onSubmit(code)}
      />
      <SarhButton
        title={requested ? 'تم إرسال طلبك إلى المضيف' : 'طلب الرمز من المضيف'}
        leftIcon="hand-left-outline"
        variant="secondary"
        shape="pill"
        fullWidth
        disabled={requested}
        loading={requesting}
        onPress={onRequestCode}
      />
    </Stack>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
    field: { alignSelf: 'stretch' },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
