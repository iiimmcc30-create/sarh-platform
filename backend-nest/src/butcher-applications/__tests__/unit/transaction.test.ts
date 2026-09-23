import {
  assertNotModified,
  assertApplicationOwner,
} from '../../helpers/transaction';
import { ButcherApplicationError } from '../../errors';

describe('transaction helpers', () => {
  describe('assertNotModified', () => {
    const updatedAt = new Date('2025-01-15T10:00:00.000Z');

    it('passes when header is absent', () => {
      expect(() => assertNotModified(updatedAt, undefined)).not.toThrow();
    });

    it('passes when timestamps match', () => {
      expect(() =>
        assertNotModified(updatedAt, '2025-01-15T10:00:00.000Z'),
      ).not.toThrow();
    });

    it('throws APPLICATION_CONFLICT on mismatch', () => {
      expect(() =>
        assertNotModified(updatedAt, '2025-01-15T11:00:00.000Z'),
      ).toThrow(ButcherApplicationError);

      try {
        assertNotModified(updatedAt, '2025-01-15T11:00:00.000Z');
      } catch (err) {
        expect((err as ButcherApplicationError).code).toBe(
          'APPLICATION_CONFLICT',
        );
      }
    });

    it('throws APPLICATION_CONFLICT on invalid date', () => {
      expect(() => assertNotModified(updatedAt, 'not-a-date')).toThrow(
        ButcherApplicationError,
      );
    });
  });

  describe('assertApplicationOwner', () => {
    it('allows owner', () => {
      expect(() =>
        assertApplicationOwner('owner-id', 'owner-id'),
      ).not.toThrow();
    });

    it('denies non-owner', () => {
      expect(() => assertApplicationOwner('owner-id', 'other-id')).toThrow(
        ButcherApplicationError,
      );
      try {
        assertApplicationOwner('owner-id', 'other-id');
      } catch (err) {
        expect((err as ButcherApplicationError).code).toBe(
          'APPLICATION_ACCESS_DENIED',
        );
      }
    });
  });
});
