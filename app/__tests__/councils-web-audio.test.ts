/** @jest-environment node */
import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

type WebAgora = typeof import('@/lib/councilsAgora.web');
function loadWebAgora(env: { councils?: string; provider?: string }): WebAgora {
  const prev = { c: process.env.EXPO_PUBLIC_COUNCILS_ENABLED, p: process.env.EXPO_PUBLIC_RTC_PROVIDER };
  if (env.councils === undefined) delete process.env.EXPO_PUBLIC_COUNCILS_ENABLED;
  else process.env.EXPO_PUBLIC_COUNCILS_ENABLED = env.councils;
  if (env.provider === undefined) delete process.env.EXPO_PUBLIC_RTC_PROVIDER;
  else process.env.EXPO_PUBLIC_RTC_PROVIDER = env.provider;
  let mod!: WebAgora;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/lib/councilsAgora.web') as WebAgora;
  });
  // functions read env at call time; keep env set for the assertions, restore after
  afterRestore.push(() => {
    if (prev.c === undefined) delete process.env.EXPO_PUBLIC_COUNCILS_ENABLED;
    else process.env.EXPO_PUBLIC_COUNCILS_ENABLED = prev.c;
    if (prev.p === undefined) delete process.env.EXPO_PUBLIC_RTC_PROVIDER;
    else process.env.EXPO_PUBLIC_RTC_PROVIDER = prev.p;
  });
  return mod;
}
const afterRestore: (() => void)[] = [];
afterEach(() => afterRestore.splice(0).forEach((f) => f()));

describe('councilsAgora.web — flags mirror native', () => {
  it('enabled + audio available by default (LiveKit)', () => {
    const m = loadWebAgora({});
    expect(m.isCouncilsFeatureEnabled()).toBe(true);
    expect(m.isCouncilAudioAvailable()).toBe(true);
    expect(m.isCouncilsWebBlocked()).toBe(false);
    expect(m.councilsWebBlockedReason()).toBeNull();
    expect(m.getCouncilAgoraModule()).toBeNull();
  });
  it('EXPO_PUBLIC_COUNCILS_ENABLED=false disables', () => {
    const m = loadWebAgora({ councils: 'false' });
    expect(m.isCouncilsFeatureEnabled()).toBe(false);
    expect(m.isCouncilAudioAvailable()).toBe(false);
    expect(m.councilsWebBlockedReason()).toBe('disabled');
  });
  it('Agora provider on web: no audio, blocked with agora reason', () => {
    const m = loadWebAgora({ provider: 'agora' });
    expect(m.isCouncilsFeatureEnabled()).toBe(true);
    expect(m.isCouncilAudioAvailable()).toBe(false);
    expect(m.isCouncilsWebBlocked()).toBe(true);
    expect(m.councilsWebBlockedReason()).toBe('agora');
    expect(m.getCouncilAgoraModule()).toBeNull();
  });
});

describe('native councilsAgora never blocks routes', () => {
  it('isCouncilsWebBlocked is false on native', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('@/lib/councilsAgora') as typeof import('@/lib/councilsAgora');
    expect(m.isCouncilsWebBlocked()).toBe(false);
    expect(m.councilsWebBlockedReason()).toBeNull();
  });
});

describe('useCouncilAudio web audio attach helpers', () => {
  type Hook = typeof import('@/hooks/useCouncilAudio');
  function loadHook(os: string): Hook {
    let mod!: Hook;
    jest.isolateModules(() => {
      jest.doMock('react-native', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const base = jest.requireActual('./mocks/react-native');
        return { ...base, Platform: { ...(base.Platform ?? {}), OS: os, select: (o: Record<string, unknown>) => o[os] ?? o.default } };
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('@/hooks/useCouncilAudio') as Hook;
    });
    return mod;
  }

  function fakeDom() {
    const body: unknown[] = [];
    const g = globalThis as unknown as { document?: unknown };
    const prev = g.document;
    g.document = { body: { appendChild: (el: unknown) => body.push(el) } };
    afterRestore.push(() => {
      g.document = prev;
    });
    return body;
  }
  function fakeEl(body: unknown[]) {
    const el = {
      style: {} as Record<string, string>,
      attrs: {} as Record<string, string>,
      removed: false,
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      remove() {
        this.removed = true;
        const i = body.indexOf(this);
        if (i >= 0) body.splice(i, 1);
      },
    };
    return el;
  }
  function fakeTrack(kind: string, sid: string, body: unknown[]) {
    const el = fakeEl(body);
    return {
      el,
      track: {
        kind,
        sid,
        attach: jest.fn(() => el),
        detach: jest.fn(() => [el]),
      },
    };
  }

  it('web: audio track attached hidden to document.body and removed on unsubscribe', () => {
    const body = fakeDom();
    const h = loadHook('web');
    const els = new Map<string, HTMLMediaElement>();
    const { track, el } = fakeTrack('audio', 'TR_1', body);
    h.attachWebAudioTrack(track as never, els);
    h.attachWebAudioTrack(track as never, els); // idempotent
    expect(track.attach).toHaveBeenCalledTimes(1);
    expect(body).toEqual([el]);
    expect(el.style.display).toBe('none');
    expect(els.size).toBe(1);
    h.detachWebAudioTrack(track as never, els);
    expect(body).toEqual([]);
    expect(els.size).toBe(0);
  });

  it('web: video tracks are ignored; detachAll clears everything (disconnect/leave)', () => {
    const body = fakeDom();
    const h = loadHook('web');
    const els = new Map<string, HTMLMediaElement>();
    const v = fakeTrack('video', 'TR_V', body);
    h.attachWebAudioTrack(v.track as never, els);
    expect(v.track.attach).not.toHaveBeenCalled();
    const a1 = fakeTrack('audio', 'A1', body);
    const a2 = fakeTrack('audio', 'A2', body);
    h.attachWebAudioTrack(a1.track as never, els);
    h.attachWebAudioTrack(a2.track as never, els);
    expect(body.length).toBe(2);
    h.detachAllWebAudio(els);
    expect(body.length).toBe(0);
    expect(els.size).toBe(0);
  });

  it('native: attach is a no-op (behavior unchanged)', () => {
    const body = fakeDom();
    const h = loadHook('android');
    const els = new Map<string, HTMLMediaElement>();
    const a = fakeTrack('audio', 'A1', body);
    h.attachWebAudioTrack(a.track as never, els);
    expect(a.track.attach).not.toHaveBeenCalled();
    expect(body.length).toBe(0);
  });
});

describe('wiring (source checks)', () => {
  const hook = src('hooks/useCouncilAudio.ts');
  const room = src('app/councils/[id].tsx');
  it('hook listens for playback status and exposes startAudioPlayback', () => {
    expect(hook).toContain('RoomEvent.AudioPlaybackStatusChanged');
    expect(hook).toContain('room.canPlaybackAudio');
    expect(hook).toContain('canPlaybackAudio,');
    expect(hook).toContain('startAudioPlayback,');
    expect(hook).toContain('detachAllWebAudio(webAudioEls.current)');
  });
  it('room screen: no hard web bail-out, tap-to-play button, Agora web message', () => {
    expect(room).not.toContain("if (Platform.OS === 'web') {");
    expect(room).not.toContain("Platform.OS === 'web' || !id");
    expect(room).toContain('isCouncilsWebBlocked()');
    expect(room).toContain('audio.startAudioPlayback()');
    expect(room).toContain('COUNCIL_TAP_TO_PLAY_TEXT');
    expect(room).toContain('COUNCIL_WEB_AGORA_TEXT');
    expect(src('services/councils.ts')).toContain("'اضغط لتشغيل الصوت'");
  });
});
