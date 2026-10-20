import {
  CouncilApiError,
  councilCameraMenu,
  councilCameraOptions,
  councilErrorMessage,
  councilGalleryLabel,
  councilNeedsCode,
  isValidCouncilJoinCode,
  normalizeCouncilJoinCode,
  type CouncilMe,
  type CouncilVideoProfile,
} from '@/services/councils';

const perms = (isOwner: boolean) =>
  ({ isOwner, isModerator: false }) as unknown as CouncilMe['permissions'];
const host = { userId: 'host', permissions: perms(true) };
const mod = { userId: 'mod', permissions: perms(false) };

describe('private council join code (client helpers)', () => {
  it('normalizes case, spaces and dashes before sending', () => {
    expect(normalizeCouncilJoinCode(' ab-12 cd ')).toBe('AB12CD');
  });

  it('validates 4-16 letters/digits only', () => {
    expect(isValidCouncilJoinCode('ab12')).toBe(true);
    expect(isValidCouncilJoinCode('abc')).toBe(false);
    expect(isValidCouncilJoinCode('a'.repeat(17))).toBe(false);
    expect(isValidCouncilJoinCode('ab 12!')).toBe(false);
    expect(isValidCouncilJoinCode('ab12 cd34')).toBe(true);
  });

  it('a locked state needs the code, a normal state does not', () => {
    expect(councilNeedsCode({ locked: true })).toBe(true);
    expect(councilNeedsCode({})).toBe(false);
    expect(councilNeedsCode(null)).toBe(false);
  });

  it('maps the server code errors to Arabic messages', () => {
    const e = (code: string) => new CouncilApiError('raw', 403, code);
    expect(councilErrorMessage(e('council_code_invalid'))).toBe('رمز الدخول غير صحيح');
    expect(councilErrorMessage(e('council_code_required'))).toContain('أدخل رمز الدخول');
    expect(councilErrorMessage(e('council_code_locked'))).toContain('محاولات كثيرة');
    expect(councilErrorMessage(e('code_request_rate_limited'))).toContain('انتظر');
    expect(councilErrorMessage(e('seller_not_verified'))).toContain('الموثّقين');
  });
});

describe('golden council camera menu (host approves speakers)', () => {
  const golden = { golden: true };
  const speaker = { userId: 's1', role: 'SPEAKER' as const, onStage: true };

  it('offers allow / revoke only to the host, in golden councils, for speakers on stage', () => {
    expect(councilCameraMenu(host, golden, speaker).map((i) => i.key)).toEqual(['allow_camera']);
    expect(councilCameraMenu(host, golden, { ...speaker, cameraAllowed: true }).map((i) => i.key)).toEqual([
      'revoke_camera',
    ]);
    expect(councilCameraMenu(host, { golden: false }, speaker)).toEqual([]);
    expect(councilCameraMenu(mod, golden, speaker)).toEqual([]);
    expect(councilCameraMenu(host, golden, { ...speaker, onStage: false })).toEqual([]);
    expect(councilCameraMenu(host, golden, { ...speaker, userId: 'host', role: 'OWNER' })).toEqual([]);
  });
});

describe('council camera options (bandwidth cap)', () => {
  const profile = (over: Partial<CouncilVideoProfile> = {}): CouncilVideoProfile => ({
    maxHeight: 540,
    maxWidth: 960,
    maxFps: 24,
    maxBitrateKbps: 900,
    simulcast: true,
    ...over,
  });

  it('captures at the capped size with simulcast and a cheaper lower layer', () => {
    const o = councilCameraOptions(profile());
    expect(o.resolution).toEqual({ width: 960, height: 540, frameRate: 24 });
    expect(o.publish.simulcast).toBe(true);
    expect(o.publish.videoEncoding.maxBitrate).toBe(900_000);
    const low = o.publish.videoSimulcastLayers[0];
    expect(low.height).toBeLessThan(540);
    expect(low.encoding.maxBitrate).toBeLessThan(900_000);
  });

  it('never exceeds 720p / 30fps even if the profile asks for more', () => {
    const o = councilCameraOptions(profile({ maxHeight: 1080, maxFps: 60, maxBitrateKbps: 8000 }));
    expect(o.resolution.height).toBe(720);
    expect(o.resolution.width).toBe(1280);
    expect(o.resolution.frameRate).toBe(30);
  });

  it('floors absurdly small values', () => {
    const o = councilCameraOptions(profile({ maxHeight: 10, maxFps: 1, maxBitrateKbps: 1 }));
    expect(o.resolution.height).toBe(180);
    expect(o.resolution.frameRate).toBe(10);
    expect(o.publish.videoEncoding.maxBitrate).toBe(150_000);
  });
});

describe('stage gallery label', () => {
  it('shows position only for real galleries', () => {
    expect(councilGalleryLabel({ gallery: { count: 5, index: 1 } })).toBe('2 / 5');
    expect(councilGalleryLabel({ gallery: { count: 1, index: 0 } })).toBeNull();
    expect(councilGalleryLabel({ gallery: null })).toBeNull();
    expect(councilGalleryLabel(null)).toBeNull();
  });
});
