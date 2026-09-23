import { SettingsMenuScreen, type SettingsMenuItem } from '@/components/ui/SettingsMenuScreen';

const ITEMS: SettingsMenuItem[] = [
  {
    icon: 'shield-check-outline',
    label: 'التحقق من الحساب والأمان',
    route: '/profile/edit',
  },
  {
    icon: 'lock-outline',
    label: 'تغيير كلمة المرور والبريد',
    route: '/auth/forgot-password',
  },
  {
    icon: 'block',
    label: 'المحظورين',
    route: '/settings/blocked',
  },
];

export default function AccountSettingsScreen() {
  return (
    <SettingsMenuScreen
      title="الحساب"
      items={ITEMS}
    />
  );
}
