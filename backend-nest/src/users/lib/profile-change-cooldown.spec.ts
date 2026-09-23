import { readFileSync } from 'fs';
import path from 'path';
import {
  NAME_CHANGE_COOLDOWN_MS,
  PROFILE_CHANGE_ERRORS,
  USERNAME_CHANGE_COOLDOWN_MS,
  cooldownPayload,
  nextAllowedAt,
  planProfileIdentityUpdate,
  type ProfileChangeState,
} from './profile-change-cooldown';

const NOW = new Date('2026-09-22T12:00:00.000Z');

function user(overrides: Partial<ProfileChangeState> = {}): ProfileChangeState {
  return {
    username: 'ahmed',
    displayName: 'أحمد',
    arabicName: 'أحمد',
    nameChangedAt: null,
    usernameChangedAt: null,
    ...overrides,
  };
}

describe('profile change cooldown planner', () => {
  it('allows a first name change and stamps nameChangedAt', () => {
    const planned = planProfileIdentityUpdate(
      user(),
      { displayName: 'سالم', arabicName: 'سالم' },
      NOW,
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.data.displayName).toBe('سالم');
    expect(planned.data.arabicName).toBe('سالم');
    expect(planned.data.nameChangedAt).toEqual(NOW);
    expect(planned.data.usernameChangedAt).toBeUndefined();
  });

  it('does not start a name cooldown when saving the same name', () => {
    const planned = planProfileIdentityUpdate(
      user({
        nameChangedAt: new Date('2026-09-20T12:00:00.000Z'),
      }),
      { displayName: 'أحمد', arabicName: 'أحمد' },
      NOW,
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.data).toEqual({});
  });

  it('rejects a second name change before 7 days with nextAllowedAt', () => {
    const changedAt = new Date('2026-09-22T00:00:00.000Z');
    const planned = planProfileIdentityUpdate(
      user({ nameChangedAt: changedAt }),
      { displayName: 'سالم', arabicName: 'سالم' },
      new Date('2026-09-24T00:00:00.000Z'),
    );
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.error).toBe(PROFILE_CHANGE_ERRORS.NAME_COOLDOWN);
    expect(planned.details.nextAllowedAt).toBe('2026-09-29T00:00:00.000Z');
  });

  it('allows a name change after 7 days', () => {
    const planned = planProfileIdentityUpdate(
      user({ nameChangedAt: new Date('2026-09-22T00:00:00.000Z') }),
      { displayName: 'سالم', arabicName: 'سالم' },
      new Date('2026-09-29T00:00:00.000Z'),
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.data.nameChangedAt).toEqual(
      new Date('2026-09-29T00:00:00.000Z'),
    );
  });

  it('allows a name that already belongs to another user', () => {
    const planned = planProfileIdentityUpdate(
      user(),
      { displayName: 'محمد', arabicName: 'محمد' },
      NOW,
    );
    expect(planned.ok).toBe(true);
  });

  it('allows a first username change and stamps usernameChangedAt', () => {
    const planned = planProfileIdentityUpdate(
      user(),
      { username: 'salem' },
      NOW,
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.data.username).toBe('salem');
    expect(planned.data.usernameChangedAt).toEqual(NOW);
    expect(planned.data.nameChangedAt).toBeUndefined();
  });

  it('does not start a username cooldown when saving the same username', () => {
    const planned = planProfileIdentityUpdate(
      user({
        usernameChangedAt: new Date('2026-09-01T12:00:00.000Z'),
      }),
      { username: 'ahmed' },
      NOW,
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.data).toEqual({});
  });

  it('rejects a second username change before 30 days with nextAllowedAt', () => {
    const planned = planProfileIdentityUpdate(
      user({ usernameChangedAt: new Date('2026-09-22T00:00:00.000Z') }),
      { username: 'salem' },
      new Date('2026-10-10T00:00:00.000Z'),
    );
    expect(planned.ok).toBe(false);
    if (planned.ok) return;
    expect(planned.error).toBe(PROFILE_CHANGE_ERRORS.USERNAME_COOLDOWN);
    expect(planned.details.nextAllowedAt).toBe('2026-10-22T00:00:00.000Z');
  });

  it('allows a username change after 30 days', () => {
    const planned = planProfileIdentityUpdate(
      user({ usernameChangedAt: new Date('2026-09-22T00:00:00.000Z') }),
      { username: 'salem' },
      new Date('2026-10-22T00:00:00.000Z'),
    );
    expect(planned.ok).toBe(true);
  });

  it('treats a missing timestamp as immediately changeable', () => {
    expect(nextAllowedAt(null, NAME_CHANGE_COOLDOWN_MS, NOW)).toBeNull();
    expect(
      nextAllowedAt(undefined, USERNAME_CHANGE_COOLDOWN_MS, NOW),
    ).toBeNull();
  });

  it('exposes nextAllowedAt only while the cooldown is active', () => {
    const payload = cooldownPayload(
      new Date('2026-09-22T00:00:00.000Z'),
      new Date('2026-09-22T00:00:00.000Z'),
      new Date('2026-09-25T00:00:00.000Z'),
    );
    expect(payload.nameNextAllowedAt).toBe('2026-09-29T00:00:00.000Z');
    expect(payload.usernameNextAllowedAt).toBe('2026-10-22T00:00:00.000Z');

    const expired = cooldownPayload(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-08-01T00:00:00.000Z'),
      NOW,
    );
    expect(expired.nameNextAllowedAt).toBeNull();
    expect(expired.usernameNextAllowedAt).toBeNull();
  });

  it('keeps username unique and does not unique-constrain name', () => {
    const schema = readFileSync(
      path.join(__dirname, '../../../prisma/schema.prisma'),
      'utf8',
    );
    expect(schema).toMatch(/username\s+String\s+@unique/);
    expect(schema).toMatch(/displayName\s+String\n/);
    expect(schema).not.toMatch(/displayName\s+String\s+@unique/);
    expect(schema).not.toMatch(/arabicName\s+String\s+@unique/);
    expect(schema).toMatch(/nameChangedAt\s+DateTime\?/);
    expect(schema).toMatch(/usernameChangedAt\s+DateTime\?/);
  });

  it('locks identity updates so cooldown timestamps cannot race', () => {
    const repo = readFileSync(
      path.join(__dirname, '../repositories/users.repository.ts'),
      'utf8',
    );
    expect(repo).toContain('FOR UPDATE');
    expect(repo).toContain('$transaction');
    expect(repo).toContain('nameChangedAt');
    expect(repo).toContain('usernameChangedAt');
  });
});
