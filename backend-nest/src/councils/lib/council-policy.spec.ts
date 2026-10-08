import {
  COUNCIL_MAX_SPEAKERS,
  canActOn,
  councilArrivalTier,
  councilPermissions,
  firstFreeSeat,
  roleOffStage,
  roleOnStage,
  rtcRoleFor,
} from './council-policy';

const council = {
  ownerId: 'owner',
  modCanManageRequests: true,
  modCanMute: true,
  modCanRemove: false,
  modCanBan: false,
};

describe('council policy', () => {
  it('owner can do everything', () => {
    const p = councilPermissions(council, 'owner', { role: 'OWNER' });
    expect(p).toMatchObject({
      isOwner: true,
      canManageRequests: true,
      canMute: true,
      canRemove: true,
      canBan: true,
      canManageModerators: true,
      canEdit: true,
      canEnd: true,
    });
  });

  it('moderators get exactly the flags the owner granted', () => {
    const p = councilPermissions(council, 'mod', { role: 'MODERATOR' });
    expect(p).toMatchObject({
      isModerator: true,
      canManageRequests: true,
      canMute: true,
      canRemove: false,
      canBan: false,
      canManageModerators: false,
      canEdit: false,
      canEnd: false,
    });
  });

  it('speakers, listeners, banned users and anonymous viewers manage nothing', () => {
    for (const role of ['SPEAKER', 'LISTENER', 'BANNED'] as const) {
      const p = councilPermissions(council, 'u', { role });
      expect(Object.values(p).every((v) => v === false)).toBe(true);
    }
    expect(councilPermissions(council, undefined, null).canEnd).toBe(false);
  });

  it('nobody acts on the owner or on themselves; moderators never act on moderators', () => {
    const owner = councilPermissions(council, 'owner', { role: 'OWNER' });
    const mod = councilPermissions(council, 'mod', { role: 'MODERATOR' });
    expect(canActOn(owner, 'owner', { userId: 'owner', role: 'OWNER' })).toBe(
      false,
    );
    expect(canActOn(owner, 'owner', { userId: 'm2', role: 'MODERATOR' })).toBe(
      true,
    );
    expect(canActOn(mod, 'mod', { userId: 'owner', role: 'OWNER' })).toBe(
      false,
    );
    expect(canActOn(mod, 'mod', { userId: 'm2', role: 'MODERATOR' })).toBe(
      false,
    );
    expect(canActOn(mod, 'mod', { userId: 'mod', role: 'MODERATOR' })).toBe(
      false,
    );
    expect(canActOn(mod, 'mod', { userId: 's', role: 'SPEAKER' })).toBe(true);
    expect(canActOn(mod, 'mod', { userId: 'l', role: 'LISTENER' })).toBe(true);
  });

  it('only unmuted members on stage get a publisher Agora role', () => {
    expect(rtcRoleFor(null)).toBe('subscriber');
    expect(rtcRoleFor({ userId: 'l', role: 'LISTENER', seatIndex: null })).toBe(
      'subscriber',
    );
    expect(rtcRoleFor({ userId: 's', role: 'SPEAKER', seatIndex: 3 })).toBe(
      'publisher',
    );
    expect(rtcRoleFor({ userId: 'o', role: 'OWNER', seatIndex: 0 })).toBe(
      'publisher',
    );
    expect(
      rtcRoleFor({
        userId: 's',
        role: 'SPEAKER',
        seatIndex: 3,
        mutedByModerator: true,
      }),
    ).toBe('subscriber');
    expect(rtcRoleFor({ userId: 'b', role: 'BANNED', seatIndex: 2 })).toBe(
      'subscriber',
    );
    expect(
      rtcRoleFor({ userId: 'm', role: 'MODERATOR', seatIndex: null }),
    ).toBe('subscriber');
  });

  it('allocates the lowest free seat and refuses a 13th speaker', () => {
    expect(firstFreeSeat([])).toBe(0);
    expect(firstFreeSeat([0, 1, 3])).toBe(2);
    const eleven = Array.from({ length: 11 }, (_, i) => i);
    expect(firstFreeSeat(eleven)).toBe(11);
    const full = Array.from({ length: COUNCIL_MAX_SPEAKERS }, (_, i) => i);
    expect(firstFreeSeat(full)).toBeNull();
    expect(COUNCIL_MAX_SPEAKERS).toBe(12);
  });

  it('keeps owner/moderator roles across stage changes', () => {
    expect(roleOnStage('LISTENER')).toBe('SPEAKER');
    expect(roleOnStage('MODERATOR')).toBe('MODERATOR');
    expect(roleOffStage('SPEAKER')).toBe('LISTENER');
    expect(roleOffStage('MODERATOR')).toBe('MODERATOR');
  });

  it('announces entrances only for active Gold / Blue+ badges', () => {
    expect(councilArrivalTier({ verified: true, verifiedTier: 'gold' })).toBe(
      'gold',
    );
    expect(
      councilArrivalTier({ verified: true, verifiedTier: 'blue_plus' }),
    ).toBe('blue_plus');
    expect(
      councilArrivalTier({ verified: true, verifiedTier: 'blue' }),
    ).toBeNull();
    expect(
      councilArrivalTier({ verified: true, verifiedTier: null }),
    ).toBeNull();
    expect(
      councilArrivalTier({ verified: false, verifiedTier: 'gold' }),
    ).toBeNull();
    expect(councilArrivalTier(null)).toBeNull();
  });
});
