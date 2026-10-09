// «المجالس» room: X Spaces style participants grid (everyone, equal circles, role tags),
// a 12-seat stage, speak requests, moderation and «عرض صورة» (Gold). Audio + realtime live in the
// global CouncilSessionProvider, so minimising / going back keeps listening; only
// «مغادرة», council end, kick/ban or logout disconnect.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { CouncilArrivalChip } from '@/components/councils/CouncilArrivalChip';
import { CouncilImageCard } from '@/components/councils/CouncilImageCard';
import { CouncilImagePickerSheet, type CouncilImagePick } from '@/components/councils/CouncilImagePickerSheet';
import { CouncilInviteSheet } from '@/components/councils/CouncilInviteSheet';
import { CouncilMicButton } from '@/components/councils/CouncilMicButton';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { CouncilRequestsSheet } from '@/components/councils/CouncilRequestsSheet';
import { CouncilRoomHeader } from '@/components/councils/CouncilRoomHeader';
import { CouncilRulesSheet } from '@/components/councils/CouncilRulesSheet';
import { CouncilSheet } from '@/components/councils/CouncilSheet';
import { CouncilParticipantsList } from '@/components/councils/CouncilParticipantsList';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useCouncilSession } from '@/contexts/CouncilSessionContext';
import { AppText, SarhAvatar, SarhButton } from '@/design-system/components';
import { Row, Screen, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { confirmDestructive, presentActionSheet, type ActionSheetItem } from '@/lib/actionSheet';
import { isCouncilAudioAvailable } from '@/lib/councilsAgora';
import { openUserProfile } from '@/lib/openUserProfile';
import { safePush } from '@/lib/safeNavigate';
import { subscriberTierOf } from '@/lib/subscriberTier';
import { shouldShowVerifiedBadge } from '@/lib/verifiedBadge';
import { showToast } from '@/lib/toast';
import { resolveMediaUrl } from '@/services/media';
import { promptReport } from '@/services/reports';
import {
  COUNCIL_AUDIO_UNAVAILABLE_TEXT,
  COUNCIL_BANNED_TEXT,
  COUNCIL_ENDED_TEXT,
  COUNCIL_FULL_TEXT,
  COUNCIL_KICKED_TEXT,
  COUNCIL_LIVE_BUSY_TEXT,
  COUNCIL_SHOW_IMAGE_LABEL,
  COUNCIL_WEB_TEXT,
  cancelSpeakRequest,
  councilErrorMessage,
  councilHandle,
  councilListenersLabel,
  councilMemberAction,
  councilSpeakersLabel,
  councilMemberMenu,
  councilUserName,
  decideSpeakRequest,
  endCouncil,
  fetchCouncilBanned,
  leaveCouncilStage,
  removeCouncilImage,
  requestToSpeak,
  showCouncilImage,
  type CouncilMemberAction,
  type CouncilParticipant,
  type CouncilRequest,
  type CouncilSpeaker,
  type CouncilUser,
} from '@/services/councils';

export default function CouncilRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const code = typeof params.code === 'string' && params.code ? params.code : null;
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const session = useCouncilSession();

  // The session may still hold another council for a moment while this one opens.
  const mine = session.councilId === id;
  const state = mine ? session.state : null;
  const blocked = mine ? session.blocked : null;
  const joined = mine && session.joined;
  const { audio, busy, run, refresh } = session;

  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesReadOnly, setRulesReadOnly] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bannedOpen, setBannedOpen] = useState(false);
  const [banned, setBanned] = useState<CouncilUser[]>([]);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);

  const focusedRef = useRef(false);
  const wasJoinedRef = useRef(false);
  const stateRef = useRef(state);
  const joinedRef = useRef(joined);
  useEffect(() => {
    stateRef.current = state;
    joinedRef.current = joined;
  });

  const enter = useCallback(async () => {
    const r = await session.open(id, code);
    if (r === 'rules') {
      setRulesReadOnly(false);
      setRulesOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, code, session.open]);

  const acceptRules = useCallback(async () => {
    const r = await session.join(true);
    if (r !== 'rules') setRulesOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.join]);

  // Focus only toggles the mini player; blur never stops audio (minimise = keep listening).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web' || !id) return undefined;
      session.setRoomFocused(true);
      focusedRef.current = true;
      void enter();
      return () => {
        focusedRef.current = false;
        session.setRoomFocused(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, enter]),
  );

  // ─── Actions ────────────────────────────────────────────────────────────

  // Opened from a link/notification with nothing underneath: land on the home tabs.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  /** Minimise: leave the screen, keep listening (mini player takes over). */
  const minimize = goBack;

  const onLeave = useCallback(async () => {
    wasJoinedRef.current = false;
    await session.leave();
    goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goBack, session.leave]);

  // Left from outside this screen (notification «مغادرة», logout): close the room.
  useEffect(() => {
    if (joined) {
      wasJoinedRef.current = true;
    } else if (wasJoinedRef.current && session.councilId === null) {
      wasJoinedRef.current = false;
      if (focusedRef.current) goBack();
    }
  }, [joined, session.councilId, goBack]);

  const toggleMic = session.toggleMic;

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
      session.setBusy(`req:${r.id}`);
      void decideSpeakRequest(id, r.id, accept)
        .catch((err) => void showToast(councilErrorMessage(err), 'error'))
        .finally(() => {
          session.setBusy(null);
          void refresh();
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, refresh, session.setBusy],
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
    session.setBlocked('ended');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, id, run, session.setBlocked]);

  // ─── «عرض صورة» (Gold) ──────────────────────────────────────────────────

  const onPickImage = useCallback(
    async (pick: CouncilImagePick) => {
      const ok = await run('image', () => showCouncilImage(id, pick), 'تم عرض الصورة');
      if (ok) setImagePickerOpen(false);
      void refresh();
    },
    [id, refresh, run],
  );

  const openImageMenu = useCallback(async () => {
    const s = stateRef.current;
    const image = s?.image;
    if (!s || !image) return;
    const p = s.me.permissions;
    const mine = image.by?.id === s.me.userId;
    const canRemove = p.isOwner || (p.isModerator && p.canRemove) || mine;
    const canReplace = Boolean(s.me.canShowImage) && (p.isOwner || mine);
    const items: ActionSheetItem[] = [];
    if (canReplace) items.push({ key: 'replace', label: 'تغيير الصورة', icon: 'image-outline' });
    if (canRemove) items.push({ key: 'remove', label: 'إزالة الصورة', icon: 'trash-outline', destructive: true });
    if (!mine) items.push({ key: 'report', label: 'إبلاغ عن الصورة', icon: 'flag-outline', destructive: true });
    items.push({ key: 'cancel', label: 'إلغاء', cancel: true });
    const key = await presentActionSheet({ title: 'الصورة المعروضة', items });
    if (key === 'replace') setImagePickerOpen(true);
    if (key === 'remove') {
      await run('image', () => removeCouncilImage(id), 'تمت إزالة الصورة');
      void refresh();
    }
    if (key === 'report') void promptReport('council_image', id, true);
  }, [id, refresh, run]);

  const openListing = useCallback(
    (listingId: string) => safePush({ pathname: '/listing/[id]', params: { id: listingId } }, undefined, router),
    [router],
  );

  // Raised hands are visible to whoever manages the requests (same list as the sheet).
  const pendingRequests = state?.pendingRequests;
  const raisedHands = useMemo(() => new Set((pendingRequests ?? []).map((r) => r.user.id)), [pendingRequests]);

  const onParticipantPress = useCallback(
    (p: CouncilParticipant) => void openMemberMenu(p, p.onStage),
    [openMemberMenu],
  );

  const openMenu = useCallback(async () => {
    const s = stateRef.current;
    if (!s) return;
    const p = s.me.permissions;
    const items: ActionSheetItem[] = [{ key: 'rules', label: 'قواعد المجلس', icon: 'document-text-outline' }];
    if (s.me.canShowImage) items.push({ key: 'image', label: COUNCIL_SHOW_IMAGE_LABEL, icon: 'image-outline' });
    if (p.canInvite) items.push({ key: 'invite', label: 'دعوة', icon: 'person-add-outline' });
    if (p.canManageRequests) items.push({ key: 'requests', label: 'طلبات التحدث', icon: 'hand-left-outline' });
    if (p.canBan || p.isOwner) items.push({ key: 'banned', label: 'المحظورون', icon: 'block' });
    if (p.canEdit) items.push({ key: 'edit', label: 'إعدادات المجلس', icon: 'settings-outline' });
    if (s.me.onStage && !p.isOwner) items.push({ key: 'stage', label: 'النزول إلى المستمعين', icon: 'volume-high' });
    if (p.canEnd) items.push({ key: 'end', label: 'إنهاء المجلس', icon: 'close-circle-outline', destructive: true });
    items.push({ key: 'cancel', label: 'إلغاء', cancel: true });
    const key = await presentActionSheet({ title: s.council.name, items });
    switch (key) {
      case 'rules':
        setRulesReadOnly(true);
        setRulesOpen(true);
        break;
      case 'image':
        setImagePickerOpen(true);
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
      default:
        break;
    }
  }, [onEnd, onLeaveStage, openBanned, router]);

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
    <CouncilRoomHeader
      title={state?.council.name ?? 'المجلس'}
      hostTier={subscriberTierOf(state?.council.owner)}
      onMinimize={minimize}
      onLeave={state && !blocked ? () => void onLeave() : undefined}
      onMore={state && !blocked ? () => void openMenu() : undefined}
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
    const loading = !mine || session.loading;
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
            message={session.loadError ?? undefined}
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
  const agoraError = session.agoraError;
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
      <CouncilArrivalChip arrival={session.arrival} />
      <CouncilParticipantsList
        participants={session.participants}
        speakingUserIds={session.speakingUserIds}
        myUserId={me.userId}
        raisedHands={raisedHands}
        loadingMore={session.loadingMoreListeners}
        bottomInset={0}
        onEndReached={() => void session.loadMoreListeners()}
        onPress={onParticipantPress}
        header={
          <Stack gap="xl">
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
                <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.ownerName}>
                  {councilUserName(council.owner)}
                </AppText>
                {shouldShowVerifiedBadge(council.owner.verified) ? (
                  <VerificationBadge size={13} tier={council.owner.verifiedTier} />
                ) : null}
              </Row>
            </Stack>

            {audioNotice ? (
              <Row gap="sm" align="center" style={styles.notice}>
                <AppIcon name="information-circle-outline" size={16} color={colors.textMuted} />
                <AppText variant="caption" color="textSecondary" style={{ flex: 1 }}>
                  {audioNotice}
                </AppText>
                {audio.status === 'failed' || audio.status === 'busy' ? (
                  <Pressable onPress={() => void session.join(false)} hitSlop={8} accessibilityRole="button">
                    <AppText variant="caption" color="textPrimary">
                      إعادة المحاولة
                    </AppText>
                  </Pressable>
                ) : null}
              </Row>
            ) : null}
            {state.image ? (
              <CouncilImageCard image={state.image} onOpenListing={openListing} onMore={() => void openImageMenu()} />
            ) : null}
            <Row gap="sm" align="center" testID="council-stage">
              <AppText variant="label" color="textPrimary">
                الحضور
              </AppText>
              <AppText variant="caption" color="textMuted">
                {councilSpeakersLabel(state.speakersCount)} · {councilListenersLabel(state.listenerCount)}
              </AppText>
              {state.isFull ? (
                <AppText variant="caption" color="textMuted">
                  · {COUNCIL_FULL_TEXT}
                </AppText>
              ) : null}
            </Row>
          </Stack>
        }
      />

      <View style={styles.bar}>
        <View style={styles.barSide}>
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
        </View>

        <View style={styles.barCenter}>
          {me.onStage ? (
            <CouncilMicButton
              muted={me.micMuted}
              mutedByModerator={me.mutedByModerator}
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
              loading={busy === 'request' || session.joining}
              onPress={onRequest}
            />
          )}
        </View>

        <View style={styles.barSide}>
          {me.canShowImage ? (
            <Pressable
              onPress={() => setImagePickerOpen(true)}
              style={styles.barIcon}
              accessibilityRole="button"
              accessibilityLabel={COUNCIL_SHOW_IMAGE_LABEL}
              testID="council-show-image"
            >
              <AppIcon name="image-outline" size={20} color={colors.textPrimary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <CouncilImagePickerSheet
        visible={imagePickerOpen}
        busy={busy === 'image'}
        onPick={(pick) => void onPickImage(pick)}
        onClose={() => setImagePickerOpen(false)}
      />

      <CouncilRulesSheet
        visible={rulesOpen}
        councilName={council.name}
        rules={council.rules}
        readOnly={rulesReadOnly}
        loading={session.joining}
        onAccept={() => void acceptRules()}
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
            session.setState((prev) => (prev ? { ...prev, council: { ...prev.council, inviteCode: c } } : prev))
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
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.success },
    ownerName: { flexShrink: 1 },
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
    /** Equal side slots keep the round mic button centred. */
    barSide: { width: 48, alignItems: 'center' },
    barCenter: { flex: 1, alignItems: 'center' },
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
