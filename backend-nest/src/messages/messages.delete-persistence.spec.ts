import { isDeletedForUser } from './messages.service';

describe('deleted conversations stay deleted', () => {
  const cut = new Date('2026-10-01T10:00:00Z');
  it('is visible when never deleted', () => {
    expect(isDeletedForUser(null, new Date())).toBe(false);
  });
  it('is hidden while nothing newer than the cutoff exists', () => {
    expect(isDeletedForUser(cut, new Date('2026-10-01T09:59:59Z'))).toBe(true);
    expect(isDeletedForUser(cut, cut)).toBe(true);
  });
  it('comes back (without old history) after a newer message', () => {
    expect(isDeletedForUser(cut, new Date('2026-10-01T10:00:01Z'))).toBe(false);
  });
});
