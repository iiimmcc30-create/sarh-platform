import { SettingsMenuScreen } from '@/components/ui/SettingsMenuScreen';

export default function InfoCenterScreen() {
  return (
    <SettingsMenuScreen
      title="مركز المعلومات"
      sections={[
        {
          title: 'المساعدة',
          items: [
            { icon: 'lifebuoy', label: 'مركز المساعدة', route: '/support' },
            { icon: 'help-circle-outline', label: 'الأسئلة الشائعة', route: '/support/faq' },
            { icon: 'email-outline', label: 'تواصل معنا', route: '/info/contact' },
          ],
        },
        {
          title: 'حول التطبيق',
          items: [
            { icon: 'information-outline', label: 'عن سرح', route: '/info/about' },
            { icon: 'file-document-outline', label: 'الشروط والأحكام', route: '/info/terms' },
            { icon: 'lock-outline', label: 'سياسة الخصوصية', route: '/info/privacy' },
            { icon: 'receipt-outline', label: 'سياسة الاسترداد', route: '/info/refund' },
            { icon: 'file-document-outline', label: 'السياسات والشروط', route: '/info/policies' },
          ],
        },
      ]}
      footerValue={{ label: 'الإصدار الحالي', value: '1.0.0' }}
    />
  );
}
