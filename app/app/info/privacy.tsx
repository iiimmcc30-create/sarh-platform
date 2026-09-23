import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { motion } from '@/design-system';
import { AppText, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { Linking, Pressable, StyleSheet } from 'react-native';

const SECTIONS = [
  {
    title: 'مقدمة',
    content: `تلتزم منصة سرح (sarhsa.online)، المملوكة لمؤسسة ماد يونيت للتجارة، بحماية خصوصية مستخدميها. توضّح هذه السياسة كيفية جمع بياناتك الشخصية واستخدامها وحفظها والحفاظ عليها وفق أحكام نظام حماية البيانات الشخصية في المملكة العربية السعودية.`,
  },
  {
    title: 'البيانات التي نجمعها',
    content: `• الاسم ورقم الجوال وعنوان البريد الإلكتروني عند التسجيل.\n• بيانات الحيوانات والإعلانات التي تنشرها.\n• الصور ومقاطع الفيديو التي ترفعها.\n• بيانات الموقع الجغرافي عند استخدام ميزات الخريطة (بإذنك).\n• سجلات الاستخدام والأجهزة لتحسين الخدمة.`,
  },
  {
    title: 'كيف نستخدم بياناتك',
    content: `• تشغيل المنصة وتقديم خدماتها الأساسية.\n• إرسال إشعارات متعلقة بإعلاناتك وعروضك.\n• تحسين تجربة المستخدم وتطوير الميزات.\n• الامتثال للمتطلبات القانونية والتنظيمية في المملكة.\n• منع الاحتيال وحماية أمن المنصة.`,
  },
  {
    title: 'مشاركة البيانات',
    content: `لا نبيع بياناتك الشخصية لأطراف ثالثة. قد نشارك بياناتك مع:\n• مزودي الخدمة التقنية الضروريين لتشغيل المنصة.\n• الجهات الحكومية والقضائية عند الطلب القانوني.\n\nجميع الشركاء ملزمون بسياسات صارمة لحماية البيانات.`,
  },
  {
    title: 'حقوقك',
    content: `يحق لك في أي وقت:\n• الاطلاع على بياناتك الشخصية المحفوظة لدينا.\n• تصحيح أي بيانات غير دقيقة.\n• طلب حذف بياناتك.\n• الاعتراض على معالجة بياناتك لأغراض التسويق.\n\nللتواصل بشأن هذه الحقوق: sarh@sarhsa.online`,
  },
  {
    title: 'حفظ البيانات وأمانها',
    content: `نحفظ بياناتك على خوادم آمنة داخل المملكة العربية السعودية وفق أعلى معايير التشفير. نحتفظ ببياناتك طوال فترة نشاط حسابك، وبعد حذفه لمدة لا تتجاوز ما يقتضيه القانون.`,
  },
  {
    title: 'التعديلات على السياسة',
    content: `يحق لنا تعديل هذه السياسة في أي وقت. سيُبلَّغ المستخدمون بأي تغييرات جوهرية عبر إشعار داخل التطبيق. استمرارك في استخدام المنصة بعد التعديل يُعدّ موافقةً على السياسة المُعدَّلة.`,
  },
];

const CONTACT = [
  { icon: 'mail-outline', href: 'mailto:sarh@sarhsa.online', text: 'sarh@sarhsa.online' },
  { icon: 'call-outline', href: 'tel:+966591298136', text: '+966 591 298 136' },
];

export default function PrivacyScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="سياسة الخصوصية" showBack />
      <ScreenBody gap="section" padBottom="xxxl">
        <Stack gap="sm" align="center" style={styles.banner}>
          <AppIcon name="shield-checkmark" size={26} color={colors.electricBright} />
          <AppText variant="cardTitle" color="textPrimary">خصوصيتك تهمّنا</AppText>
          <AppText variant="caption" color="textMuted">آخر تحديث: يناير 2024</AppText>
        </Stack>

        <SarhDivider />

        {SECTIONS.map((sec, i) => (
          <Stack key={sec.title} gap="sm">
            <AppText variant="cardTitle" color="textPrimary">{sec.title}</AppText>
            <AppText variant="body" color="textSecondary" style={styles.prose}>
              {sec.content}
            </AppText>
            {i < SECTIONS.length - 1 ? <SarhDivider style={styles.clauseRule} /> : null}
          </Stack>
        ))}

        <SarhDivider />

        <Section title="تواصل معنا" gap="xs">
          <AppText variant="body" color="textSecondary">
            لأي استفسار حول سياسة الخصوصية:
          </AppText>
          {CONTACT.map((item) => (
            <Pressable
              key={item.href}
              accessibilityRole="link"
              accessibilityLabel={item.text}
              onPress={() => Linking.openURL(item.href)}
              style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
            >
              <Row gap="sm" style={styles.contactRow}>
                <AppIcon name={item.icon} size={16} color={colors.electricBright} />
                <AppText variant="body" color="primary">{item.text}</AppText>
              </Row>
            </Pressable>
          ))}
        </Section>

        <AppText variant="meta" color="textMuted" align="center">
          © 2024 مؤسسة ماد يونيت للتجارة · سرح · جميع الحقوق محفوظة
        </AppText>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    banner: { paddingVertical: spacing.xxl },
    prose: { lineHeight: 26 },
    clauseRule: { marginTop: spacing.md },
    contactRow: { paddingVertical: spacing.sm },
  });
}
