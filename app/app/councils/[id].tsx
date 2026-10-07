// «المجالس» room: 4 × 3 stage, speak requests, moderation, audio via Agora (councils flag).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { CouncilInviteSheet } from '@/components/councils/CouncilInviteSheet';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { CouncilRequestsSheet } from '@/components/councils/CouncilRequestsSheet';
import { CouncilRulesSheet } from '@/components/councils/CouncilRulesSheet';
import { CouncilSheet } from '@/components/councils/CouncilSheet';
import { SpeakerGrid } from '@/components/councils/SpeakerGrid';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhAvatar, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useCouncilAudio } from '@/hooks/useCouncilAudio';
import { useCouncilSocket } from '@/hooks/useCouncilSocket';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { confirmDestructive, presentActionSheet, type ActionSheetItem } from '@/lib/actionSheet';
import { isCouncilAudioAvailable } from '@/lib/councilsAgora';
import { ensureMicPermission } from '@/lib/livePermissions';
import { openUserProfile } from '@/lib/openUserProfile';
import { safePush } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import { resolveMediaUrl } from '@/services/media';
import {
  COUNCIL_AUDIO_UNAVAILABLE_TEXT,
  COUNCIL_BANNED_TEXT,
  COUNCIL_ENDED_TEXT,
  COUNCIL_FULL_TEXT,
  COUNCIL_KICKED_TEXT,
  COUNCIL_LIVE_BUSY_TEXT,
  COUNCIL_RESYNC_MS,
  COUNCIL_WEB_TEXT,
  CouncilApiError,
  cancelSpeakRequest,
  councilErrorMessage,
  councilHandle,
  councilListenersLabel,
  councilMemberAction,
  councilMemberMenu,
  councilUserName,
  decideSpeakRequest,
  endCouncil,
  fetchCouncil,
  fetchCouncilBanned,
  fetchCouncilToken,
  joinCouncil,
  leaveCouncil,
  leaveCouncilStage,
  requestToSpeak,
  setCouncilMic,
  type CouncilMemberAction,
  type CouncilRequest,
  type CouncilSpeaker,
  type CouncilState,
  type CouncilUser,
} from '@/services/councils';

type Blocked = 'ended' | 'banned' | 'kicked' | 'not_found' | null;

export default function CouncilRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const code = typeof params.code === 'string' && params.code ? params.code : null;
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));

  const [state, setState] = useState<CouncilState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Blocked>(null);
  const [joined, setJoined] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesReadOnly, setRulesReadOnly] = useState(false);
  const [joining, setJoining] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bannedOpen, setBannedOpen] = useState(false);
  const [banned, setBanned] = useState<CouncilUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [agoraError, setAgoraError] = useState<string | null>(null);

  const stateRef = useRef<CouncilState | null>(null);
  stateRef.current = state;
  const joinedRef = useRef(false);
  joinedRef.current = joined;
  const focused = useRef(false);

  const audio = useCouncilAudio({
    councilId: id || undefined,
    requestToken: useCallback(async () => {
      try {
        return await fetchCouncilToken(id);
      } catch (err) {
        if (err instanceof CouncilApiError) handleBlockingError(err);
        return null;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]),
    onFatal: (reason) => {
      if (reason === 'banned') void refresh();
    },
    onMicDenied: () => void showToast('يجب السماح بالميكروفون للتحدث في المجلس', 'error'),
  });

  // ─── State loading ──────────────────────────────────────────────────────

  const applyState = useCallback((next: CouncilState) => {
    setState(next);
    setLoadError(null);
    if (next.council.status === 'ENDED') setBlocked('ended');
    else if (next.me.banned) setBlocked('banned');
    else if (next.me.kickedUntil) setBlocked('kicked');
    else setBlocked(null);
  }, []);

  function handleBlockingError(err: CouncilApiError): boolean {
    const map: Record<string, Blocked> = {
      council_ended: 'ended',
      council_banned: 'banned',
      council_kicked: 'kicked',
      not_found: 'not_found',
    };
    const b = map[err.code] ?? (err.status === 404 ? 'not_found' : null);
    if (!b) return false;
    setBlocked(b);
    setJoined(false);
    audio.stop();
    return true;
  }

  const refresh = useCallback(async () => {
    if (!id) return null;
    try {
      const next = await fetchCouncil(id, code);
      applyState(next);
      return next;
    } catch (err) {
      if (err instanceof CouncilApiError && handleBlockingError(err)) return null;
      setLoadError(councilErrorMessage(err));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, code, applyState]);

  const doJoin = useCallback(
    async (acceptRules: boolean) => {
      if (!id) return;
      setJoining(true);
      try {
        const res = await joinCouncil(id, { code, acceptRules });
        applyState(res.state);
        setRulesOpen(false);
        setJoined(true);
        if (!res.agora) {
          setAgoraError(res.agoraError ?? 'agora_unavailable');
          return;
        }
        setAgoraError(null);
        if (focused.current) await audio.start(res.agora, res.state.me.micMuted);
      } catch (err) {
        if (err instanceof CouncilApiError) {
          if (err.code === 'rules_required') {
            setRulesReadOnly(false);
            setRulesOpen(true);
            return;
          }
          if (handleBlockingError(err)) return;
        }
        void showToast(councilErrorMessage(err), 'error');
      } finally {
        setJoining(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, code, applyState],
  );

  const enter = useCallback(async () => {
    setLoading(true);
    const next = await refresh();
    setLoading(false);
    if (!next || next.council.status !== 'LIVE' || next.me.banned || next.me.kickedUntil) return;
    if (!next.me.rulesAccepted) {
      setRulesReadOnly(false);
      setRulesOpen(true);
      return;
    }
    await doJoin(false);
  }, [refresh, doJoin]);

  // Audio only while the room is focused; leave the council when the screen goes away.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web' || !id) return undefined;
      focused.current = true;
      void enter();
      return () => {
        focused.current = false;
        audio.stop();
        setJoined(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, enter]),
  );

  useEffect(() => {
    if (Platform.OS === 'web' || !id) return undefined;
    return () => {
      const s = stateRef.current;
      if (s?.me.permissions.isOwner && s.me.onStage && !s.me.micMuted) {
        void setCouncilMic(id, true).catch(() => undefined);
      }
      void leaveCouncil(id).catch(() => undefined);
    };
  }, [id]);

  // Safety-net resync while inside the room.
  useEffect(() => {
    if (!joined) return undefined;
    const t = setInterval(() => void refresh(), COUNCIL_RESYNC_MS);
    return () => clearInterval(t);
  }, [joined, refresh]);

  // v1 background policy: auto-mute when the app leaves the foreground, resync on return.
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let wasBackground = false;
    const sub = AppState.addEventListener('change', (next) => {
      const s = stateRef.current;
      if (!joinedRef.current || !s) return;
      // Only real backgrounding — iOS goes `inactive` for permission prompts/control center.
      if (next === 'background') {
        wasBackground = true;
        if (s.me.onStage && !s.me.micMuted) {
          audio.setMuted(true);
          setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: true } } : prev));
          void setCouncilMic(id, true).catch(() => undefined);
        }
      } else if (next === 'active' && wasBackground) {
        wasBackground = false;
        void refresh();
        void audio.renew();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refresh]);

  // ─── Realtime ───────────────────────────────────────────────────────────

  useCouncilSocket({
    councilId: id,
    accessToken,
    enabled: joined && !blocked,
    handlers: {
      onResync: () => void refresh(),
      onSpeakers: (p) =>
        setState((prev) =>
          prev
            ? {
                ...prev,
                speakers: p.speakers,
                speakersCount: p.speakersCount,
                listenerCount: p.listenerCount,
                isFull: p.speakersCount >= prev.council.maxSpeakers,
              }
            : prev,
        ),
      onListeners: (p) => setState((prev) => (prev ? { ...prev, listenerCount: p.listenerCount } : prev)),
      onMic: (p) =>
        setState((prev) => {
          if (!prev) return prev;
          const speakers = prev.speakers.map((s) =>
            s.userId === p.userId
              ? { ...s, micMuted: p.micMuted, mutedByModerator: p.mutedByModerator ?? s.mutedByModerator }
              : s,
          );
          const mine = p.userId === prev.me.userId;
          if (mine) audio.setMuted(p.micMuted);
          return {
            ...prev,
            speakers,
            me: mine
              ? { ...prev.me, micMuted: p.micMuted, mutedByModerator: p.mutedByModerator ?? prev.me.mutedByModerator }
              : prev.me,
          };
        }),
      onRole: (p) => {
        const before = stateRef.current?.me;
        if (before && before.seatIndex === null && p.seatIndex !== null) {
          void showToast('أصبحت متحدثاً — الميكروفون مغلق حتى تفتحه', 'success');
        } else if (before && before.seatIndex !== null && p.seatIndex === null) {
          void showToast('عدت إلى المستمعين', 'info');
        } else if (p.mutedByModerator && !before?.mutedByModerator) {
          void showToast('تم كتم الميكروفون من المشرف', 'info');
        }
        if (p.micMuted) audio.setMuted(true);
        void refresh();
        void audio.renew();
      },
      onKicked: (p) => {
        audio.stop();
        setJoined(false);
        setBlocked(p.reason === 'banned' ? 'banned' : 'kicked');
      },
      onRequestResult: (p) => {
        if (p.status === 'REJECTED') void showToast('لم يتم قبول طلبك هذه المرة', 'info');
        void refresh();
      },
      onRequests: (p) => setState((prev) => (prev ? { ...prev, pendingRequests: p.pending } : prev)),
      onEnded: () => {
        audio.stop();
        setJoined(false);
        setBlocked('ended');
      },
      onUpdated: () => void refresh(),
      onError: (p) => {
        if (p.code === 'council_ended') setBlocked('ended');
        else if (p.code === 'council_banned') setBlocked('banned');
        else if (p.code === 'council_kicked') setBlocked('kicked');
        else void refresh();
      },
    },
  });

  // ─── Actions ────────────────────────────────────────────────────────────

  const run = useCallback(async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) void showToast(ok, 'success');
      return true;
    } catch (err) {
      if (!(err instanceof CouncilApiError && handleBlockingError(err))) {
        void showToast(councilErrorMessage(err), 'error');
      }
      void refresh();
      return false;
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const toggleMic = useCallback(async () => {
    const s = stateRef.current;
    if (!s?.me.onStage) return;
    if (s.me.mutedByModerator) {
      void showToast('الميكروفون مكتوم من المشرف', 'info');
      return;
    }
    const nextMuted = !s.me.micMuted;
    if (!nextMuted) {
      if (!(await ensureMicPermission())) {
        void showToast('يجب السماح بالميكروفون للتحدث في المجلس', 'error');
        return;
      }
    } else {
      audio.setMuted(true);
    }
    setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: nextMuted } } : prev));
    const ok = await run('mic', async () => {
      await setCouncilMic(id, nextMuted);
      if (!nextMuted) {
        if (!audio.isPublisher()) await audio.renew();
        audio.setMuted(false);
      }
    });
    if (!ok) audio.setMuted(true);
  }, [audio, id, run]);

  const onRequest = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.me.pendingRequestId) {
      void run('request', () => cancelSpeakRequest(id), 'تم إلغاء الطلب').then(() => refresh());
    } else {
      void run('request', () => requestToSpeak(id), 'تم إرسال طلب التحدث').then(() => refresh());
    }
  }, [id, refresh, run]);

  const onLeaveStage = useCallback(async () => {
    audio.setMuted(true);
    await run('stage', () => leaveCouncilStage(id));
    void refresh();
    void audio.renew();
  }, [audio, id, refresh, run]);

  const onDecide = useCallback(
    (r: CouncilRequest, accept: boolean) => {
      setBusy(`req:${r.id}`);
      void decideSpeakRequest(id, r.id, accept)
        .catch((err) => void showToast(councilErrorMessage(err), 'error'))
        .finally(() => {
          setBusy(null);
          void refresh();
        });
    },
    [id, refresh],
  );

  const memberAction = useCallback(
    async (target: { userId: string; name: string }, action: CouncilMemberAction) => {
      if (action === 'ban' || action === 'kick') {
        const ok = await confirmDestructive(
          action === 'ban' ? `حظر ${target.name}؟` : `إزالة ${target.name}؟`,
          action === 'ban' ? 'لن يتمكن من دخول هذا المجلس مرة أخرى' : 'لن يتمكن من العودة لمدة ١٠ دقائق',
          action === 'ban' ? 'حظر' : 'إزالة',
        );
        if (!ok) return;
      }
      await run(`member:${target.userId}`, () => councilMemberAction(id, target.userId, action));
      void refresh();
    },
    [id, refresh, run],
  );

  const openMemberMenu = useCallback(
    async (
      target: { userId: string; user: CouncilUser; role: CouncilSpeaker['role']; mutedByModerator: boolean },
      onStage: boolean,
    ) => {
      const s = stateRef.current;
      if (!s) return;
      const name = councilUserName(target.user);
      if (target.userId === s.me.userId) {
        const items: ActionSheetItem[] = [
          { key: 'mic', label: s.me.micMuted ? 'فتح الميكروفون' : 'إغلاق الميكروفون', icon: s.me.micMuted ? 'mic' : 'mic-off' },
        ];
        if (!s.me.permissions.isOwner) items.push({ key: 'stage', label: 'النزول إلى المستمعين', icon: 'volume-high' });
        items.push({ key: 'cancel', label: 'إلغاء', cancel: true });
        const key = await presentActionSheet({ title: 'أنت', items });
        if (key === 'mic') void toggleMic();
        if (key === 'stage') void onLeaveStage();
        return;
      }
      const menu = councilMemberMenu(s.me, { ...target, onStage }, s.isFull);
      const items: ActionSheetItem[] = [
        { key: 'profile', label: 'عرض الملف الشخصي', icon: 'person-outline' },
        ...menu.map((m) => ({ key: m.key, label: m.label, icon: m.icon, destructive: m.destructive })),
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ];
      const key = await presentActionSheet({ title: name, message: councilHandle(target.user.username), items });
      if (!key || key === 'cancel') return;
      if (key === 'profile') {
        openUserProfile(router, target.userId);
        return;
      }
      void memberAction({ userId: target.userId, name }, key as CouncilMemberAction);
    },
    [memberAction, onLeaveStage, router, toggleMic],
  );

  const openBanned = useCallback(async () => {
    setBannedOpen(true);
    try {
      const r = await fetchCouncilBanned(id);
      setBanned(r.banned.map((b) => b.user));
    } catch (err) {
      void showToast(councilErrorMessage(err), 'error');
    }
  }, [id]);

  const onEnd = useCallback(async () => {
    const ok = await confirmDestructive('إنهاء المجلس؟', 'سيخرج جميع الحاضرين وينتهي المجلس للجميع', 'إنهاء');
    if (!ok) return;
    audio.stop();
    await run('end', () => endCouncil(id), 'تم إنهاء المجلس');
    setBlocked('ended');
  }, [audio, id, run]);

  const openMenu = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const p = s.me.permissions;
    const items: ActionSheetItem[] = [{ key: 'rules', label: 'قواعد المجلس', icon: 'document-text-outline' }];
    if (p.canInvite) items.push({ key: 'invite', label: 'دعوة', icon: 'person-add-outline' });
    if (p.canManageRequests) items.push({ key: 'requests', label: 'طلبات التحدث', icon: 'hand-left-outline' });
    if (p.canBan || p.isOwner) items.push({ key: 'banned', label: 'المحظورون', icon: 'block' });
    if (p.canEdit) items.push({ key: 'edit', label: 'إعدادات المجلس', icon: 'settings-outline' });
    if (s.me.onStage && !p.isOwner) items.push({ key: 'stage', label: 'النزول إلى المستمعين', icon: 'volume-high' });
    if (p.canEnd) items.push({ key: 'end', label: 'إنهاء المجلس', icon: 'close-circle-outline', destructive: true });
    items.push({ key: 'leave', label: 'مغادرة المجلس', icon: 'log-out-outline', destructive: !p.canEnd });
    items.push({ key: 'cancel', label: 'إلغاء', cancel: true });
    const key = await presentActionSheet({ title: s.council.name, items });
    switch (key) {
      case 'rules':
        setRulesReadOnly(true);
        setRulesOpen(true);
        break;
      case 'invite':
        setInviteOpen(true);
        break;
      case 'requests':
        setRequestsOpen(true);
        break;
      case 'banned':
        void openBanned();
        break;
      case 'edit':
        safePush({ pathname: '/councils/create', params: { id: s.council.id } }, undefined, router);
        break;
      case 'stage':
        void onLeaveStage();
        break;
      case 'end':
        void onEnd();
        break;
      case 'leave':
        router.back();
        break;
      default:
        break;
    }
  }, [onEnd, onLeaveStage, openBanned, router]);

  const speakingUserIds = useMemo(() => {
    const set = new Set<string>();
    if (!state) return set;
    for (const uid of audio.speakingUids) {
      if (uid === 0) {
        if (state.me.onStage) set.add(state.me.userId);
        continue;
      }
      const s = state.speakers.find((sp) => sp.agoraUid === uid);
      if (s) set.add(s.userId);
    }
    return set;
  }, [audio.speakingUids, state]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (Platform.OS === 'web') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="المجالس" showBack />
        <CouncilNotice title="المجالس في التطبيق" message={COUNCIL_WEB_TEXT} />
      </Screen>
    );
  }

  const header = (
    <ScreenHeader
      variant="screen"
      title={state?.council.name ?? 'المجلس'}
      showBack
      rightIcon={state && !blocked ? 'ellipsis-horizontal' : undefined}
      onRightPress={state && !blocked ? () => void openMenu() : undefined}
      rightAccessibilityLabel="خيارات المجلس"
    />
  );

  if (blocked) {
    const notice = {
      ended: { icon: 'mic-off', title: COUNCIL_ENDED_TEXT, message: 'شكراً لحضورك' },
      banned: { icon: 'block', title: COUNCIL_BANNED_TEXT, message: undefined },
      kicked: { icon: 'log-out-outline', title: COUNCIL_KICKED_TEXT, message: 'يمكنك العودة لاحقاً' },
      not_found: { icon: 'lock-closed-outline', title: 'المجلس غير متاح', message: 'قد يكون خاصاً أو انتهى' },
    }[blocked];
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        <CouncilNotice {...notice} actionLabel="العودة إلى المجالس" onAction={() => router.back()} />
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen edges={['top', 'bottom']}>
        {header}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <CouncilNotice
            icon="alert-circle-outline"
            title="تعذّر فتح المجلس"
            message={loadError ?? undefined}
            actionLabel="إعادة المحاولة"
            onAction={() => void enter()}
          />
        )}
      </Screen>
    );
  }

  const { council, me } = state;
  const perms = me.permissions;
  const requestsCount = state.pendingRequests.length;
  const audioNotice = !isCouncilAudioAvailable()
    ? 'الصوت يتطلب أحدث إصدار من التطبيق'
    : agoraError
      ? COUNCIL_AUDIO_UNAVAILABLE_TEXT
      : audio.status === 'busy'
        ? COUNCIL_LIVE_BUSY_TEXT
        : audio.status === 'reconnecting'
          ? 'جارٍ إعادة الاتصال…'
          : audio.status === 'failed'
            ? 'انقطع الصوت'
            : null;

  return (
    <Screen edges={['top', 'bottom']}>
      {header}
      <ScreenBody gap="xl" padTop="sm" bottomInset="action" contentContainerStyle={styles.bodyContent}>
        <Stack gap="sm">
          <Row gap="sm" align="center">
            <View style={styles.liveDot} />
            <AppText variant="caption" color="success">
              مباشر
            </AppText>
            <AppText variant="caption" color="textMuted">
              · {councilListenersLabel(state.listenerCount)}
            </AppText>
            {council.visibility === 'PRIVATE' ? (
              <Row gap="xs" align="center">
                <AppIcon name="lock-closed-outline" size={12} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted">
                  خاص
                </AppText>
              </Row>
            ) : null}
          </Row>
          {council.description ? (
            <AppText variant="bodySmall" color="textSecondary">
              {council.description}
            </AppText>
          ) : null}
          <Row gap="sm" align="center">
            <SarhAvatar
              uri={council.owner.avatar ? resolveMediaUrl(council.owner.avatar) : null}
              name={councilUserName(council.owner)}
              size="xs"
            />
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {councilUserName(council.owner)}
            </AppText>
          </Row>
        </Stack>

        {audioNotice ? (
          <Row gap="sm" align="center" style={styles.notice}>
            <AppIcon name="information-circle-outline" size={16} color={colors.textMuted} />
            <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
              {audioNotice}
            </AppText>
            {audio.status === 'failed' || audio.status === 'busy' ? (
              <Pressable onPress={() => void doJoin(false)} hitSlop={8} accessibilityRole="button">
                <AppText variant="caption" color="textPrimary">
                  إعادة المحاولة
                </AppText>
              </Pressable>
            ) : null}
          </Row>
        ) : null}

        {/* Stage block takes the free height and centres the 4 × 3 grid + listeners pill in it. */}
        <View style={styles.stage} testID="council-stage">
          <SpeakerGrid
            speakers={state.speakers}
            speakingUserIds={speakingUserIds}
            myUserId={me.userId}
            onSpeakerPress={(s) => void openMemberMenu(s, true)}
          />

          <Row gap="sm" align="center" justify="center" style={styles.listenersPill}>
            <AppIcon name="volume-high" size={16} color={colors.textSecondary} />
            <AppText variant="label" color="textSecondary">
              {councilListenersLabel(state.listenerCount)}
            </AppText>
            {state.isFull ? (
              <AppText variant="caption" color="textMuted">
                · {COUNCIL_FULL_TEXT}
              </AppText>
            ) : null}
          </Row>
        </View>
      </ScreenBody>

      <View style={styles.bar}>
        {perms.canManageRequests ? (
          <Pressable
            onPress={() => setRequestsOpen(true)}
            style={styles.barIcon}
            accessibilityRole="button"
            accessibilityLabel={`طلبات التحدث ${requestsCount}`}
          >
            <AppIcon name="hand-left-outline" size={20} color={colors.textPrimary} />
            {requestsCount > 0 ? (
              <View style={styles.badge}>
                <AppText variant="micro" color="textPrimary">
                  {requestsCount > 9 ? '9+' : requestsCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        ) : null}

        <View style={{ flex: 1 }}>
          {me.onStage ? (
            <SarhButton
              title={me.mutedByModerator ? 'مكتوم من المشرف' : me.micMuted ? 'فتح الميكروفون' : 'إغلاق الميكروفون'}
              leftIcon={me.micMuted || me.mutedByModerator ? 'mic-off' : 'mic'}
              variant={me.micMuted || me.mutedByModerator ? 'secondary' : 'primary'}
              shape="pill"
              fullWidth
              disabled={me.mutedByModerator}
              loading={busy === 'mic'}
              onPress={() => void toggleMic()}
            />
          ) : (
            <SarhButton
              title={me.pendingRequestId ? 'إلغاء طلب التحدث' : state.isFull ? COUNCIL_FULL_TEXT : 'طلب التحدث'}
              leftIcon="hand-left-outline"
              variant={me.pendingRequestId ? 'secondary' : 'primary'}
              shape="pill"
              fullWidth
              disabled={(!me.pendingRequestId && state.isFull) || !joined}
              loading={busy === 'request' || joining}
              onPress={onRequest}
            />
          )}
        </View>

        <Pressable
          onPress={() => router.back()}
          style={styles.barIcon}
          accessibilityRole="button"
          accessibilityLabel="مغادرة المجلس"
        >
          <AppIcon name="log-out-outline" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <CouncilRulesSheet
        visible={rulesOpen}
        councilName={council.name}
        rules={council.rules}
        readOnly={rulesReadOnly}
        loading={joining}
        onAccept={() => void doJoin(true)}
        onClose={() => {
          setRulesOpen(false);
          if (!rulesReadOnly && !joinedRef.current) router.back();
        }}
      />
      <CouncilRequestsSheet
        visible={requestsOpen}
        requests={state.pendingRequests}
        isFull={state.isFull}
        busyId={busy?.startsWith('req:') ? busy.slice(4) : null}
        onDecide={onDecide}
        onMore={(r) =>
          void openMemberMenu({ userId: r.user.id, user: r.user, role: 'LISTENER', mutedByModerator: false }, false)
        }
        onClose={() => setRequestsOpen(false)}
      />
      {perms.canInvite ? (
        <CouncilInviteSheet
          visible={inviteOpen}
          councilId={council.id}
          councilName={council.name}
          inviteCode={council.inviteCode}
          isPrivate={council.visibility === 'PRIVATE'}
          canRotate={perms.isOwner}
          onCodeRotated={(c) =>
            setState((prev) => (prev ? { ...prev, council: { ...prev.council, inviteCode: c } } : prev))
          }
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
      <CouncilSheet visible={bannedOpen} title="المحظورون" onClose={() => setBannedOpen(false)}>
        {banned.length === 0 ? (
          <AppText variant="bodySmall" color="textMuted" align="center" style={styles.emptySheet}>
            لا يوجد محظورون
          </AppText>
        ) : (
          banned.map((u) => (
            <Row key={u.id} gap="md" align="center">
              <SarhAvatar uri={u.avatar ? resolveMediaUrl(u.avatar) : null} name={councilUserName(u)} size="md" />
              <AppText variant="label" color="textPrimary" numberOfLines={1} style={{ flex: 1 }}>
                {councilUserName(u)}
              </AppText>
              <SarhButton
                title="إلغاء الحظر"
                size="sm"
                shape="pill"
                variant="secondary"
                loading={busy === `member:${u.id}`}
                onPress={() =>
                  void run(`member:${u.id}`, () => councilMemberAction(id, u.id, 'unban'), 'تم إلغاء الحظر').then(
                    (ok) => ok && setBanned((list) => list.filter((b) => b.id !== u.id)),
                  )
                }
              />
            </Row>
          ))
        )}
      </CouncilSheet>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    bodyContent: { flexGrow: 1 },
    stage: { flexGrow: 1, justifyContent: 'center', gap: spacing.xxl, paddingBottom: spacing.xl },
    listenersPill: {
      alignSelf: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.success },
    notice: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSoft,
    },
    barIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badge: {
      position: 'absolute',
      top: -2,
      end: -2,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptySheet: { paddingVertical: spacing.xl },
  });
}
