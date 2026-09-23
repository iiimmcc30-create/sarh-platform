import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppLogo } from '@/components/ui/AppLogo';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  BRAND_FOOTER_AR,
  BRAND_GOAL_AR,
  BRAND_MISSION_AR,
  BRAND_NAME_AR,
  BRAND_TAGLINE_AR,
  BRAND_VISION_AR,
  FOUNDER_NAME,
} from '@/constants/brandCopy';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { motion } from '@/design-system';
import { AppText, SarhCard, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

const PURPOSE = [
  { title: 'رسالتنا', content: BRAND_MISSION_AR },
  { title: 'رؤيتنا', content: BRAND_VISION_AR },
  { title: 'هدفنا', content: BRAND_GOAL_AR },
];

const FEATURES = [
  { icon: 'tag-multiple', label: 'إعلانات واضحة وموثوقة لبيع وشراء الحيوانات والمعدات' },
  { icon: 'broadcast', label: 'بث مباشر للمزادات والعروض الحية' },
  { icon: 'message-text-outline', label: 'تواصل مباشر وسريع بين البائعين والمشترين' },
  { icon: 'shield-check-outline', label: 'بيئة آمنة وموثوقة مع نظام تحقق للحسابات' },
  { icon: 'map-marker-outline', label: 'تغطية شاملة لدول الخليج العربي' },
];

const OWNERSHIP = [
  { label: 'مؤسس المشروع', value: FOUNDER_NAME },
  { label: 'المالك الرسمي', value: 'مؤسسة ماد يونيت للتجارة' },
  { label: 'السجل التجاري', value: 'مسجّلة في المركز السعودي للأعمال' },
  { label: 'الموقع', value: 'المملكة العربية السعودية' },
];

const CONTACT = [
  { icon: 'call-outline', href: 'tel:+966591298136', text: '+966 591 298 136' },
  { icon: 'mail-outline', href: 'mailto:sarh@sarhsa.online', text: 'sarh@sarhsa.online' },
  { icon: 'globe-outline', href: 'https://sarhsa.online', text: 'sarhsa.online' },
];

export default function AboutScreen() {
  const { styles, colors } = useThemedStyles(({ colors }) => ({
    styles: createStyles(colors),
    colors,
  }));

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="من نحن" showBack />
      <ScreenBody gap="section" padBottom="xxxl">
        <Stack gap="sm" align="center" style={styles.hero}>
          <AppLogo size={72} showRing={false} />
          <AppText variant="sectionTitle" color="textPrimary" align="center">
            {BRAND_NAME_AR}
          </AppText>
          <AppText variant="body" color="textSecondary" align="center">
            {BRAND_TAGLINE_AR}
          </AppText>
        </Stack>

        <SarhDivider />

        {PURPOSE.map((item) => (
          <Stack key={item.title} gap="sm">
            <AppText variant="cardTitle" color="textPrimary">{item.title}</AppText>
            <AppText variant="body" color="textSecondary" style={styles.bodyText}>
              {item.content}
            </AppText>
          </Stack>
        ))}

        <SarhDivider />

        <Section title="ما نقدّمه" gap="xs">
          {FEATURES.map((item) => (
            <Row key={item.label} gap="md" style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <AppIcon name={item.icon} size={18} color={colors.textSecondary} />
              </View>
              <AppText variant="body" color="textSecondary" style={styles.fill}>
                {item.label}
              </AppText>
            </Row>
          ))}
        </Section>

        <Section title="المالك والامتثال">
          <SarhCard level="card" padding="none">
            {OWNERSHIP.map((row, idx) => (
              <View key={row.label}>
                <Row gap="md" justify="between" style={styles.infoRow}>
                  <AppText variant="caption" color="textMuted">{row.label}</AppText>
                  <AppText
                    variant="bodyMedium"
                    color="textPrimary"
                    numberOfLines={2}
                    style={styles.shrink}
                  >
                    {row.value}
                  </AppText>
                </Row>
                {idx < OWNERSHIP.length - 1 ? <SarhDivider inset /> : null}
              </View>
            ))}
          </SarhCard>
        </Section>

        <Section title="تواصل معنا" gap="xs">
          {CONTACT.map((item) => (
            <Pressable
              key={item.href}
              accessibilityRole="link"
              accessibilityLabel={item.text}
              onPress={() => Linking.openURL(item.href)}
              style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
            >
              <Row gap="md" style={styles.contactRow}>
                <AppIcon name={item.icon} size={18} color={colors.textSecondary} />
                <AppText variant="body" color="primary" style={styles.fill}>
                  {item.text}
                </AppText>
              </Row>
            </Pressable>
          ))}
        </Section>

        <AppText variant="meta" color="textMuted" align="center" style={styles.footer}>
          {BRAND_FOOTER_AR}{'\n'}Uicons by Flaticon
        </AppText>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, minWidth: 0 },
    shrink: { flexShrink: 1 },
    hero: { paddingVertical: spacing.xxl },
    bodyText: { lineHeight: 26 },
    featureRow: { paddingVertical: spacing.sm },
    featureIcon: {
      width: 34,
      height: 34,
      borderRadius: radius.md,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      flexShrink: 0,
    },
    infoRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    contactRow: { paddingVertical: spacing.sm },
    footer: { lineHeight: 20 },
  });
}
