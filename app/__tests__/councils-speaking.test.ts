import { readFileSync } from 'fs';
import path from 'path';
import {
  COUNCIL_SPEAKING_HOLD_MS,
  COUNCIL_SPEAKING_VOLUME,
  COUNCIL_VOLUME_INTERVAL_MS,
  speakingFrom,
  speakingUserIdsFor,
  updateSpeaking,
  withMyMicState,
} from '@/lib/councilSpeaking';
import { resetApiFallbackState, resolveSocketBase, setApiRebase } from '@/services/apiFallback';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Councils speaking detection', () => {
  it('uses a sensible threshold and interval', () => {
    expect(COUNCIL_SPEAKING_VOLUME).toBeGreaterThanOrEqual(5);
    expect(COUNCIL_SPEAKING_VOLUME).toBeLessThanOrEqual(15);
    expect(COUNCIL_VOLUME_INTERVAL_MS).toBeGreaterThanOrEqual(200);
    expect(COUNCIL_VOLUME_INTERVAL_MS).toBeLessThanOrEqual(300);
    expect(COUNCIL_SPEAKING_HOLD_MS).toBeGreaterThan(COUNCIL_VOLUME_INTERVAL_MS);
  });

  it('only loud samples count', () => {
    const r = updateSpeaking({}, [
      { uid: 11, volume: COUNCIL_SPEAKING_VOLUME },
      { uid: 22, volume: COUNCIL_SPEAKING_VOLUME - 1 },
      { uid: 33 },
    ], 1000, false);
    expect(r.speaking).toEqual([11]);
  });

  it('merges local and remote callbacks instead of overwriting', () => {
    let r = updateSpeaking({}, [{ uid: 0, volume: 80 }], 1000, false);
    r = updateSpeaking(r.lastLoud, [{ uid: 42, volume: 60 }], 1010, false);
    expect(r.speaking).toEqual([0, 42]);
    // a silent remote callback does not wipe the local speaker
    r = updateSpeaking(r.lastLoud, [], 1250, false);
    expect(r.speaking).toEqual([0, 42]);
  });

  it('holds briefly between words, then decays', () => {
    let r = updateSpeaking({}, [{ uid: 7, volume: 50 }], 1000, false);
    r = updateSpeaking(r.lastLoud, [{ uid: 7, volume: 0 }], 1000 + COUNCIL_SPEAKING_HOLD_MS, false);
    expect(r.speaking).toEqual([7]);
    r = updateSpeaking(r.lastLoud, [{ uid: 7, volume: 0 }], 1000 + COUNCIL_SPEAKING_HOLD_MS + 1, false);
    expect(r.speaking).toEqual([]);
    expect(r.lastLoud).toEqual({});
    expect(speakingFrom({ 7: 1000 }, 1000 + COUNCIL_SPEAKING_HOLD_MS + 1)).toEqual([]);
  });

  it('my own mic never counts while muted, and muting clears it at once', () => {
    expect(updateSpeaking({}, [{ uid: 0, volume: 200 }], 1000, true).speaking).toEqual([]);
    const live = updateSpeaking({}, [{ uid: 0, volume: 200 }], 1000, false);
    expect(updateSpeaking(live.lastLoud, [], 1001, true).speaking).toEqual([]);
  });

  it('maps uids to users; muted speakers are never speaking', () => {
    const speakers = [
      { userId: 'me', agoraUid: 1, micMuted: false, mutedByModerator: false },
      { userId: 'a', agoraUid: 100, micMuted: false, mutedByModerator: false },
      { userId: 'b', agoraUid: 200, micMuted: true, mutedByModerator: false },
      { userId: 'c', agoraUid: 300, micMuted: false, mutedByModerator: true },
    ];
    const me = { userId: 'me', onStage: true, micMuted: false, mutedByModerator: false };
    expect([...speakingUserIdsFor([0, 100, 200, 300, 999], speakers, me)].sort()).toEqual(['a', 'me']);
    expect(speakingUserIdsFor([0], speakers, { ...me, micMuted: true }).size).toBe(0);
    expect(speakingUserIdsFor([0], speakers, { ...me, onStage: false }).size).toBe(0);
  });
});

describe('Councils speaking mic indicator', () => {
  const seat = src('components/councils/SpeakerSeat.tsx');
  const hook = src('hooks/useCouncilAudio.ts');
  const room = src('app/councils/[id].tsx');

  it('renders an animated mic badge only while an unmuted speaker talks', () => {
    expect(seat).toContain('const active = Boolean(speaker && speaking && !speaker.micMuted && !speaker.mutedByModerator);');
    expect(seat).toMatch(/\{active \? \(\s*<Animated\.View[\s\S]*?testID="council-speaking-mic"/);
    expect(seat).toContain('<AppIcon name="mic" size={11} color={colors.onElectric} />');
    expect(seat).toContain('backgroundColor: colors.electric');
    // muted state keeps the existing mic-off badge
    expect(seat).toContain('name="mic-off"');
    expect(seat).toContain('const AVATAR = 64;');
  });

  it('pulses with RN Animated on the native driver and stops when idle/unmounted', () => {
    expect(seat).toContain('Animated.loop(');
    expect(seat).toContain('return () => loop.stop();');
    expect(seat).toContain('pulse.stopAnimation();');
    expect(seat).not.toMatch(/useNativeDriver: false/);
    expect(seat).not.toMatch(/react-native-reanimated|LinearGradient|#[0-9A-Fa-f]{6}\b/);
  });

  it('wires Agora volume indication through the shared tracker', () => {
    expect(hook).toContain('enableAudioVolumeIndication(COUNCIL_VOLUME_INTERVAL_MS, 3, true)');
    expect(hook).toContain('updateSpeaking(lastLoud.current, speakers, Date.now(), mutedRef.current)');
    expect(hook).toContain('clearDecay();');
    // computed in the global session provider (room + mini player read it from there)
    expect(src('contexts/CouncilSessionContext.tsx')).toContain('speakingUserIdsFor(audio.speakingUids, stageSpeakers, state.me)');
    expect(room).toContain('speakingUserIds={session.speakingUserIds}');
  });
});

describe('Councils: my seat reflects my mic state', () => {
  const speakers = [
    { userId: 'me', agoraUid: 1, micMuted: true, mutedByModerator: false },
    { userId: 'a', agoraUid: 2, micMuted: true, mutedByModerator: false },
  ];

  it('overrides only my own seat with my local mic state', () => {
    const out = withMyMicState(speakers, { userId: 'me', onStage: true, micMuted: false, mutedByModerator: false });
    expect(out.find((s) => s.userId === 'me')?.micMuted).toBe(false);
    expect(out.find((s) => s.userId === 'a')?.micMuted).toBe(true);
    expect(speakers[0].micMuted).toBe(true); // no mutation
  });

  it('keeps the same array when nothing differs (stable memo)', () => {
    expect(withMyMicState(speakers, { userId: 'me', onStage: true, micMuted: true, mutedByModerator: false })).toBe(
      speakers,
    );
  });

  it('moderator mute on me still shows on my seat', () => {
    const out = withMyMicState(speakers, { userId: 'me', onStage: true, micMuted: true, mutedByModerator: true });
    expect(out[0].mutedByModerator).toBe(true);
  });

  it('the room renders the stage from the merged list and reverts a failed unmute', () => {
    const room = src('app/councils/[id].tsx');
    const provider = src('contexts/CouncilSessionContext.tsx');
    expect(provider).toContain('withMyMicState(state.speakers, state.me)');
    // The grid is built from the merged stage list (+ listeners) in the provider.
    expect(provider).toContain('councilParticipants(stageSpeakers, listeners)');
    expect(room).toContain('participants={session.participants}');
    expect(room).not.toContain('speakers={state.speakers}');
    expect(provider).toContain('if (!nextMuted) setState((prev) => (prev ? { ...prev, me: { ...prev.me, micMuted: true } } : prev));');
  });
});

describe('Dev socket follows the API production fallback', () => {
  afterEach(() => resetApiFallbackState());

  it('switches a local http socket URL once the API fell back', () => {
    expect(resolveSocketBase('http://127.0.0.1:3002')).toBe('http://127.0.0.1:3002');
    setApiRebase('http://127.0.0.1:3001', 'https://sarhsa.online');
    expect(resolveSocketBase('http://127.0.0.1:3002')).toBe('https://sarhsa.online');
    expect(resolveSocketBase('https://other.example')).toBe('https://other.example');
  });

  it('is wired into connectSocket URL resolution', () => {
    const sock = src('lib/socket.ts');
    expect(sock).toContain('resolveSocketBase(resolveDevServiceUrl(process.env.EXPO_PUBLIC_SOCKET_URL, 3002))');
    expect(sock).toContain('__DEV__ ? resolveSocketBase(fromEnv) : fromEnv');
  });
});
