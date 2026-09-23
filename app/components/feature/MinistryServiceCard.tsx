import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { motion } from '@/design-system';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  OFFICIAL_SERVICE_CATEGORY_META,
  type OfficialService,
} from '@/services/officialServices';
import { Pressable, StyleSheet } from 'react-native';

type Props = {
  service: OfficialService;
  onPress: () => void;
};

export function MinistryServiceCard({ service, onPress }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const meta = OFFICIAL_SERVICE_CATEGORY_META[service.category] ?? {
    label: service.category,
    emoji: '📋',
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={service.title}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <AppText variant="heading3" numberOfLines={2}>
        {service.title}
      </AppText>
      {service.description ? (
        <AppText variant="bodySmall" color="textMuted" numberOfLines={3}>
          {service.description}
        </AppText>
      ) : null}
      <Row align="center" gap="xs" style={styles.badge}>
        <AppText variant="caption">{meta.emoji}</AppText>
        <AppText variant="caption" color="primary">
          {meta.label}
        </AppText>
      </Row>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.borderHairline,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: `${colors.electric}24`,
      borderRadius: radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 4,
    },
    pressed: {
      opacity: motion.press.opacityCard,
    },
  });
}
