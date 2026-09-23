import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { spacing } from '@/constants/theme';
import { AppText, SarhDivider } from '@/design-system/components';
import { Screen, ScreenBody, Stack } from '@/design-system/layout';
import { StyleSheet } from 'react-native';

const REFUND_SECTIONS = [
  {
    title: 'نطاق سياسة الاسترداد',
    content: `تنطبق هذه السياسة على جميع الاشتراكات والمدفوعات التي تتم عبر منصة سرح. نحن نسعى دائماً لضمان رضا مستخدمينا، وندرك أن قد تنشأ حالات تستدعي إعادة النظر في المدفوعات.`,
  },
  {
    title: 'حالات الاسترداد المقبولة',
    content: `• في حال وجود خطأ تقني أدى إلى خصم مزدوج.\n• في حال عدم تفعيل الخدمة المدفوعة خلال 24 ساعة من الدفع.\n• في حال الإلغاء خلال 48 ساعة من الاشتراك الأول وعدم استخدام أي مزايا مدفوعة.\n• في حال إيقاف الخدمة من قِبل المنصة خلال مدة الاشتراك الفعلية.`,
  },
  {
    title: 'حالات عدم القبول',
    content: `• طلبات الاسترداد بعد مرور أكثر من 7 أيام من تاريخ الدفع.\n• الاشتراكات التي استُخدمت مزاياها بالكامل أو جزئياً.\n• في حال إغلاق الحساب طوعياً من قِبل المستخدم.\n• الإعلانات والمنشورات المنشورة ضمن الباقة المدفوعة.`,
  },
  {
    title: 'إجراءات طلب الاسترداد',
    content: `١. تواصل مع فريق الدعم عبر صفحة "تواصل معنا".\n٢. أرسل رقم الطلب أو معرّف الدفع مع وصف المشكلة.\n٣. سيتم مراجعة طلبك خلال 3-5 أيام عمل.\n٤. في حال القبول، يُعاد المبلغ خلال 7-14 يوم عمل إلى وسيلة الدفع الأصلية.`,
  },
  {
    title: 'الجزئي مقابل الكامل',
    content: `قد يُقدَّم استرداد جزئي في حال استخدام جزء من الخدمة. يُحتسب ذلك بناءً على الأيام المتبقية من الاشتراك وفق الصيغة التالية: (المبلغ المدفوع ÷ عدد أيام الاشتراك) × عدد الأيام غير المستخدمة.`,
  },
  {
    title: 'العملات والرسوم',
    content: `جميع المبالغ المستردة بالعملة الأصلية للدفع. لا تتحمل المنصة أي رسوم تحويل أو رسوم بنكية تنشأ عن عملية الاسترداد، وهي تقع على عاتق المستخدم.`,
  },
  {
    title: 'التواصل',
    content: `للاستفسار أو تقديم طلب استرداد:\n📧 sarh@sarhsa.online\nأو عبر صفحة تواصل معنا داخل التطبيق.`,
  },
];

export default function RefundScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="سياسة الاسترداد" showBack />
      <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
        <AppText variant="caption" color="textMuted">
          آخر تحديث: يوليو ٢٠٢٥ · هذه السياسة جزء من شروط وأحكام منصة سرح وتنظّم حالات استرداد
          المبالغ المدفوعة.
        </AppText>

        <SarhDivider />

        {REFUND_SECTIONS.map((section, i) => (
          <Stack key={section.title} gap="sm">
            <AppText variant="cardTitle" color="textPrimary">{section.title}</AppText>
            <AppText variant="body" color="textSecondary" style={styles.prose}>
              {section.content}
            </AppText>
            {i < REFUND_SECTIONS.length - 1 ? (
              <SarhDivider style={styles.clauseRule} />
            ) : null}
          </Stack>
        ))}

        <AppText variant="meta" color="textMuted" align="center">
          سرح · جميع الحقوق محفوظة
        </AppText>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  prose: { lineHeight: 24 },
  clauseRule: { marginTop: spacing.md },
});
