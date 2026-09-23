import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { motion } from '@/design-system';
import { AppText, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

const TERMS = [
  {
    title: 'القبول بالشروط',
    content: `باستخدامك منصة سرح فإنك توافق على الالتزام بهذه الشروط والأحكام. إن كنت لا توافق على أي بند منها، يُرجى عدم استخدام المنصة.`,
  },
  {
    title: 'شروط التسجيل',
    content: `• يجب أن يكون عمرك 18 سنة أو أكثر.\n• يُلزم تقديم معلومات صحيحة ودقيقة عند التسجيل.\n• أنت مسؤول عن سرية كلمة المرور وحماية حسابك.\n• لكل مستخدم حساب واحد فقط.`,
  },
  {
    title: 'قواعد النشر',
    content: `• يُسمح فقط بنشر إعلانات الحيوانات والمعدات الزراعية المتوافقة مع أنظمة المملكة.\n• يُحظر نشر إعلانات مضللة أو صور غير حقيقية.\n• يُحظر نشر أي محتوى مسيء أو مخالف للأنظمة السعودية.\n• تحتفظ المنصة بحق حذف أي إعلان مخالف دون إشعار مسبق.`,
  },
  {
    title: 'المعاملات التجارية',
    content: `المنصة وسيلة للتواصل بين البائعين والمشترين فقط. لا تكون سرح طرفاً في أي صفقة بين المستخدمين. أي نزاع تجاري هو مسؤولية الأطراف المتعاقدة مباشرة.`,
  },
  {
    title: 'الاشتراكات',
    content: `• بعض الميزات تتطلب اشتراكاً مدفوعاً موضحاً في صفحة باقات الاشتراك.\n• تُجدَّد الاشتراكات تلقائياً ما لم تُلغَ قبل تاريخ التجديد.`,
  },
  {
    title: 'الملكية الفكرية',
    content: `جميع حقوق الملكية الفكرية للمنصة محفوظة لمؤسسة ماد يونيت للتجارة. لا يُسمح بنسخ أو توزيع أو استخدام أي محتوى من المنصة تجارياً دون إذن خطي مسبق.`,
  },
  {
    title: 'إخلاء المسؤولية',
    content: `تُقدَّم المنصة "كما هي" دون ضمانات صريحة أو ضمنية. لا تتحمل سرح أو مؤسسة ماد يونيت للتجارة مسؤولية أي خسائر تنتج عن استخدام المنصة أو المعاملات المُبرمة عبرها.`,
  },
  {
    title: 'القانون الواجب التطبيق',
    content: `تخضع هذه الشروط لأنظمة وقوانين المملكة العربية السعودية، وتختص المحاكم السعودية بالفصل في أي نزاع ينشأ عن تطبيقها.`,
  },
];

const CONTACT = [
  { icon: 'mail-outline', href: 'mailto:sarh@sarhsa.online', text: 'sarh@sarhsa.online' },
  { icon: 'call-outline', href: 'tel:+966591298136', text: '+966 591 298 136' },
];

export default function TermsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="الشروط والأحكام" showBack />
      <ScreenBody gap="section" padBottom="xxxl">
        <Stack gap="sm" align="center" style={styles.banner}>
          <AppIcon name="document-text" size={26} color={colors.textSecondary} />
          <AppText variant="cardTitle" color="textPrimary">شروط الاستخدام</AppText>
          <AppText variant="caption" color="textMuted">آخر تحديث: يناير 2024</AppText>
        </Stack>

        <SarhDivider />

        {TERMS.map((item, i) => (
          <Stack key={item.title} gap="sm">
            <Row gap="sm">
              <View style={styles.numBadge}>
                <AppText variant="meta" color="textSecondary" align="center">{i + 1}</AppText>
              </View>
              <AppText variant="cardTitle" color="textPrimary" style={styles.fill}>
                {item.title}
              </AppText>
            </Row>
            <AppText variant="body" color="textSecondary" style={styles.prose}>
              {item.content}
            </AppText>
            {i < TERMS.length - 1 ? <SarhDivider style={styles.clauseRule} /> : null}
          </Stack>
        ))}

        <SarhDivider />

        <Section title="للاستفسار" gap="xs">
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, minWidth: 0 },
    banner: { paddingVertical: spacing.xxl },
    numBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      flexShrink: 0,
    },
    prose: { lineHeight: 26 },
    clauseRule: { marginTop: spacing.md },
    contactRow: { paddingVertical: spacing.sm },
  });
}
