import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { type SidebarNavItem } from '@/components/feature/SidebarMenu';
import { AppText, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { motion, space } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

type ProfileSettingsMenuScreenProps = {
  title?: string;
  sections: Array<{
    title: string;
    items: SidebarNavItem[];
  }>;
  onLogout: () => void;
};

/** Layout only — `colors` is mutated by `applyThemeScheme` and read at render. */
const styles = StyleSheet.create({
  logout: {
    marginTop: space[32],
    minHeight: space[48],
    paddingHorizontal: space[16],
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
});

export function ProfileSettingsMenuScreen({
  title = 'الإعدادات',
  sections,
  onLogout,
}: ProfileSettingsMenuScreenProps) {
  const router = useRouter();
  // Subscribe so the logout label re-resolves its color after a scheme switch.
  useTheme();

  const handleItemPress = (item: SidebarNavItem) => {
    if (item.onPress) {
      item.onPress();
      return;
    }
    if (item.route) {
      safePush(item.route, undefined, router);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={title} showBack />
      {/* Rows are full-width tap targets, so the row pattern owns its own inset. */}
      <ScreenBody gutter={false} padBottom="xxxl">
        {sections.map((section) => (
          <SarhSettingsSection key={section.title} title={section.title}>
            {section.items.map((item, index) => (
              <SarhSettingsRow
                key={item.key}
                icon={item.icon}
                title={item.title ?? item.label ?? ''}
                value={item.subtitle}
                showDivider={index < section.items.length - 1}
                onPress={() => handleItemPress(item)}
              />
            ))}
          </SarhSettingsSection>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="تسجيل الخروج"
          onPress={onLogout}
          style={({ pressed }) => [
            styles.logout,
            { opacity: pressed ? motion.opacity.pressed : 1 },
          ]}
        >
          <AppText variant="label" color="danger" align="center">
            تسجيل الخروج
          </AppText>
        </Pressable>
      </ScreenBody>
    </Screen>
  );
}
