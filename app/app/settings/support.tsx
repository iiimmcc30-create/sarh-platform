import { SettingsMenuScreen } from '@/components/ui/SettingsMenuScreen';

export default function SupportScreen() {
  return (
    <SettingsMenuScreen
      title="الدعم والمساعدة"
      items={[
        {
          icon: 'ticket-outline',
          label: 'تذاكر الدعم',
          route: '/support/tickets',
        },
        {
          icon: 'shield-check-outline',
          label: 'إنشاء طلب توثيق الحسابات',
          route: '/support/verification',
        },
        {
          icon: 'help-circle-outline',
          label: 'الأسئلة الشائعة',
          route: '/support/faq',
        },
        {
          icon: 'phone',
          label: 'تواصل معنا',
          route: '/info/contact',
        },
      ]}
    />
  );
}
