import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { space } from '../tokens';
import { AppText } from './AppText';

export type SarhSettingsSectionProps = {
  /** Bold sub-header above the rows (X settings); omit for an untitled block. */
  title?: string;
  /** @deprecated X settings have no grouped boxes — kept for call-site compatibility, ignored. */
  grouped?: boolean;
  /** Grey explanatory note under the rows. */
  footer?: string;
  children: ReactNode;
};

/**
 * X settings section: an optional bold text sub-header, plain rows on the
 * page background (no card, no border, no separators) and a grey note.
 */
export function SarhSettingsSection({ title, footer, children }: SarhSettingsSectionProps) {
  useTheme();
  return (
    <View style={{ paddingTop: title ? space[16] : space[8] }}>
      {title ? (
        <AppText
          variant="heading3"
          color="textPrimary"
          numberOfLines={2}
          accessibilityRole="header"
          style={{ paddingHorizontal: space[16], paddingBottom: space[4] }}
        >
          {title}
        </AppText>
      ) : null}
      <View>{children}</View>
      {footer ? (
        <AppText
          variant="bodySmall"
          color="textMuted"
          style={{ paddingHorizontal: space[16], paddingTop: space[4], paddingBottom: space[8] }}
        >
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

export default SarhSettingsSection;
