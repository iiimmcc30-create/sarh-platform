import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';

const SECTIONS = [
  {
    title: 'الحساب',
    items: [
      { icon: 'person-outline', label: 'إدارة الملف الشخصي', route: '/profile/edit' },
      { icon: 'shield-check-outline', label: 'التحقق من الحساب والأمان', route: '/profile/settings' },
      { icon: 'lock-outline', label: 'تغيير كلمة المرور', route: '/profile/settings/password' },
      { icon: 'block', label: 'المحظورين', route: '/settings/blocked' },
    ],
  },
  {
    title: 'حول التطبيق',
    items: [
      { icon: 'information-outline', label: 'من نحن', route: '/info/about' },
      { icon: 'file-document-outline', label: 'الشروط والأحكام', route: '/info/terms' },
      { icon: 'lock-outline', label: 'سياسة الخصوصية', route: '/info/privacy' },
      { icon: 'receipt-outline', label: 'سياسة الاسترداد', route: '/info/refund' },
      { icon: 'file-document-outline', label: 'السياسات والشروط', route: '/info/policies' },
    ],
  },
  {
    title: 'الدعم والمساعدة',
    items: [
      { icon: 'ticket-outline', label: 'تذاكر الدعم', route: '/support/tickets' },
      {
        icon: 'check-decagram-outline',
        label: 'إنشاء طلب توثيق الحسابات',
        route: '/support/verification',
      },
      { icon: 'help-circle-outline', label: 'الأسئلة الشائعة', route: '/support/faq' },
      { icon: 'email-outline', label: 'تواصل معنا', route: '/info/contact' },
    ],
  },
];

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الإعدادات" showBack />
      {/* Rows are full-width tap targets, so the row pattern owns its own inset. */}
      <ScreenBody gutter={false} padBottom="xxxl">
        {SECTIONS.map((section) => (
          <SarhSettingsSection key={section.title} title={section.title}>
            {section.items.map((item, index) => (
              <SarhSettingsRow
                key={`${item.label}-${index}`}
                icon={item.icon}
                title={item.label}
                showDivider={index < section.items.length - 1}
                onPress={() => safePush(item.route, undefined, router)}
              />
            ))}
          </SarhSettingsSection>
        ))}
      </ScreenBody>
    </Screen>
  );
}
