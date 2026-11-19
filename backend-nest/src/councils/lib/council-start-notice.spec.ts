import {
  councilStartCopy,
  councilStartOptedOut,
  councilStartPayload,
  mergeCouncilStartRecipients,
} from './council-start-notice';

const base = {
  councilId: 'c-1',
  councilName: 'مجلس الإبل',
  visibility: 'PUBLIC' as const,
  golden: false,
  ownerId: 'owner',
  ownerName: 'أبو سعد',
  ownerAvatar: 'https://cdn.example/a.jpg',
};

describe('council start notice', () => {
  it('names the owner and the council, and never carries a join code', () => {
    const copy = councilStartCopy('أبو سعد', 'مجلس الإبل');
    expect(copy.titleAr).toBe('بدأ المجلس');
    expect(copy.bodyAr).toBe('أبو سعد بدأ المجلس «مجلس الإبل»');

    const data = councilStartPayload({
      ...base,
      visibility: 'PRIVATE',
      golden: true,
    });
    expect(data).toMatchObject({
      kind: 'council_live',
      councilId: 'c-1',
      visibility: 'PRIVATE',
      locked: '1',
      golden: '1',
      actorId: 'owner',
      actorName: 'أبو سعد',
      action: 'join',
    });
    expect(JSON.stringify(data)).not.toMatch(/join.?code|inviteCode|"code"/i);
    expect(Object.keys(data).some((key) => /code/i.test(key))).toBe(false);
  });

  it('keeps public rooms unlocked and omits an empty avatar', () => {
    const data = councilStartPayload({ ...base, ownerAvatar: null });
    expect(data.locked).toBe('0');
    expect(data.visibility).toBe('PUBLIC');
    expect(data.actorAvatar).toBeUndefined();
  });

  it('dedupes followers and reminders, drops the owner, and honors the restart window', () => {
    const optedOut = new Set(['quiet']);
    expect(
      mergeCouncilStartRecipients({
        followerIds: ['fan', 'quiet', 'owner', 'fan'],
        reminderIds: ['fan', 'wait'],
        ownerId: 'owner',
        includeFollowers: true,
        optedOutIds: optedOut,
      }),
    ).toEqual(['fan', 'wait']);

    expect(
      mergeCouncilStartRecipients({
        followerIds: ['fan', 'other'],
        reminderIds: ['wait'],
        ownerId: 'owner',
        includeFollowers: false,
        optedOutIds: new Set(),
      }),
    ).toEqual(['wait']);
  });

  it('treats a missing or off councilStarted pref as opted out', () => {
    const ids = ['on', 'off', 'missing'];
    const opted = councilStartOptedOut(
      [
        { id: 'on', notificationPrefs: { councilStarted: true } },
        { id: 'off', notificationPrefs: { councilStarted: false } },
      ],
      ids,
    );
    expect([...opted].sort()).toEqual(['missing', 'off']);
  });

  it('caps the blast and still prefers reminders', () => {
    expect(
      mergeCouncilStartRecipients({
        followerIds: ['f1', 'f2', 'f3'],
        reminderIds: ['r1'],
        ownerId: 'owner',
        includeFollowers: true,
        optedOutIds: new Set(),
        cap: 2,
      }),
    ).toEqual(['r1', 'f1']);
  });
});
