import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { colors, space } from '../tokens';
import { AppText } from './AppText';

export type SarhSettingsSectionProps = {
  /** Small grey group title; omit for an untitled group. */
  title?: string;
  /** iOS Settings look: rows inside a rounded, hairline-bordered surface card. */
  grouped?: boolean;
  /** Small grey note under the group. */
  footer?: string;
  children: ReactNode;
};

export function SarhSettingsSection({ title, grouped = false, footer, children }: SarhSettingsSectionProps) {
  useTheme();
  if (grouped) {
    return (
      <View style={{ paddingTop: space[24], paddingHorizontal: space[16] }}>
        {title ? (
          <AppText
            variant="caption"
            color="textMuted"
            numberOfLines={1}
            style={{ paddingHorizontal: space[16], paddingBottom: space[8] }}
          >
            {title}
          </AppText>
        ) : null}
        <View
          style={{
            borderRadius: space[12] + space[4],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
        {footer ? (
          <AppText
            variant="caption"
            color="textMuted"
            style={{ paddingHorizontal: space[16], paddingTop: space[8] }}
          >
            {footer}
          </AppText>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ paddingTop: space[24] }}>
      <AppText
        variant="caption"
        color="textMuted"
        numberOfLines={1}
        style={{
          paddingHorizontal: space[16],
          paddingBottom: space[8],
        }}
      >
        {title}
      </AppText>
      <View>{children}</View>
    </View>
  );
}

export default SarhSettingsSection;
