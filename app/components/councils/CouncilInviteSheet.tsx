import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar, SarhButton, SarhInput } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { showToast } from '@/lib/toast';
import { resolveMediaUrl } from '@/services/media';
import {
  councilErrorMessage,
  councilHandle,
  fetchCouncilCodeRequests,
  isValidCouncilJoinCode,
  normalizeCouncilJoinCode,
  respondCouncilCodeRequest,
  updateCouncil,
  type CouncilCodeRequestAction,
  type CouncilCodeRequestRow,
  councilInviteUrl,
  councilUserName,
  inviteToCouncil,
  rotateCouncilInvite,
  searchCouncilUsers,
  type CouncilUser,
} from '@/services/councils';
import { CouncilSheet } from './CouncilSheet';

type Props = {
  visible: boolean;
  councilId: string;
  councilName: string;
  inviteCode: string | undefined;
  /** Private council join code (host / inviting moderators only). */
  joinCode?: string | null;
  isPrivate: boolean;
  canRotate: boolean;
  onCodeRotated: (inviteCode: string, joinCode: string | null) => void;
  onJoinCodeChanged?: (joinCode: string) => void;
  onClose: () => void;
};

export function CouncilInviteSheet({
  visible,
  councilId,
  councilName,
  inviteCode,
  joinCode,
  isPrivate,
  canRotate,
  onCodeRotated,
  onJoinCodeChanged,
  onClose,
}: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CouncilUser[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);
  const [requests, setRequests] = useState<CouncilCodeRequestRow[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [customCode, setCustomCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  const term = q.trim();
  const shown = term.length >= 2 ? results : [];

  const close = () => {
    setQ('');
    setResults([]);
    onClose();
  };

  useEffect(() => {
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(() => {
      void searchCouncilUsers(term)
        .then((r) => {
          if (id === seq.current) setResults(r.users);
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!visible || !isPrivate) return;
    let alive = true;
    fetchCouncilCodeRequests(councilId)
      .then((r) => {
        if (alive) setRequests(r.requests);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, isPrivate, councilId]);

  const answer = async (row: CouncilCodeRequestRow, action: CouncilCodeRequestAction) => {
    setAnswering(row.userId);
    try {
      await respondCouncilCodeRequest(councilId, row.userId, action);
      setRequests((list) => list.filter((r) => r.userId !== row.userId));
      void showToast(
        action === 'invite' ? 'تم إرسال دعوة لمرة واحدة' : action === 'send_code' ? 'تم إرسال الرمز' : 'تم التجاهل',
        'success',
      );
    } catch (err) {
      void showToast(councilErrorMessage(err), 'error');
    } finally {
      setAnswering(null);
    }
  };

  const saveCustomCode = async () => {
    if (!isValidCouncilJoinCode(customCode)) return;
    setSavingCode(true);
    try {
      const next = normalizeCouncilJoinCode(customCode);
      await updateCouncil(councilId, { joinCode: next });
      onJoinCodeChanged?.(next);
      setCustomCode('');
      void showToast('تم تغيير رمز الدخول', 'success');
    } catch (err) {
      void showToast(councilErrorMessage(err), 'error');
    } finally {
      setSavingCode(false);
    }
  };

  const share = async () => {
    const url = inviteCode ? councilInviteUrl(inviteCode) : '';
    if (!url) return;
    try {
      await Share.share({ message: `انضم إلى مجلس «${councilName}» على سرح\n${url}`, url, title: 'دعوة إلى مجلس' });
    } catch {
      // dismissed
    }
  };

  const invite = async (u: CouncilUser) => {
    setBusyId(u.id);
    try {
      await inviteToCouncil(councilId, [u.id]);
      setInvited((s) => new Set(s).add(u.id));
    } catch (err) {
      void showToast(councilErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const rotate = async () => {
    try {
      const r = await rotateCouncilInvite(councilId);
      onCodeRotated(r.inviteCode, r.joinCode ?? null);
      void showToast('تم تجديد الرمز والرابط', 'success');
    } catch (err) {
      void showToast(councilErrorMessage(err), 'error');
    }
  };

  return (
    <CouncilSheet visible={visible} title="دعوة إلى المجلس" subtitle={councilName} onClose={close}>
      {inviteCode ? (
        <Row gap="sm" align="center" style={styles.linkBox}>
          <AppIcon name="link-outline" size={18} color={colors.textMuted} />
          <AppText variant="caption" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
            {councilInviteUrl(inviteCode)}
          </AppText>
          <SarhButton title="مشاركة" size="sm" shape="pill" variant="secondary" onPress={() => void share()} />
        </Row>
      ) : null}
      {isPrivate && joinCode ? (
        <Row gap="sm" align="center" style={styles.linkBox} testID="council-join-code">
          <AppIcon name="lock-closed-outline" size={18} color={colors.textMuted} />
          <AppText variant="label" color="textPrimary" style={[{ flex: 1 }, styles.handle]} selectable>
            {joinCode}
          </AppText>
          <AppText variant="caption" color="textMuted">
            رمز الدخول
          </AppText>
        </Row>
      ) : null}
      {isPrivate && canRotate ? (
        <>
          <Pressable onPress={() => void rotate()} accessibilityRole="button">
            <AppText variant="caption" color="textMuted">
              توليد رمز ورابط جديدين (يلغي القديمين)
            </AppText>
          </Pressable>
          <Row gap="sm" align="center">
            <View style={{ flex: 1 }}>
              <SarhInput
                value={customCode}
                onChangeText={(t) => setCustomCode(t.replace(/[^A-Za-z0-9]/g, '').slice(0, 16))}
                placeholder="رمز جديد (٤–١٦ حرفاً/رقماً)"
                appearance="theme"
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <SarhButton
              title="حفظ"
              size="sm"
              shape="pill"
              variant="secondary"
              disabled={!isValidCouncilJoinCode(customCode)}
              loading={savingCode}
              onPress={() => void saveCustomCode()}
            />
          </Row>
        </>
      ) : null}
      {isPrivate && requests.length > 0 ? (
        <View style={{ gap: spacing.sm }} testID="council-code-requests">
          <AppText variant="label" color="textSecondary">
            طلبات الرمز
          </AppText>
          {requests.map((r) => (
            <View key={r.userId} style={{ gap: spacing.xs }}>
              <Row gap="md" align="center">
                <SarhAvatar uri={r.user.avatar ? resolveMediaUrl(r.user.avatar) : null} name={councilUserName(r.user)} size="md" />
                <AppText variant="label" color="textPrimary" numberOfLines={1} style={{ flex: 1 }}>
                  {councilUserName(r.user)}
                </AppText>
              </Row>
              <Row gap="sm" align="center">
                <SarhButton
                  title="دعوة لمرة واحدة"
                  size="sm"
                  shape="pill"
                  loading={answering === r.userId}
                  onPress={() => void answer(r, 'invite')}
                />
                <SarhButton
                  title="إرسال الرمز"
                  size="sm"
                  shape="pill"
                  variant="secondary"
                  disabled={answering === r.userId}
                  onPress={() => void answer(r, 'send_code')}
                />
                <SarhButton
                  title="تجاهل"
                  size="sm"
                  shape="pill"
                  variant="ghost"
                  disabled={answering === r.userId}
                  onPress={() => void answer(r, 'ignore')}
                />
              </Row>
            </View>
          ))}
        </View>
      ) : null}
      <SarhInput value={q} onChangeText={setQ} placeholder="ابحث باسم المستخدم" appearance="theme" autoCapitalize="none" />
      {shown.map((u) => {
        const done = invited.has(u.id);
        return (
          <Row key={u.id} gap="md" align="center">
            <SarhAvatar uri={u.avatar ? resolveMediaUrl(u.avatar) : null} name={councilUserName(u)} size="md" />
            <View style={{ flex: 1 }}>
              <AppText variant="label" color="textPrimary" numberOfLines={1}>
                {councilUserName(u)}
              </AppText>
              <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.handle}>
                {councilHandle(u.username)}
              </AppText>
            </View>
            <SarhButton
              title={done ? 'تمت الدعوة' : 'دعوة'}
              size="sm"
              shape="pill"
              variant={done ? 'ghost' : 'primary'}
              disabled={done}
              loading={busyId === u.id}
              onPress={() => void invite(u)}
            />
          </Row>
        );
      })}
    </CouncilSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    linkBox: {
      padding: spacing.sm,
      paddingStart: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgField,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    handle: { writingDirection: 'ltr', alignSelf: 'flex-start' },
  });
}
