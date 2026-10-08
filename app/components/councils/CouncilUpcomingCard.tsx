// «قادمة» — a scheduled council: time, host, «ذكّرني» toggle (or «ابدأ الآن» for the host).
import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { subscriberTierOf } from '@/lib/subscriberTier';
import { resolveMediaUrl } from '@/services/media';
import {
  COUNCIL_FOLLOWERS_ONLY_LABEL,
  councilScheduleLabel,
  councilUserName,
  type CouncilUpcomingCard as UpcomingData,
} from '@/services/councils';
import { CouncilTierTag } from './CouncilTierTag';

type Props = {
  council: UpcomingData;
  busy?: boolean;
  onToggleRemind: (c: UpcomingData) => void;
  onStart: (c: UpcomingData) => void;
};

export function CouncilUpcomingCard({ council, busy = false, onToggleRemind, onStart }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const hostTier = subscriberTierOf(council.owner);
  const press = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: toValue === 1 ? 6 : 0 }).start();

  const action = council.isOwner ? (
    <Pressable
      onPress={() => onStart(council)}
      disabled={busy}
      style={[styles.pill, styles.pillPrimary]}
      accessibilityRole="button"
      accessibilityLabel="ابدأ الآن"
      testID="council-upcoming-start"
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.onElectric} />
      ) : (
        <AppText variant="caption" style={[styles.pillText, { color: colors.onElectric }]}>
          ابدأ الآن
        </AppText>
      )}
    </Pressable>
  ) : (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onToggleRemind(council)}
        onPressIn={() => press(0.94)}
        onPressOut={() => press(1)}
        disabled={busy}
        style={[styles.pill, council.remindMe ? styles.pillOn : styles.pillOff]}
        accessibilityRole="button"
        accessibilityState={{ selected: council.remindMe }}
        accessibilityLabel={council.remindMe ? 'إلغاء التذكير' : 'ذكّرني'}
        testID="council-upcoming-remind"
      >
        <Row gap="xs" align="center">
          <AppIcon
            name="notifications-outline"
            size={14}
            color={council.remindMe ? colors.electric : colors.textSecondary}
          />
          <AppText
            variant="caption"
            color={council.remindMe ? 'primary' : 'textSecondary'}
            style={styles.pillText}
          >
            {council.remindMe ? 'سنذكّرك' : 'ذكّرني'}
          </AppText>
        </Row>
      </Pressable>
    </Animated.View>
  );

  return (
    <View style={styles.card} testID="council-upcoming-card">
      <Row gap="sm" align="center">
        <AppIcon name="calendar-outline" size={13} color={colors.textMuted} />
        <AppText variant="caption" color="textSecondary">
          {councilScheduleLabel(council.scheduledFor)}
        </AppText>
        {council.followersOnly ? (
          <AppText variant="caption" color="textMuted">
            · {COUNCIL_FOLLOWERS_ONLY_LABEL}
          </AppText>
        ) : null}
        <CouncilTierTag tier={hostTier} />
      </Row>
      <Row gap="md" align="center">
        <Stack gap="xs" style={styles.text}>
          <AppText variant="cardTitle" color="textPrimary" numberOfLines={2}>
            {council.name}
          </AppText>
          <Row gap="sm" align="center">
            <SarhAvatar
              uri={council.owner.avatar ? resolveMediaUrl(council.owner.avatar) : null}
              name={councilUserName(council.owner)}
              size="sm"
            />
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.text}>
              {councilUserName(council.owner)}
              {council.reminderCount > 0 ? ` · ${council.reminderCount.toLocaleString('en-US')} بانتظاره` : ''}
            </AppText>
          </Row>
        </Stack>
        {action}
      </Row>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      padding: spacing.lg,
      gap: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    text: { flex: 1, minWidth: 0 },
    pill: {
      minHeight: 32,
      minWidth: 84,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillOff: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
    pillOn: {
      borderWidth: 1,
      borderColor: colors.electric,
    },
    pillPrimary: { backgroundColor: colors.electric },
    pillText: { fontWeight: '600' },
  });
}
