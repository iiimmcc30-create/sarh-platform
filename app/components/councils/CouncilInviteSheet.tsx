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
  isPrivate: boolean;
  canRotate: boolean;
  onCodeRotated: (code: string) => void;
  onClose: () => void;
};

export function CouncilInviteSheet({
  visible,
  councilId,
  councilName,
  inviteCode,
  isPrivate,
  canRotate,
  onCodeRotated,
  onClose,
}: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CouncilUser[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const seq = useRef(0);

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
      onCodeRotated(r.inviteCode);
      void showToast('تم تغيير رابط الدعوة', 'success');
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
      {isPrivate && canRotate ? (
        <Pressable onPress={() => void rotate()} accessibilityRole="button">
          <AppText variant="caption" color="textMuted">
            تغيير الرابط (يلغي الرابط السابق)
          </AppText>
        </Pressable>
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
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                @{u.username}
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
  });
}
