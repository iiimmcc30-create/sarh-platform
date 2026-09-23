import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { space } from '../tokens';
import { AppText } from './AppText';

export type SarhSettingsSectionProps = {
  title: string;
  children: ReactNode;
};

export function SarhSettingsSection({ title, children }: SarhSettingsSectionProps) {
  useTheme();
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
