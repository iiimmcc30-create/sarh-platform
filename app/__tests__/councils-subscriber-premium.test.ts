import { readFileSync } from 'fs';
import path from 'path';
import {
  ARRIVAL_MIN_GAP_MS,
  ARRIVAL_PER_USER_MS,
  arrivalText,
  councilTierTag,
  createArrivalGate,
  isPremiumTier,
  sortCouncilsByHostTier,
  subscriberTierOf,
  tierColorKeys,
} from '@/lib/subscriberTier';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('subscriber tier (councils premium look)', () => {
  it('reads the active tier only from verified + verifiedTier', () => {
    expect(subscriberTierOf({ verified: true, verifiedTier: 'gold' })).toBe('gold');
    expect(subscriberTierOf({ verified: true, verifiedTier: 'blue_plus' })).toBe('blue_plus');
    expect(subscriberTierOf({ verified: true, verifiedTier: 'blue' })).toBe('blue');
    // Legacy verified (no tier), unverified, missing → no subscriber styling.
    expect(subscriberTierOf({ verified: true, verifiedTier: null })).toBeNull();
    expect(subscriberTierOf({ verified: false, verifiedTier: 'gold' })).toBeNull();
    expect(subscriberTierOf({ verified: true })).toBeNull();
    expect(subscriberTierOf(null)).toBeNull();
    expect(subscriberTierOf(undefined)).toBeNull();
  });

  it('premium = Gold and Blue+; colours: gold for Gold, blue for Blue / Blue+', () => {
    expect(isPremiumTier('gold')).toBe(true);
    expect(isPremiumTier('blue_plus')).toBe(true);
    expect(isPremiumTier('blue')).toBe(false);
    expect(isPremiumTier(null)).toBe(false);
    expect(tierColorKeys('gold')).toEqual({ line: 'tierGold', soft: 'tierGoldSoft' });
    expect(tierColorKeys('blue_plus')).toEqual({ line: 'tierBlue', soft: 'tierBlueSoft' });
    expect(tierColorKeys('blue')).toEqual({ line: 'tierBlue', soft: 'tierBlueSoft' });
  });

  it('list tags: «مجلس ذهبي» for Gold, Blue+ tag, nothing for Blue / free', () => {
    expect(councilTierTag('gold')).toBe('مجلس ذهبي');
    expect(councilTierTag('blue_plus')).toBe('Blue+');
    expect(councilTierTag('blue')).toBeNull();
    expect(councilTierTag(null)).toBeNull();
  });

  it('sorts Gold-hosted councils first and keeps server order otherwise (stable)', () => {
    const c = (id: string, verifiedTier: string | null) => ({ id, owner: { verified: true, verifiedTier } });
    const list = [c('a', null), c('b', 'gold'), c('c', 'blue_plus'), c('d', 'gold'), c('e', 'blue')];
    expect(sortCouncilsByHostTier(list).map((x) => x.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
    const plain = [c('x', null), c('y', 'blue')];
    expect(sortCouncilsByHostTier(plain).map((x) => x.id)).toEqual(['x', 'y']);
    expect(sortCouncilsByHostTier(plain)).not.toBe(plain);
  });

  it('arrival gate: min gap between chips and once per user per window', () => {
    const allow = createArrivalGate();
    expect(allow('u1', 0)).toBe(true);
    expect(allow('u2', ARRIVAL_MIN_GAP_MS - 1)).toBe(false);
    expect(allow('u2', ARRIVAL_MIN_GAP_MS)).toBe(true);
    expect(allow('u1', ARRIVAL_MIN_GAP_MS * 3)).toBe(false);
    expect(allow('u1', ARRIVAL_PER_USER_MS)).toBe(true);
    expect(arrivalText('متعب')).toBe('انضم متعب ✦');
  });
});

describe('councils premium wiring', () => {
  it('theme exposes solid tier tokens matching the verified seal', () => {
    const theme = src('constants/theme.ts');
    expect(theme).toContain("tierGold: '#C9A227'");
    expect(theme).toContain("tierBlue: '#1D9BF0'");
  });

  it('speaker seat: tier ring + seal next to the name, speaking animation intact', () => {
    const seat = src('components/councils/SpeakerSeat.tsx');
    expect(seat).toContain('subscriberTierOf(speaker.user)');
    expect(seat).toContain('council-tier-ring-');
    expect(seat).toContain('<VerificationBadge size={SEAT_BADGE} tier={speaker.user.verifiedTier} />');
    expect(seat).toContain('testID="council-speaking-mic"');
    expect(seat).not.toMatch(/LinearGradient|shadowColor|reanimated/);
  });

  it('council card: gold hairline + tag; list sorts Gold first', () => {
    const card = src('components/councils/CouncilCard.tsx');
    expect(card).toContain("hostTier === 'gold' && { borderColor: colors.tierGold }");
    expect(card).toContain('<CouncilTierTag tier={hostTier} />');
    expect(src('app/councils/index.tsx')).toContain("section('مجالس مباشرة', sortCouncilsByHostTier(publicList))");
  });

  it('room: gold header accent, owner seal and the entrance chip', () => {
    const room = src('app/councils/[id].tsx');
    expect(room).toContain('hostTier={subscriberTierOf(state?.council.owner)}');
    expect(room).toContain('<CouncilArrivalChip arrival={session.arrival} />');
    const header = src('components/councils/CouncilRoomHeader.tsx');
    expect(header).toContain("const gold = hostTier === 'gold';");
    expect(header).toContain('borderBottomColor: colors.tierGold');
  });

  it('entrance chip uses RN Animated with the native driver; socket event is optional', () => {
    const chip = src('components/councils/CouncilArrivalChip.tsx');
    expect(chip).toContain("from 'react-native'");
    expect(chip).not.toContain('reanimated');
    expect(chip.match(/useNativeDriver: true/g)?.length).toBe(2);
    const socket = src('hooks/useCouncilSocket.ts');
    expect(socket).toContain("'council:arrival'");
    const ctx = src('contexts/CouncilSessionContext.tsx');
    expect(ctx).toContain('if (!isPremiumTier(tier) || p.user.id === stateRef.current?.me.userId) return;');
    expect(ctx).toContain('arrivalGate.allow(p.user.id, now)');
  });
});
