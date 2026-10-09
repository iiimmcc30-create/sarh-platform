import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import {
  COUNCIL_MAX_SPEAKERS,
  CouncilApiError,
  councilErrorMessage,
  councilInviteUrl,
  councilListenersLabel,
  councilMemberMenu,
  councilSeatRows,
  isValidCouncilName,
  normalizeCouncilRules,
  type CouncilPermissions,
  type CouncilSpeaker,
} from '@/services/councils';
import {
  claimRtcEngine,
  getRtcEngineOwner,
  isEngineBusyElsewhere,
  releaseRtcEngine,
} from '@/lib/rtcEngineGuard';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function walk(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    return statSync(path.join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

const COUNCIL_FILES = [
  ...walk('app/councils'),
  ...walk('components/councils'),
  'hooks/useCouncilAudio.ts',
  'hooks/useCouncilSocket.ts',
  'services/councils.ts',
  'lib/councilsAgora.ts',
  'lib/rtcEngineGuard.ts',
];

const perms = (over: Partial<CouncilPermissions> = {}): CouncilPermissions => ({
  isOwner: false,
  isModerator: false,
  canManageRequests: false,
  canMute: false,
  canRemove: false,
  canBan: false,
  canInvite: false,
  canManageModerators: false,
  canEdit: false,
  canEnd: false,
  ...over,
});

const OWNER = perms({
  isOwner: true,
  canManageRequests: true,
  canMute: true,
  canRemove: true,
  canBan: true,
  canInvite: true,
  canManageModerators: true,
  canEdit: true,
  canEnd: true,
});

function speaker(seatIndex: number, over: Partial<CouncilSpeaker> = {}): CouncilSpeaker {
  return {
    userId: `u${seatIndex}`,
    seatIndex,
    role: 'SPEAKER',
    micMuted: true,
    mutedByModerator: false,
    online: true,
    agoraUid: 100 + seatIndex,
    user: {
      id: `u${seatIndex}`,
      username: `user${seatIndex}`,
      displayName: `User ${seatIndex}`,
      arabicName: '',
      verified: false,
    },
    ...over,
  };
}

describe('Councils: pure helpers', () => {
  it('lays out a fixed 4 × 3 grid with seats in place', () => {
    const rows = councilSeatRows([speaker(0, { role: 'OWNER' }), speaker(5), speaker(11), speaker(12)]);
    expect(COUNCIL_MAX_SPEAKERS).toBe(12);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === 4)).toBe(true);
    expect(rows[0][0]?.userId).toBe('u0');
    expect(rows[1][1]?.userId).toBe('u5');
    expect(rows[2][3]?.userId).toBe('u11');
    expect(rows.flat().filter(Boolean)).toHaveLength(3); // seat 12 ignored
  });

  it('validates names, normalizes rules, builds labels and invite links', () => {
    expect(isValidCouncilName(' a ')).toBe(false);
    expect(isValidCouncilName('مجلس')).toBe(true);
    expect(isValidCouncilName('x'.repeat(61))).toBe(false);
    expect(normalizeCouncilRules(['  ', ' الاحترام ', ...Array(12).fill('قاعدة')])).toHaveLength(10);
    expect(normalizeCouncilRules([' الاحترام '])[0]).toBe('الاحترام');
    expect(councilListenersLabel(1250)).toBe('1,250 مستمع');
    expect(councilInviteUrl('AbC123xyz')).toBe('https://sarhsa.online/councils/join/AbC123xyz');
  });

  it('maps API error codes to calm Arabic messages', () => {
    expect(councilErrorMessage(new CouncilApiError('x', 409, 'council_full'))).toContain('اكتمل');
    expect(councilErrorMessage(new CouncilApiError('x', 410, 'council_ended'))).toBe('انتهى المجلس');
    expect(councilErrorMessage(new CouncilApiError('رسالة', 400, 'other'))).toBe('رسالة');
  });

  it('member menu mirrors the server permission matrix', () => {
    const me = { userId: 'me', permissions: OWNER };
    const keys = (target: Parameters<typeof councilMemberMenu>[1], full = false, m = me) =>
      councilMemberMenu(m, target, full).map((i) => i.key);

    // Owner on a speaker.
    expect(keys({ userId: 'u1', role: 'SPEAKER', mutedByModerator: false, onStage: true })).toEqual([
      'mute',
      'demote',
      'make_moderator',
      'kick',
      'ban',
    ]);
    // Owner on a listener when the stage is full → no promote.
    expect(keys({ userId: 'u2', role: 'LISTENER', mutedByModerator: false, onStage: false }, true)).not.toContain(
      'promote',
    );
    // Nobody manages the owner or themselves.
    expect(keys({ userId: 'o', role: 'OWNER', mutedByModerator: false, onStage: true })).toEqual([]);
    expect(keys({ userId: 'me', role: 'SPEAKER', mutedByModerator: false, onStage: true })).toEqual([]);
    // Moderator with default flags cannot touch another moderator and cannot ban.
    const mod = {
      userId: 'mod',
      permissions: perms({ isModerator: true, canManageRequests: true, canMute: true, canRemove: true }),
    };
    expect(keys({ userId: 'm2', role: 'MODERATOR', mutedByModerator: false, onStage: true }, false, mod)).toEqual([]);
    expect(keys({ userId: 'u3', role: 'SPEAKER', mutedByModerator: true, onStage: true }, false, mod)).toEqual([
      'unmute',
      'demote',
      'kick',
    ]);
    // Plain listener sees nothing.
    const listener = { userId: 'l', permissions: perms() };
    expect(keys({ userId: 'u4', role: 'SPEAKER', mutedByModerator: false, onStage: true }, false, listener)).toEqual(
      [],
    );
  });
});

describe('Councils: RTC engine guard', () => {
  afterEach(() => {
    const o = getRtcEngineOwner();
    if (o) releaseRtcEngine(o.kind, o.id);
  });

  it('one council at a time; never while live holds the engine', () => {
    expect(isEngineBusyElsewhere(3)).toBe(true); // connected by live
    expect(isEngineBusyElsewhere(1)).toBe(false); // disconnected
    expect(isEngineBusyElsewhere(5)).toBe(false); // failed
    expect(isEngineBusyElsewhere(-7)).toBe(false); // not initialized
    expect(claimRtcEngine('council', 'a')).toBe(true);
    expect(claimRtcEngine('council', 'a')).toBe(true);
    expect(claimRtcEngine('council', 'b')).toBe(false);
    expect(isEngineBusyElsewhere(3)).toBe(false); // it's ours
    releaseRtcEngine('council', 'a');
    expect(claimRtcEngine('council', 'b')).toBe(true);
  });
});

describe('Councils: gating, wiring and design constraints', () => {
  it('uses its own flag; live gating is untouched', () => {
    const lib = src('lib/councilsAgora.ts');
    // Default-on: dev-client bundles from the local Metro scripts don't get eas.json env.
    expect(lib).toContain("process.env.EXPO_PUBLIC_COUNCILS_ENABLED !== 'false'");
    expect(lib).not.toContain("process.env.EXPO_PUBLIC_COUNCILS_ENABLED === 'true'");
    expect(lib).not.toContain('process.env.EXPO_PUBLIC_AGORA_ENABLED');
    expect(src('lib/councilsAgora.web.ts')).toContain('return null');
    expect(src('lib/agora.ts')).toContain("process.env.EXPO_PUBLIC_AGORA_ENABLED !== 'true'");
    expect(src('hooks/useLiveStream.ts')).not.toContain('council');
    expect(src('hooks/useLiveStream.ts')).toContain("from '@/lib/agora'");
  });

  it('enables the councils flag in every EAS profile without touching the live flag', () => {
    const eas = JSON.parse(src('eas.json'));
    for (const profile of ['development', 'preview', 'production']) {
      expect(eas.build[profile].env.EXPO_PUBLIC_COUNCILS_ENABLED).toBe('true');
      expect(eas.build[profile].env.EXPO_PUBLIC_AGORA_ENABLED).toBeUndefined();
    }
  });

  it('sidebar entry sits directly above العلامات المرجعية (Home quick access removed)', () => {
    const panel = src('components/feature/AppSidebar.tsx');
    const row = "{ key: 'councils', icon: 'mic', label: 'المجالس', route: '/councils' },";
    expect(panel).toContain(row);
    const nextRow = panel.indexOf('{', panel.indexOf('\n', panel.indexOf(row)) + 1);
    expect(panel.indexOf("{ key: 'bookmarks'")).toBe(nextRow);
    expect(panel.indexOf("key: 'collections'")).toBeGreaterThan(panel.indexOf("key: 'bookmarks'"));
    expect(src('app/(tabs)/index.tsx')).not.toContain('HomeQuickAccess');
    const layout = src('app/_layout.tsx');
    for (const name of ['councils/index', 'councils/create', 'councils/[id]', 'councils/join/[code]']) {
      expect(layout).toContain(`<Stack.Screen name="${name}" />`);
    }
  });

  it('mic-only permission helper keeps ensureLivePermissions as-is', () => {
    const perms = src('lib/livePermissions.ts');
    expect(perms).toContain('export async function ensureMicPermission');
    expect(perms).toContain('export async function ensureLivePermissions');
    expect(src('hooks/useCouncilAudio.ts')).not.toContain('ensureLivePermissions');
  });

  it('audio is role-based and never publishes video', () => {
    const hook = src('hooks/useCouncilAudio.ts');
    expect(hook).toContain('disableVideo()');
    expect(hook).toContain('publishCameraTrack: false');
    expect(hook).toContain('autoSubscribeVideo: false');
    expect(hook).not.toContain('enableVideo');
    expect(hook).toContain('renewToken');
    expect(hook).toContain('claimRtcEngine');
  });

  it('web shows the "available in the app" placeholder on every council route', () => {
    for (const f of walk('app/councils')) {
      expect(src(f)).toContain('COUNCIL_WEB_TEXT');
    }
  });

  it('council invites open the room from the system notification', () => {
    expect(src('lib/notifications.ts')).toContain("stringField(data, 'kind') === 'council_invite'");
  });

  it('stays calm: RN Animated only, no reanimated/gradients/new gesture libs, theme tokens', () => {
    for (const f of COUNCIL_FILES) {
      const code = src(f);
      expect(code).not.toMatch(/react-native-reanimated|LinearGradient|expo-linear-gradient|react-native-gesture-handler|pager-view/);
      expect(code).not.toMatch(/shadow(Color|Opacity|Radius|Offset)|elevation:/);
      expect(code).not.toMatch(/#[0-9A-Fa-f]{6}\b/); // colors come from the theme
    }
  });
});
