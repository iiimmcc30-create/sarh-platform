import { SettingsHomeScreen } from '@/components/settings/SettingsHomeScreen';

/**
 * Sidebar «الإعدادات والخصوصية» entry. Same unified settings home as /settings,
 * shown inside this stack so its sub-pages (account, phone, password) push on top.
 */
export default function ProfileSettingsScreen() {
  return <SettingsHomeScreen />;
}
