import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import {
  AppText,
  SarhAvatar,
  SarhButton,
  SarhChip,
  SarhChipRow,
  SarhDivider,
  SarhInput,
  SarhSurface,
} from '@/design-system/components';
import { FaqAnswerList } from '@/components/support/FaqAnswerList';
import { HELP_SEARCH_DEBOUNCE_MS, isHelpSearchReady } from '@/lib/helpCenter';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { getRtlRow } from '@/lib/rtl';
import { createTicket, fetchFaqs, type FaqItem } from '@/services/support';
import {
  DEFAULT_SUPPORT_FLOW_CHOICE_ID,
  SUPPORT_FLOW_CHOICES,
  findSupportFlowChoice,
  greetingFirstName,
  isSupportDescriptionValid,
  supportDescriptionError,
  type SupportFlowChoice,
} from '@/lib/supportFlow';
import { SUPPORT_CUSTOMER_SERVICE } from '@/constants/supportIdentity';
import { SheetModal } from '@/components/ui/SheetModal';

type FlowStep = 'ask' | 'sending' | 'handoff';

type SupportFlowSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialChoiceId?: string;
};

/**
 * «اسأل مساعد سرح» — the user types a question in their own words; matching
 * FAQ answers appear inline while typing. Sending opens a real support ticket
 * where مساعد سرح answers from the FAQ and hands off to a human when needed.
 */
export function SupportFlowSheet({
  visible,
  onClose,
  initialChoiceId,
}: SupportFlowSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { me } = useAppUser();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  const presetChoice = () =>
    findSupportFlowChoice(initialChoiceId) ?? findSupportFlowChoice(DEFAULT_SUPPORT_FLOW_CHOICE_ID);

  const [step, setStep] = useState<FlowStep>('ask');
  const [choice, setChoice] = useState<SupportFlowChoice | undefined>(presetChoice);
  const [description, setDescription] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<FaqItem[]>([]);
  const suggestSeq = useRef(0);

  const firstName = greetingFirstName(me.arabicName, me.displayName);
  const hello = firstName ? `هلا ${firstName}` : 'هلا';

  const reset = useCallback(() => {
    setStep('ask');
    setChoice(findSupportFlowChoice(initialChoiceId) ?? findSupportFlowChoice(DEFAULT_SUPPORT_FLOW_CHOICE_ID));
    setDescription('');
    setSubmitError(null);
    setSuggestions([]);
  }, [initialChoiceId]);

  useEffect(() => {
    if (!visible) return;
    reset();
  }, [visible, reset]);

  // Instant answers from the FAQ while the user types (debounced).
  useEffect(() => {
    const q = description.trim();
    if (!isHelpSearchReady(q) || q.length < 4) {
      suggestSeq.current += 1;
      setSuggestions([]);
      return;
    }
    const seq = ++suggestSeq.current;
    const timer = setTimeout(() => {
      void fetchFaqs({ search: q }).then((data) => {
        if (seq !== suggestSeq.current) return;
        setSuggestions((data?.faqs ?? []).slice(0, 2));
      });
    }, HELP_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [description]);

  const submit = async () => {
    const err = supportDescriptionError(description);
    if (err) {
      setSubmitError(err);
      return;
    }
    const picked = choice ?? findSupportFlowChoice(DEFAULT_SUPPORT_FLOW_CHOICE_ID);
    if (!picked) return;
    setSubmitError(null);
    setStep('sending');
    const res = await createTicket({
      helpKind: picked.helpKind,
      category: picked.category,
      description: description.trim(),
    });
    if (!res.ok || !res.ticket?.id) {
      setStep('ask');
      setSubmitError(res.error ?? 'تعذر الإرسال. حاول مرة ثانية.');
      return;
    }
    setStep('handoff');
    const ticketId = res.ticket.id;
    requestAnimationFrame(() => {
      router.replace({
        pathname: '/support/tickets/[id]',
        params: { id: ticketId, fresh: '1' },
      } as never);
    });
  };

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      keyboardAvoiding
      containerStyle={styles.sheetWrap}
    >
      <SarhSurface
        tone="background"
        style={[
          styles.sheet,
          {
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={[styles.header, getRtlRow()]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            style={styles.closeBtn}
          >
            <AppIcon name="close" size={22} color={colors.textPrimary} />
          </Pressable>
          <AppText variant="heading3" style={styles.headerTitle}>
            اسأل مساعد سرح
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {step === 'ask' || step === 'sending' ? (
            <>
              <View style={[styles.intro, getRtlRow()]}>
                <SarhAvatar
                  source={SUPPORT_CUSTOMER_SERVICE.avatarSource}
                  name={SUPPORT_CUSTOMER_SERVICE.assistantName}
                  size="lg"
                  accessibilityLabel={SUPPORT_CUSTOMER_SERVICE.assistantName}
                />
                <View style={styles.introCopy}>
                  <AppText variant="body" color="textSecondary">
                    {hello}، معك {SUPPORT_CUSTOMER_SERVICE.assistantName}
                  </AppText>
                  <AppText variant="heading2">وش سؤالك؟</AppText>
                </View>
              </View>
              <AppText variant="caption" color="textMuted">
                اكتب سؤالك بكلامك، وإذا احتجت موظف أحوّلك له.
              </AppText>
              <SarhChipRow contentPaddingHorizontal={0}>
                {SUPPORT_FLOW_CHOICES.map((item) => (
                  <SarhChip
                    appearance="filter"
                    key={item.id}
                    label={item.label}
                    selected={choice?.id === item.id}
                    onPress={() => setChoice(item)}
                  />
                ))}
              </SarhChipRow>
              <SarhInput
                label="سؤالك"
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (submitError) setSubmitError(null);
                }}
                placeholder="مثلاً: كيف أعزز إعلاني؟"
                multiline
                numberOfLines={4}
                style={styles.textArea}
                errorText={submitError ?? undefined}
              />
              {suggestions.length > 0 ? (
                <View style={styles.suggestions}>
                  <AppText variant="caption" color="textMuted">
                    يمكن هذا جوابك
                  </AppText>
                  <FaqAnswerList faqs={suggestions} showCategory={false} />
                </View>
              ) : null}
              <SarhButton
                title={`أرسل لـ${SUPPORT_CUSTOMER_SERVICE.assistantName}`}
                fullWidth
                loading={step === 'sending'}
                disabled={step === 'sending' || !isSupportDescriptionValid(description)}
                onPress={() => void submit()}
              />
              <SarhDivider style={styles.footerRule} />
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/support/tickets' as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="تذاكري"
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <AppText variant="label" color="primary" align="center">
                  تذاكري
                </AppText>
              </Pressable>
            </>
          ) : null}

          {step === 'handoff' ? (
            <View style={styles.handoff}>
              <ActivityIndicator color={colors.electric} />
              <AppText variant="heading3" align="center">
                وصلني سؤالك
              </AppText>
              <AppText variant="body" color="textSecondary" align="center">
                لحظة، أفتح لك المحادثة.
              </AppText>
            </View>
          ) : null}
        </ScrollView>
      </SarhSurface>
    </SheetModal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    sheetWrap: { maxHeight: '92%' },
    sheet: {
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      minHeight: '78%',
      overflow: 'hidden',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderMid,
      marginBottom: spacing.sm,
    },
    header: {
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      minHeight: 48,
    },
    headerTitle: { flex: 1, textAlign: 'center' },
    headerSpacer: { width: 36 },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
      gap: spacing.sm,
    },
    intro: {
      alignItems: 'flex-start',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    introCopy: { flex: 1, gap: 4 },
    suggestions: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    pressed: { opacity: motion.press.opacity },
    textArea: { minHeight: 110, textAlignVertical: 'top' },
    footerRule: { marginVertical: spacing.md },
    handoff: {
      paddingVertical: spacing.xxl,
      gap: spacing.md,
      alignItems: 'center',
    },
  });
}

export default SupportFlowSheet;
