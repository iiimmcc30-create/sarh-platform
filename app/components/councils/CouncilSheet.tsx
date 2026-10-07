import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SheetModal } from '@/components/ui/SheetModal';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlDirection } from '@/lib/rtl';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Hide the close affordance (e.g. rules must be accepted or declined explicitly). */
  dismissible?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

/** Calm bottom sheet shared by the council sheets (rules, requests, invite, banned). */
export function CouncilSheet({
  visible,
  title,
  subtitle,
  onClose,
  dismissible = true,
  children,
  footer,
}: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <SheetModal visible={visible} onClose={onClose} dismissible={dismissible} containerStyle={styles.container}>
      <View style={[styles.sheet, getRtlDirection(), { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.grabber} />
        <Row gap="md" align="center">
          <View style={{ flex: 1 }}>
            <AppText variant="heading3" color="textPrimary">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="caption" color="textMuted">
                {subtitle}
              </AppText>
            ) : null}
          </View>
          {dismissible ? (
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="إغلاق">
              <AppIcon name="close" size={22} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </Row>
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { maxHeight: '85%' },
    sheet: {
      flexShrink: 1,
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: radius.xxl,
      borderTopRightRadius: radius.xxl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.xs,
    },
    body: { flexGrow: 0 },
    bodyContent: { gap: spacing.sm, paddingBottom: spacing.xs },
    footer: { gap: spacing.sm },
  });
}
