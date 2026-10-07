import { readFileSync } from 'fs';
import path from 'path';
import {
  COUNCIL_FAB_SIZE,
  councilFabAnchor,
  isMiniPlayerVisible,
  leaveCouncilSession,
  planCouncilOpen,
  registerCouncilReleaser,
  releaseCouncilForLive,
  sessionActionOnRoomBlur,
} from '@/lib/councilSession';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Councils session lifecycle (pure rules)', () => {
  it('reopening the same connected council reuses the session (no rejoin)', () => {
    expect(planCouncilOpen({ councilId: 'a', joined: true, blocked: null }, 'a')).toBe('reuse');
    expect(planCouncilOpen({ councilId: 'a', joined: true, blocked: null }, 'b')).toBe('switch');
    expect(planCouncilOpen({ councilId: null, joined: false, blocked: null }, 'a')).toBe('fresh');
    expect(planCouncilOpen({ councilId: 'a', joined: false, blocked: null }, 'a')).toBe('fresh');
    expect(planCouncilOpen({ councilId: 'a', joined: true, blocked: 'ended' }, 'a')).toBe('fresh');
  });

  it('leaving the room screen (blur / back / minimise) keeps listening', () => {
    expect(sessionActionOnRoomBlur(null, true)).toBe('keep');
    expect(sessionActionOnRoomBlur('ended', false)).toBe('reset');
    expect(sessionActionOnRoomBlur('kicked', true)).toBe('reset');
    expect(sessionActionOnRoomBlur(null, false)).toBe('reset'); // rules declined / never joined
  });

  it('mini player shows only while connected and away from the room', () => {
    const base = { councilId: 'a', joined: true, blocked: null, hasState: true, roomFocused: false } as const;
    expect(isMiniPlayerVisible(base)).toBe(true);
    expect(isMiniPlayerVisible({ ...base, roomFocused: true })).toBe(false);
    expect(isMiniPlayerVisible({ ...base, joined: false })).toBe(false);
    expect(isMiniPlayerVisible({ ...base, blocked: 'banned' })).toBe(false);
    expect(isMiniPlayerVisible({ ...base, councilId: null })).toBe(false);
  });

  it('explicit leave stops audio first, mutes an owner with an open mic, then leaves', async () => {
    const calls: string[] = [];
    const deps = {
      stopAudio: () => calls.push('stop'),
      setMic: async (_id: string, muted: boolean) => calls.push(`mic:${muted}`),
      leave: async (id: string) => calls.push(`leave:${id}`),
    };
    await leaveCouncilSession('c1', { isOwner: true, onStage: true, micMuted: false }, deps);
    expect(calls).toEqual(['stop', 'mic:true', 'leave:c1']);
    calls.length = 0;
    await leaveCouncilSession('c1', { isOwner: false, onStage: true, micMuted: false }, deps);
    expect(calls).toEqual(['stop', 'leave:c1']);
  });

  it('network failures never block leaving', async () => {
    const stop = jest.fn();
    await expect(
      leaveCouncilSession('c1', { isOwner: true, onStage: true, micMuted: false }, {
        stopAudio: stop,
        setMic: () => Promise.reject(new Error('net')),
        leave: () => Promise.reject(new Error('net')),
      }),
    ).resolves.toBeUndefined();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('a live stream releases the active council through the registered releaser', () => {
    expect(releaseCouncilForLive()).toBe(false);
    const fn = jest.fn(() => true);
    registerCouncilReleaser(fn);
    expect(releaseCouncilForLive()).toBe(true);
    expect(fn).toHaveBeenCalled();
    registerCouncilReleaser(null);
    expect(releaseCouncilForLive()).toBe(false);
  });

  it('start FAB anchors to the physical bottom-left in RTL and LTR', () => {
    expect(councilFabAnchor(true, 16)).toEqual({ right: 16 });
    expect(councilFabAnchor(false, 16)).toEqual({ left: 16 });
    expect(COUNCIL_FAB_SIZE).toBe(56);
  });
});

describe('Councils session wiring', () => {
  const provider = src('contexts/CouncilSessionContext.tsx');
  const room = src('app/councils/[id].tsx');

  it('audio and socket live in the root provider, not the room screen', () => {
    expect(provider).toContain('useCouncilAudio(');
    expect(provider).toContain('useCouncilSocket(');
    expect(room).not.toContain('useCouncilAudio(');
    expect(room).not.toContain('useCouncilSocket(');
    expect(src('app/_layout.tsx')).toMatch(/<CouncilSessionProvider>[\s\S]*<RootNavigator \/>[\s\S]*<\/CouncilSessionProvider>/);
  });

  it('room blur only toggles the mini player; it never stops audio or leaves', () => {
    expect(room).toContain('return () => session.setRoomFocused(false);');
    expect(room).not.toContain('leaveCouncil(');
    expect(room).not.toMatch(/focused\.current = false;\s*audio\.stop\(\)/);
    expect(room).toContain('await session.leave();');
  });

  it('only leave / end / kick-ban / logout / live disconnect', () => {
    expect(provider).toContain("onKicked: (p) => setBlocked(p.reason === 'banned' ? 'banned' : 'kicked')");
    expect(provider).toContain("onEnded: () => setBlocked('ended')");
    expect(provider).toContain('if (!isAuthenticated && idRef.current) reset();');
    expect(provider).toContain('registerCouncilReleaser(');
    expect(src('app/live/watch/[id].tsx')).toContain('useYieldCouncilForLive(isAgoraAvailable());');
    expect(src('app/live/create.tsx')).toContain('useYieldCouncilForLive(LIVE_BROADCAST_ENABLED);');
  });

  it('mini player docks on the tab bar and on the councils list; post FAB lifts above it', () => {
    expect(src('components/navigation/FloatingTabBar.tsx')).toContain('<CouncilMiniPlayer />');
    expect(src('app/councils/index.tsx')).toContain('<CouncilMiniPlayer');
    const mini = src('components/councils/CouncilMiniPlayer.tsx');
    expect(mini).toContain('session.toggleMic()');
    expect(mini).toContain('session.leave()');
    expect(mini).toContain("pathname: '/councils/[id]'");
    expect(src('components/feature/CreatePostFab.tsx')).toContain('bottom: insets.bottom + bottomOffset + councilInset');
  });

  it('iOS keeps council audio in the background (needs a new build)', () => {
    const app = JSON.parse(src('app.json'));
    expect(app.expo.ios.infoPlist.UIBackgroundModes).toContain('audio');
  });
});

describe('Councils UI: start FAB, round mic, red leave', () => {
  it('councils list: round mic FAB bottom-left replaces the big button', () => {
    const list = src('app/councils/index.tsx');
    expect(list).toContain('testID="council-start-fab"');
    expect(list).toContain("accessibilityLabel={mine ? 'العودة إلى مجلسك' : 'بدء مجلس'}");
    expect(list).toContain('councilFabAnchor(isAppRtl(), spacing.lg)');
    expect(list).toContain('backgroundColor: colors.electric');
    expect(list).toContain('<AppIcon name="mic" size={24} color={colors.onElectric} />');
    expect(list).not.toContain('<BottomAction>');
    expect(list).not.toContain('title="بدء مجلس"');
  });

  it('room: round mic button replaces the text toggle; leave lives in the header', () => {
    const room = src('app/councils/[id].tsx');
    expect(room).toContain('<CouncilMicButton');
    expect(room).not.toContain("title={me.mutedByModerator ? 'مكتوم من المشرف'");
    expect(room).not.toContain('accessibilityLabel="مغادرة المجلس"'); // old bottom-bar leave icon
    expect(room).not.toContain("key: 'leave'");
    expect(room).toContain('<CouncilRoomHeader');
    expect(room).toContain("'طلب التحدث'"); // listeners keep the raise-hand request
  });

  it('mic button states: accent when open, quiet surface + mic-off when closed, disabled when moderator-muted', () => {
    const btn = src('components/councils/CouncilMicButton.tsx');
    expect(btn).toContain("name={open ? 'mic' : 'mic-off'}");
    expect(btn).toContain('open: { backgroundColor: colors.electric }');
    expect(btn).toContain('colors.onElectric');
    expect(btn).toContain('const disabled = mutedByModerator || loading;');
    expect(btn).toContain('useNativeDriver: true');
  });

  it('header: red «مغادرة» text next to the more button, minimise keeps listening', () => {
    const header = src('components/councils/CouncilRoomHeader.tsx');
    expect(header).toContain('<AppText variant="button" color="danger" numberOfLines={1}>');
    expect(header).toContain('مغادرة');
    expect(header).toContain('name="ellipsis-horizontal"');
    expect(header).toContain('name="chevron-down"');
    expect(header.indexOf('council-leave')).toBeLessThan(header.indexOf('ellipsis-horizontal'));
  });
});
