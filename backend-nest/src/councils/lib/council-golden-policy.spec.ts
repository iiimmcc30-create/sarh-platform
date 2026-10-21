import {
  councilPublishFor,
  generateJoinCode,
  isVerifiedSeller,
  normalizeJoinCode,
  rtcRoleFor,
  COUNCIL_JOIN_CODE_RE,
} from './council-policy';
import { councilCodeMatches } from '../councils.service';
import { CouncilCodeLimiter } from './council-code-limiter';
import { getCouncilVideoProfile } from '../../shared/rtc/council-video';
import { randomBytes } from 'crypto';

const council = (golden: boolean) => ({ golden, ownerId: 'host' });
const speaker = (over: Record<string, unknown> = {}) => ({
  userId: 'sp',
  role: 'SPEAKER' as const,
  seatIndex: 3,
  mutedByModerator: false,
  cameraAllowed: false,
  ...over,
});
const owner = { userId: 'host', role: 'OWNER' as const, seatIndex: 0 };

describe('councilPublishFor (token / permission grants)', () => {
  it('non-golden councils are audio-only for everyone, even with cameraAllowed and verified', () => {
    expect(councilPublishFor(council(false), owner, true)).toBe('audio');
    expect(
      councilPublishFor(council(false), speaker({ cameraAllowed: true }), true),
    ).toBe('audio');
  });

  it('golden: verified owner gets camera + mic; unverified owner stays audio', () => {
    expect(councilPublishFor(council(true), owner, true)).toBe('av');
    expect(councilPublishFor(council(true), owner, false)).toBe('audio');
  });

  it('golden: every verified speaker on stage gets camera automatically (no manual grant)', () => {
    const g = council(true);
    expect(councilPublishFor(g, speaker(), true)).toBe('av');
    expect(councilPublishFor(g, speaker({ cameraAllowed: true }), true)).toBe(
      'av',
    );
  });

  it('golden: unverified speakers stay audio-only', () => {
    const g = council(true);
    expect(councilPublishFor(g, speaker(), false)).toBe('audio');
    expect(councilPublishFor(g, speaker({ cameraAllowed: true }), false)).toBe(
      'audio',
    );
  });

  it('non-golden: verified speakers on stage stay audio-only', () => {
    expect(councilPublishFor(council(false), speaker(), true)).toBe('audio');
  });

  it('listeners, banned and moderator-muted members never publish anything', () => {
    const g = council(true);
    expect(
      councilPublishFor(
        g,
        speaker({ seatIndex: null, role: 'LISTENER' }),
        true,
      ),
    ).toBe('none');
    expect(councilPublishFor(g, speaker({ role: 'BANNED' }), true)).toBe(
      'none',
    );
    expect(
      councilPublishFor(
        g,
        speaker({ mutedByModerator: true, cameraAllowed: true }),
        true,
      ),
    ).toBe('none');
    expect(councilPublishFor(g, null, true)).toBe('none');
    expect(rtcRoleFor(speaker())).toBe('publisher');
  });
});

describe('isVerifiedSeller', () => {
  it('requires the verification badge on an active account', () => {
    expect(isVerifiedSeller({ verified: true })).toBe(true);
    expect(isVerifiedSeller({ verified: true, isActive: true })).toBe(true);
    expect(isVerifiedSeller({ verified: false })).toBe(false);
    expect(isVerifiedSeller({ verified: null })).toBe(false);
    expect(isVerifiedSeller(null)).toBe(false);
    expect(isVerifiedSeller({ verified: true, isActive: false })).toBe(false);
    expect(isVerifiedSeller({ verified: true, deletedAt: new Date() })).toBe(
      false,
    );
  });
});

describe('join codes', () => {
  it('generated codes are 6 chars without look-alikes and pass the format check', () => {
    for (let i = 0; i < 50; i++) {
      const c = generateJoinCode(randomBytes);
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(COUNCIL_JOIN_CODE_RE.test(c)).toBe(true);
    }
  });

  it('matching is case-insensitive for the join code, exact for the link token', () => {
    const c = { joinCode: 'ABC234', inviteCode: 'aBcDeFgHiJkL' };
    expect(councilCodeMatches(c, 'abc234')).toBe(true);
    expect(councilCodeMatches(c, ' ABC234 ')).toBe(true);
    expect(councilCodeMatches(c, 'aBcDeFgHiJkL')).toBe(true);
    expect(councilCodeMatches(c, 'abcdefghijkl')).toBe(false);
    expect(councilCodeMatches(c, 'ABC235')).toBe(false);
    expect(
      councilCodeMatches(
        { joinCode: null, inviteCode: 'x'.repeat(12) },
        'ABC234',
      ),
    ).toBe(false);
    expect(normalizeJoinCode(' sheep2026 ')).toBe('SHEEP2026');
  });
});

describe('CouncilCodeLimiter (wrong-code rate limit)', () => {
  const offline = { isEnabled: () => false, getClient: () => null as never };
  let t = 1_000_000;
  const mk = () => new CouncilCodeLimiter(offline, () => t);

  it('locks a user after 5 wrong attempts and unlocks after the window', async () => {
    const l = mk();
    for (let i = 0; i < 5; i++) {
      expect((await l.check('c1', 'u1')).locked).toBe(false);
      await l.recordFailure('c1', 'u1');
    }
    const lock = await l.check('c1', 'u1');
    expect(lock.locked).toBe(true);
    expect(lock.locked && lock.retryAfterSec).toBeGreaterThan(0);
    expect((await l.check('c1', 'u2')).locked).toBe(false);
    expect((await l.check('c2', 'u1')).locked).toBe(false);
    t += 11 * 60_000;
    expect((await l.check('c1', 'u1')).locked).toBe(false);
  });

  it('a success clears the user counter; many accounts guessing lock the whole council', async () => {
    const l = mk();
    for (let i = 0; i < 4; i++) await l.recordFailure('c3', 'u1');
    await l.reset('c3', 'u1');
    expect((await l.check('c3', 'u1')).locked).toBe(false);
    for (let i = 0; i < 40; i++) await l.recordFailure('c4', `bot${i}`);
    expect((await l.check('c4', 'fresh-user')).locked).toBe(true);
  });

  it('throttle allows `max` events per window then reports retry-after', async () => {
    const l = mk();
    expect(await l.throttle('k', 1, 600)).toEqual({ ok: true });
    const second = await l.throttle('k', 1, 600);
    expect(second.ok).toBe(false);
    t += 601_000;
    expect(await l.throttle('k', 1, 600)).toEqual({ ok: true });
  });
});

describe('getCouncilVideoProfile (env-driven bandwidth cap)', () => {
  it('defaults to 540p simulcast', () => {
    expect(getCouncilVideoProfile({})).toMatchObject({
      maxHeight: 540,
      maxWidth: 960,
      maxFps: 24,
      maxBitrateKbps: 900,
      simulcast: true,
    });
  });
  it('honours env but never above the 720p ceiling', () => {
    expect(
      getCouncilVideoProfile({ COUNCIL_VIDEO_MAX_HEIGHT: '720' }),
    ).toMatchObject({ maxHeight: 720, maxBitrateKbps: 1500 });
    expect(
      getCouncilVideoProfile({ COUNCIL_VIDEO_MAX_HEIGHT: '1080' }).maxHeight,
    ).toBe(720);
    expect(
      getCouncilVideoProfile({ COUNCIL_VIDEO_MAX_HEIGHT: 'junk' }).maxHeight,
    ).toBe(540);
  });
});
