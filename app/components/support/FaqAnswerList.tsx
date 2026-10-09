import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { spacing } from '@/constants/theme';
import { motion } from '@/design-system';
import { AppText, SarhButton, SarhDivider } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { isSafeHelpRoute } from '@/lib/helpCenter';
import { safePush } from '@/lib/safeNavigate';
import { FAQ_CATEGORY_LABEL_AR, type FaqCategory, type FaqItem } from '@/services/support';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type FaqAnswerListProps = {
  faqs: FaqItem[];
  /** Show the category caption above each question. */
  showCategory?: boolean;
};

/**
 * Expandable question → short answer rows, with an optional in-app deep-link
 * button (FAQ actionRoute / actionLabel). Shared by the help hub and the FAQ screen.
 */
export function FaqAnswerList({ faqs, showCategory = true }: FaqAnswerListProps) {
  const { colors } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(motion.duration.screen, 'easeInEaseOut', 'opacity'),
    );
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <Stack gap="none">
      {faqs.map((faq, i) => {
        const open = expandedId === faq.id;
        const action = isSafeHelpRoute(faq.actionRoute) ? faq.actionRoute : null;
        return (
          <View key={faq.id}>
            <Pressable
              onPress={() => toggle(faq.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={faq.questionAr}
              style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
            >
              <Stack gap="sm" style={styles.faqRow}>
                <Row gap="md" align="start">
                  <Stack gap="xs" style={styles.fill}>
                    {showCategory ? (
                      <AppText variant="meta" color="textMuted">
                        {FAQ_CATEGORY_LABEL_AR[faq.category as FaqCategory] ?? faq.category}
                      </AppText>
                    ) : null}
                    <AppText variant="cardTitle" color="textPrimary">
                      {faq.questionAr}
                    </AppText>
                  </Stack>
                  <AppIcon
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textMuted}
                  />
                </Row>
                {open ? (
                  <AppText variant="body" color="textSecondary">
                    {faq.answerAr}
                  </AppText>
                ) : null}
              </Stack>
            </Pressable>
            {open && action ? (
              <View style={styles.actionWrap}>
                <SarhButton
                  title={faq.actionLabel?.trim() || 'افتح'}
                  variant="secondary"
                  size="sm"
                  onPress={() => safePush(action)}
                />
              </View>
            ) : null}
            {i < faqs.length - 1 ? <SarhDivider /> : null}
          </View>
        );
      })}
    </Stack>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  faqRow: { paddingVertical: spacing.lg },
  actionWrap: { alignItems: 'flex-start', paddingBottom: spacing.lg },
});

export default FaqAnswerList;
