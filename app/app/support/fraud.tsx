import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing } from '@/constants/theme';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import {
  FRAUD_SAFETY_TIPS,
  buildFraudReportDescription,
  fraudReportError,
} from '@/lib/helpCenter';
import { createTicket } from '@/services/support';

/**
 * «بلّغ عن احتيال» — safety tips + a short form. Creates a FRAUD ticket that goes
 * straight to the human support queue with HIGH priority (set by the backend).
 */
export default function SupportFraudScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [target, setTarget] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const err = fraudReportError(details);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSending(true);
    const res = await createTicket({
      category: 'FRAUD',
      subject: 'بلاغ احتيال',
      description: buildFraudReportDescription({ target, details }),
    });
    setSending(false);
    if (!res.ok || !res.ticket?.id) {
      setError(res.error ?? 'تعذر إرسال البلاغ. حاول مرة ثانية.');
      return;
    }
    router.replace({
      pathname: '/support/tickets/[id]',
      params: { id: res.ticket.id, fresh: '1' },
    } as never);
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="بلّغ عن احتيال" showBack />
      <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
        <View style={[styles.tips, { borderColor: colors.borderHairline }]}>
          <Stack gap="md">
            <Row gap="sm" align="center">
              <AppIcon name="shield-check-outline" size={20} color={colors.textPrimary} />
              <AppText variant="cardTitle">قبل كل شي</AppText>
            </Row>
            {FRAUD_SAFETY_TIPS.map((tip) => (
              <Row key={tip} gap="sm" align="start">
                <AppText variant="body" color="textMuted">•</AppText>
                <AppText variant="body" color="textSecondary" style={styles.fill}>
                  {tip}
                </AppText>
              </Row>
            ))}
          </Stack>
        </View>

        <Stack gap="md">
          <SarhInput
            appearance="theme"
            label="الحساب أو الإعلان (اختياري)"
            value={target}
            onChangeText={setTarget}
            placeholder="اسم المستخدم أو رابط الإعلان"
            autoCapitalize="none"
          />
          <SarhInput
            appearance="theme"
            label="وش صار؟"
            value={details}
            onChangeText={(t) => {
              setDetails(t);
              if (error) setError(null);
            }}
            placeholder="اكتب التفاصيل: المبلغ، طريقة التواصل، وأي شي يساعدنا"
            multiline
            numberOfLines={6}
            style={styles.textArea}
            errorText={error ?? undefined}
          />
          <SarhButton
            title="أرسل البلاغ"
            variant="danger"
            fullWidth
            loading={sending}
            disabled={sending}
            onPress={() => void submit()}
          />
          <AppText variant="caption" color="textMuted" align="center">
            بلاغات الاحتيال يتابعها فريقنا بأولوية، والرد يجيك في تذاكري.
          </AppText>
        </Stack>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  tips: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
});
