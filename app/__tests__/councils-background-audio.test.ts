import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  __setCouncilAudioNativeForTests,
  applyBackgroundAudio,
  backgroundAudioKey,
  councilNotificationText,
  councilRoomUrl,
  COUNCIL_NOTIFICATION_LISTENING,
  COUNCIL_NOTIFICATION_MIC_CLOSED,
  COUNCIL_NOTIFICATION_MIC_OPEN,
  getCouncilAudioNative,
  micCaptureAllowedInBackground,
  planBackgroundAudio,
  shouldAutoMuteOnBackground,
  shouldLeaveFromNative,
  subscribeCouncilAudio,
  type BackgroundAudioInput,
  type CouncilAudioNative,
} from '@/lib/councilBackgroundAudio';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

type Listener = (e: Record<string, unknown>) => void;

function fakeNative(opts: { micAllowed?: boolean; throws?: boolean } = {}) {
  const calls: { sync: unknown[][]; stop: number } = { sync: [], stop: 0 };
  const listeners: Record<string, Listener[]> = {};
  const native: CouncilAudioNative = {
    sync: (...args) => {
      if (opts.throws) throw new Error('boom');
      calls.sync.push(args);
      return true;
    },
    stop: () => {
      if (opts.throws) throw new Error('boom');
      calls.stop += 1;
    },
    isMicCaptureAllowed: () => {
      if (opts.throws) throw new Error('boom');
      return Boolean(opts.micAllowed);
    },
    addListener: ((event: string, fn: Listener) => {
      (listeners[event] ??= []).push(fn);
      return { remove: () => (listeners[event] = listeners[event].filter((f) => f !== fn)) };
    }) as CouncilAudioNative['addListener'],
  };
  const emit = (event: string, payload: Record<string, unknown>) => (listeners[event] ?? []).forEach((f) => f(payload));
  return { native, calls, emit, listeners };
}

const live: BackgroundAudioInput = {
  councilId: 'c1',
  joined: true,
  blocked: null,
  audioStatus: 'connected',
  title: 'مجلس الأدب',
  onStage: false,
  micMuted: true,
};

/** Mimics the provider: one key ref, plan → apply on every state change. */
function session(native: CouncilAudioNative | null) {
  let key = '';
  return {
    apply: (input: BackgroundAudioInput, force = false) => {
      key = applyBackgroundAudio(native, planBackgroundAudio(input), key, force);
      return key;
    },
  };
}

describe('Council background audio — lifecycle', () => {
  afterEach(() => __setCouncilAudioNativeForTests(undefined));

  it('starts the service once the council audio connects (listener → mediaPlayback only)', () => {
    const { native, calls } = fakeNative();
    const s = session(native);
    s.apply({ ...live, audioStatus: 'idle', joined: false });
    expect(calls.sync).toHaveLength(0);
    s.apply(live);
    expect(calls.sync).toEqual([['c1', 'مجلس الأدب', COUNCIL_NOTIFICATION_LISTENING, false, 'sarh://councils/c1']]);
    s.apply(live); // same state → no duplicate native call
    expect(calls.sync).toHaveLength(1);
  });

  it('runs while connecting/reconnecting, not when audio failed/busy/unavailable', () => {
    expect(planBackgroundAudio({ ...live, audioStatus: 'connecting' }).kind).toBe('run');
    expect(planBackgroundAudio({ ...live, audioStatus: 'reconnecting' }).kind).toBe('run');
    for (const st of ['idle', 'failed', 'busy', 'unavailable'] as const) {
      expect(planBackgroundAudio({ ...live, audioStatus: st }).kind).toBe('stop');
    }
  });

  it('switches the service type when going on/off stage and follows the mic state', () => {
    const { native, calls } = fakeNative();
    const s = session(native);
    s.apply(live);
    s.apply({ ...live, onStage: true, micMuted: true });
    s.apply({ ...live, onStage: true, micMuted: false });
    s.apply(live);
    expect(calls.sync.map((c) => [c[2], c[3]])).toEqual([
      [COUNCIL_NOTIFICATION_LISTENING, false],
      [COUNCIL_NOTIFICATION_MIC_CLOSED, true],
      [COUNCIL_NOTIFICATION_MIC_OPEN, true],
      [COUNCIL_NOTIFICATION_LISTENING, false],
    ]);
  });

  it('force re-applies on resume (Android upgrades to the microphone type in the foreground)', () => {
    const { native, calls } = fakeNative();
    const s = session(native);
    s.apply({ ...live, onStage: true });
    s.apply({ ...live, onStage: true }, true);
    expect(calls.sync).toHaveLength(2);
  });

  it.each([
    ['explicit leave', { councilId: null, joined: false }],
    ['council ended', { blocked: 'ended' as const }],
    ['kicked', { blocked: 'kicked' as const }],
    ['banned', { blocked: 'banned' as const }],
    ['logout reset', { councilId: null, joined: false, audioStatus: 'idle' as const }],
  ])('stops the service on %s', (_label, patch) => {
    const { native, calls } = fakeNative();
    const s = session(native);
    s.apply(live);
    s.apply({ ...live, ...patch });
    expect(calls.stop).toBe(1);
    s.apply({ ...live, ...patch }); // already stopped → no repeat
    expect(calls.stop).toBe(1);
  });

  it('first run with no council clears a service left over from a JS reload', () => {
    const { native, calls } = fakeNative();
    const s = session(native);
    s.apply({ ...live, councilId: null, joined: false });
    expect(calls.stop).toBe(1);
    s.apply({ ...live, councilId: null, joined: false });
    expect(calls.stop).toBe(1);
  });

  it('notification «مغادرة» runs the same leave flow (only for the current council)', () => {
    const { native, emit, listeners } = fakeNative();
    let current: string | null = 'c1';
    const leave = jest.fn(() => {
      current = null;
    });
    const unsubscribe = subscribeCouncilAudio(native, {
      onLeave: (e) => {
        if (shouldLeaveFromNative(e, current)) leave();
      },
    });
    emit('onLeave', { councilId: 'other', reason: 'notification' });
    expect(leave).not.toHaveBeenCalled();
    emit('onLeave', { councilId: 'c1', reason: 'notification' });
    expect(leave).toHaveBeenCalledTimes(1);
    emit('onLeave', { councilId: 'c1', reason: 'task_removed' }); // already left
    expect(leave).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(listeners.onLeave).toHaveLength(0);
    expect(shouldLeaveFromNative({}, 'c1')).toBe(true);
    expect(shouldLeaveFromNative(null, null)).toBe(false);
  });

  it('interruption events reach JS (iOS call/Siri ended → resume)', () => {
    const { native, emit } = fakeNative();
    const recover = jest.fn();
    subscribeCouncilAudio(native, { onInterruption: (e) => e.phase === 'ended' && recover() });
    emit('onInterruption', { phase: 'began' });
    emit('onInterruption', { phase: 'ended' });
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('missing native module (older builds): every call no-ops, v1 auto-mute stays', () => {
    __setCouncilAudioNativeForTests(null);
    expect(getCouncilAudioNative()).toBeNull();
    const s = session(null);
    expect(() => s.apply(live)).not.toThrow();
    expect(() => s.apply({ ...live, councilId: null })).not.toThrow();
    expect(micCaptureAllowedInBackground(null)).toBe(false);
    expect(shouldAutoMuteOnBackground({ onStage: true, micMuted: false, micCaptureAllowed: false })).toBe(true);
    const off = subscribeCouncilAudio(null, { onLeave: () => undefined });
    expect(() => off()).not.toThrow();
  });

  it('a native module without addListener or one that throws never crashes JS', () => {
    const { native } = fakeNative({ throws: true });
    const s = session(native);
    expect(() => s.apply(live)).not.toThrow();
    expect(() => s.apply({ ...live, blocked: 'ended' })).not.toThrow();
    expect(micCaptureAllowedInBackground(native)).toBe(false);
    const noEvents = { ...native, addListener: undefined };
    expect(() => subscribeCouncilAudio(noEvents, { onLeave: () => undefined })()).not.toThrow();
  });

  it('real lookup without the native module returns null instead of throwing', () => {
    __setCouncilAudioNativeForTests(undefined);
    expect(() => getCouncilAudioNative()).not.toThrow();
  });

  it('keeps the mic in the background only when the service holds the microphone type', () => {
    expect(micCaptureAllowedInBackground(fakeNative({ micAllowed: true }).native)).toBe(true);
    expect(shouldAutoMuteOnBackground({ onStage: true, micMuted: false, micCaptureAllowed: true })).toBe(false);
    expect(shouldAutoMuteOnBackground({ onStage: false, micMuted: false, micCaptureAllowed: false })).toBe(false);
    expect(shouldAutoMuteOnBackground({ onStage: true, micMuted: true, micCaptureAllowed: false })).toBe(false);
  });

  it('notification copy and deep link', () => {
    expect(councilNotificationText(false, true)).toBe('تستمع إلى المجلس الآن');
    expect(councilNotificationText(true, false)).toBe('أنت على المنصة · الميكروفون مفتوح');
    expect(councilNotificationText(true, true)).toBe('أنت على المنصة · الميكروفون مغلق');
    expect(councilRoomUrl('a b')).toBe('sarh://councils/a%20b');
    expect(planBackgroundAudio({ ...live, title: '  ' })).toMatchObject({ title: 'مجلس صوتي' });
    expect(backgroundAudioKey({ kind: 'stop' })).toBe('stop');
  });
});

describe('Council background audio — native wiring', () => {
  const mod = 'modules/council-audio';

  it('local Expo module is autolinked on both platforms', () => {
    const cfg = JSON.parse(src(`${mod}/expo-module.config.json`));
    expect(cfg.platforms).toEqual(expect.arrayContaining(['apple', 'android']));
    expect(cfg.android.modules).toEqual(['expo.modules.councilaudio.CouncilAudioModule']);
    expect(cfg.apple.modules).toEqual(['CouncilAudioModule']);
    expect(src(`${mod}/android/build.gradle`)).toContain("id 'expo-module-gradle-plugin'");
    expect(src(`${mod}/ios/CouncilAudio.podspec`)).toContain("s.dependency 'ExpoModulesCore'");
  });

  it('Android manifest (merged into the committed android/ build and any prebuild) declares the service', () => {
    const manifest = src(`${mod}/android/src/main/AndroidManifest.xml`);
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE"');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_MICROPHONE');
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(manifest).toContain('android:foregroundServiceType="mediaPlayback|microphone"');
    expect(manifest).toContain('android:exported="false"');
    expect(src('android/app/src/main/AndroidManifest.xml')).toContain('android.permission.RECORD_AUDIO');
  });

  it('service: microphone type only on stage, Arabic notification with «مغادرة», leaves on task removal', () => {
    const svc = src(`${mod}/android/src/main/java/expo/modules/councilaudio/CouncilAudioService.kt`);
    expect(svc).toContain('val wantMic = s.onStage && hasMicPermission()');
    expect(svc).toContain('playback or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE');
    expect(svc).toContain('startForeground(NOTIFICATION_ID, notification, playback)');
    expect(svc).toContain('NotificationManager.IMPORTANCE_LOW');
    expect(svc).toContain('"مغادرة"');
    expect(svc).toContain('override fun onTaskRemoved');
    expect(svc).toContain('requestLeave("task_removed")');
    expect(svc).toContain('Intent.ACTION_VIEW, Uri.parse(s.url)');
    expect(svc).toContain('START_NOT_STICKY');
    const kt = src(`${mod}/android/src/main/java/expo/modules/councilaudio/CouncilAudioModule.kt`);
    expect(kt).toContain('Name("CouncilAudio")');
    expect(kt).toContain('Events("onLeave", "onInterruption")');
  });

  it('iOS: background audio mode + interruption recovery', () => {
    const app = JSON.parse(src('app.json'));
    expect(app.expo.ios.infoPlist.UIBackgroundModes).toContain('audio');
    // No committed ios/ → EAS prebuilds from app.json; if one is added it must keep the mode.
    if (existsSync(path.join(root, 'ios'))) {
      const plist = src('ios/Sarh/Info.plist');
      expect(plist).toMatch(/UIBackgroundModes[\s\S]*<string>audio<\/string>/);
    }
    const swift = src(`${mod}/ios/CouncilAudioModule.swift`);
    expect(swift).toContain('AVAudioSession.interruptionNotification');
    expect(swift).toContain('try? AVAudioSession.sharedInstance().setActive(true)');
    expect(swift).toContain('sendEvent("onInterruption", ["phase": "ended"])');
    const hook = src('hooks/useCouncilAudio.ts');
    expect(hook).toContain('audioScenario: agora.AudioScenarioType.AudioScenarioChatroom');
    expect(hook).toMatch(/const recover = useCallback\(\(\) => \{[\s\S]*engine\.enableAudio\(\);/);
  });

  it('provider drives the service and never stops audio on background', () => {
    const p = src('contexts/CouncilSessionContext.tsx');
    expect(p).toContain('getCouncilAudioNative()');
    expect(p).toContain('planBackgroundAudio({');
    expect(p).toContain('applyBackgroundAudio(bgNative, bgPlan, prev)');
    expect(p).toContain('applyBackgroundAudio(bgNative, bgPlanRef.current, bgKeyRef.current, true)');
    expect(p).toContain('if (shouldLeaveFromNative(e, idRef.current)) void leave();');
    expect(p).toContain('audioRef.current.recover()');
    expect(p).toContain('shouldAutoMuteOnBackground({');
    const bg = p.slice(p.indexOf("if (next === 'background')"), p.indexOf("} else if (next === 'active'"));
    expect(bg).not.toContain('.stop(');
    expect(bg).not.toContain('reset(');
    expect(bg).not.toContain('leave(');
  });

  it('room closes itself when the council is left from the notification', () => {
    const room = src('app/councils/[id].tsx');
    expect(room).toContain('wasJoinedRef.current && session.councilId === null');
    expect(room).toContain('if (focusedRef.current) goBack();');
  });
});
