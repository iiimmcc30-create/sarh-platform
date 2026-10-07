import { useCallback, useEffect, useState } from 'react';
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
import { AppText, SarhAvatar, SarhButton, SarhDivider, SarhInput, SarhSurface } from '@/design-system/components';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { motion } from '@/design-system';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { getRtlRow } from '@/lib/rtl';
import { createTicket } from '@/services/support';
import {
  SUPPORT_FLOW_CHOICES,
  findSupportFlowChoice,
  greetingFirstName,
  isSupportDescriptionValid,
  supportDescriptionError,
  type SupportFlowChoice,
} from '@/lib/supportFlow';
import { SUPPORT_CUSTOMER_SERVICE } from '@/constants/supportIdentity';
import { SheetModal } from '@/components/ui/SheetModal';

type FlowStep = 'welcome' | 'describe' | 'sending' | 'handoff';

type SupportFlowSheetProps = {
  visible: boolean;
  onClose: () => void;
  initialChoiceId?: string;
};

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

  const [step, setStep] = useState<FlowStep>('welcome');
  const [choice, setChoice] = useState<SupportFlowChoice | undefined>(
    findSupportFlowChoice(initialChoiceId),
  );
  const [description, setDescription] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const firstName = greetingFirstName(me.arabicName, me.displayName);
  const hello = firstName ? `مرحباً ${firstName}` : 'مرحباً';

  const reset = useCallback(() => {
    const preset = findSupportFlowChoice(initialChoiceId);
    if (preset) {
      setStep('describe');
    } else {
      setStep('welcome');
    }
    setChoice(preset);
    setDescription('');
    setSubmitError(null);
  }, [initialChoiceId]);

  useEffect(() => {
    if (!visible) return;
    reset();
  }, [visible, reset]);

  const pickChoice = (next: SupportFlowChoice) => {
    setChoice(next);
    setSubmitError(null);
    setStep('describe');
  };

  const goBackStep = () => {
    setSubmitError(null);
    setStep('welcome');
  };

  const submit = async () => {
    const err = supportDescriptionError(description);
    if (err) {
      setSubmitError(err);
      return;
    }
    if (!choice) return;
    setSubmitError(null);
    setStep('sending');
    const res = await createTicket({
      helpKind: choice.helpKind,
      category: choice.category,
      description: description.trim(),
    });
    if (!res.ok || !res.ticket?.id) {
      setStep('describe');
      setSubmitError(res.error ?? 'تعذر إرسال الطلب. حاول مرة أخرى.');
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

  const describePrompt = 'اشرح لنا المشكلة';

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
            مركز المساعدة
          </AppText>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {step === 'welcome' ? (
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
                    {hello}
                  </AppText>
                  <AppText variant="heading2">كيف يمكننا مساعدتك؟</AppText>
                </View>
              </View>
              {SUPPORT_FLOW_CHOICES.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => pickChoice(item)}
                  style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <AppText variant="body">{item.label}</AppText>
                </Pressable>
              ))}
              <SarhDivider style={styles.footerRule} />
              <Pressable
                onPress={() => {
                  onClose();
                  router.push('/support/tickets' as never);
                }}
                accessibilityRole="button"
                accessibilityLabel="بلاغاتي"
              >
                <AppText variant="label" color="primary" align="center">
                  بلاغاتي
                </AppText>
              </Pressable>
            </>
          ) : null}

          {step === 'describe' || step === 'sending' ? (
            <>
              <AppText variant="heading3">{describePrompt}</AppText>
              {choice ? (
                <AppText variant="caption" color="textMuted">
                  {choice.label}
                </AppText>
              ) : null}
              <SarhInput
                label="تفاصيل المشكلة"
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (submitError) setSubmitError(null);
                }}
                multiline
                numberOfLines={6}
                style={styles.textArea}
                errorText={submitError ?? undefined}
              />
              <SarhButton
                title="إرسال الطلب"
                fullWidth
                loading={step === 'sending'}
                disabled={step === 'sending' || !isSupportDescriptionValid(description)}
                onPress={() => void submit()}
              />
              <Pressable onPress={goBackStep} disabled={step === 'sending'}>
                <AppText variant="caption" color="primary" align="center">
                  رجوع
                </AppText>
              </Pressable>
            </>
          ) : null}

          {step === 'handoff' ? (
            <View style={styles.handoff}>
              <ActivityIndicator color={colors.electric} />
              <AppText variant="heading3" align="center">
                تم استلام تفاصيل طلبك
              </AppText>
              <AppText variant="body" color="textSecondary" align="center">
                سننقلك الآن إلى فريق الدعم لمتابعة المشكلة.
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
    optionRow: {
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
      gap: 2,
    },
    pressed: { opacity: motion.press.opacity },
    textArea: { minHeight: 140, textAlignVertical: 'top' },
    footerRule: { marginVertical: spacing.md },
    handoff: {
      paddingVertical: spacing.xxl,
      gap: spacing.md,
      alignItems: 'center',
    },
  });
}

export default SupportFlowSheet;
