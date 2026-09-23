import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhAvatar, SarhButton, SarhDivider, SarhSurface, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { showToast } from '@/lib/toast';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useSupportTicketSocket } from '@/hooks/useSupportTicketSocket';
import { useAuth } from '@/contexts/AuthContext';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { messageAuthorLabel } from '@/lib/supportRealtime';
import { SUPPORT_CUSTOMER_SERVICE } from '@/constants/supportIdentity';
import { userFacingTicketStatus } from '@/lib/supportFlow';
import {
  fetchTicket,
  replyToTicket,
  type SupportTicketDetail,
  type SupportTicketMessage,
} from '@/services/support';

function isSystemHandoff(msg: SupportTicketMessage) {
  return (
    msg.authorKind === 'SARHAN' &&
    (msg.body.includes('تم تحويل طلبك') || msg.body.includes('الفريق المختص'))
  );
}

export default function SupportTicketDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; fresh?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const fresh = Array.isArray(params.fresh) ? params.fresh[0] : params.fresh;
  const { accessToken } = useAuth();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await fetchTicket(String(id));
    if (data) setTicket(data);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, fresh]),
  );

  useSupportTicketSocket(accessToken, ticket?.id ?? (id ? String(id) : null), () => {
    void load();
  });

  const handleReply = async () => {
    if (!ticket || !reply.trim()) return;
    setSending(true);
    const res = await replyToTicket(ticket.id, reply.trim());
    setSending(false);
    if (!res.ok) {
      void showToast(res.error ?? 'حاول مرة أخرى', 'error');
      return;
    }
    setReply('');
    void load();
  };

  if (loading && !ticket) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title={SUPPORT_CUSTOMER_SERVICE.name} showBack />
        <ScreenBody scroll={false} style={styles.centered}>
          <ActivityIndicator />
        </ScreenBody>
      </Screen>
    );
  }

  if (!ticket) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title={SUPPORT_CUSTOMER_SERVICE.name} showBack />
        <ScreenBody scroll={false} padTop="xxl">
          <AppText variant="body" color="textMuted" align="center">
            المحادثة غير موجودة
          </AppText>
        </ScreenBody>
      </Screen>
    );
  }

  const closed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title={SUPPORT_CUSTOMER_SERVICE.name} showBack />

      <Row gap="md" style={styles.identity}>
        <SarhAvatar
          source={SUPPORT_CUSTOMER_SERVICE.avatarSource}
          name={SUPPORT_CUSTOMER_SERVICE.assistantName}
          size="md"
          accessibilityLabel={SUPPORT_CUSTOMER_SERVICE.assistantName}
        />
        <Stack gap="none" style={styles.fill}>
          <AppText variant="bodyMedium">{SUPPORT_CUSTOMER_SERVICE.name}</AppText>
          <AppText variant="caption" color="textMuted">
            {SUPPORT_CUSTOMER_SERVICE.assistantName} · {userFacingTicketStatus(ticket.status)}
          </AppText>
        </Stack>
      </Row>
      <SarhDivider />

      <ScreenBody padTop="lg" gap="sm" padBottom="xxxl">
        {(ticket.messages ?? []).map((msg) => {
          const mine = msg.authorKind === 'CUSTOMER' && !msg.isStaffReply;
          const system = isSystemHandoff(msg);
          return (
            <View
              key={msg.id}
              style={[styles.bubbleWrap, mine ? styles.bubbleMineWrap : styles.bubbleOtherWrap]}
            >
              {system ? (
                <SarhSurface tone="surfaceAlt" style={styles.systemBubble}>
                  <AppText variant="caption" color="textSecondary">
                    {msg.body}
                  </AppText>
                </SarhSurface>
              ) : (
                <Row gap="sm" align="end" style={styles.msgRow}>
                  {!mine ? (
                    <SarhAvatar
                      source={
                        msg.authorKind === 'SARHAN'
                          ? SUPPORT_CUSTOMER_SERVICE.avatarSource
                          : undefined
                      }
                      name={messageAuthorLabel(msg)}
                      size="sm"
                      accessibilityLabel={messageAuthorLabel(msg)}
                    />
                  ) : null}
                  <Stack
                    gap="xs"
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
                  >
                    {!mine ? (
                      <AppText variant="meta" color="textMuted">
                        {messageAuthorLabel(msg)}
                      </AppText>
                    ) : null}
                    <AppText variant="body">{msg.body}</AppText>
                  </Stack>
                </Row>
              )}
            </View>
          );
        })}

        {!closed ? (
          <Stack gap="md" style={styles.replyBox}>
            <SarhInput
              appearance="theme"
              label="اكتب رسالة"
              value={reply}
              onChangeText={setReply}
              multiline
              numberOfLines={3}
            />
            <SarhButton
              title="إرسال"
              fullWidth
              loading={sending}
              disabled={!reply.trim() || sending}
              onPress={() => void handleReply()}
            />
          </Stack>
        ) : (
          <AppText variant="caption" color="textMuted" align="center">
            هذه المحادثة مغلقة.
          </AppText>
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { alignItems: 'center', justifyContent: 'center' },
    fill: { flex: 1, minWidth: 0 },
    identity: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    bubbleWrap: { width: '100%' },
    bubbleMineWrap: { alignItems: 'flex-start' },
    bubbleOtherWrap: { alignItems: 'flex-end' },
    msgRow: { maxWidth: '100%' },
    bubble: {
      maxWidth: '86%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
    },
    bubbleMine: {
      backgroundColor: colors.bgElevated,
    },
    bubbleOther: {
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
    },
    systemBubble: {
      width: '100%',
      padding: spacing.md,
      borderRadius: radius.md,
    },
    replyBox: { marginTop: spacing.md },
  });
}
