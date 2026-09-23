import {
  assertValidHhMm,
  validateSnapshotFormat,
  validatePersistedSnapshotTimes,
  isSupportedCountry,
  addSnapshotCrossFieldIssues,
} from '../../helpers/snapshotValidation';
import { ButcherApplicationError } from '../../errors';
import { z } from 'zod';

describe('snapshotValidation', () => {
  describe('assertValidHhMm', () => {
    it('accepts valid HH:mm', () => {
      expect(() => assertValidHhMm('09:30', 'openTime')).not.toThrow();
      expect(() => assertValidHhMm('23:59', 'closeTime')).not.toThrow();
    });

    it('rejects invalid HH:mm', () => {
      expect(() => assertValidHhMm('25:00', 'openTime')).toThrow(
        ButcherApplicationError,
      );
      expect(() => assertValidHhMm('9:30', 'openTime')).toThrow(
        ButcherApplicationError,
      );
    });
  });

  describe('validateSnapshotFormat', () => {
    it('rejects equal open and close times', () => {
      expect(() =>
        validateSnapshotFormat({ openTime: '10:00', closeTime: '10:00' }),
      ).toThrow(ButcherApplicationError);
    });

    it('accepts distinct valid times', () => {
      expect(() =>
        validateSnapshotFormat({ openTime: '08:00', closeTime: '22:00' }),
      ).not.toThrow();
    });

    it('rejects unset 0,0 map coordinates', () => {
      expect(() => validateSnapshotFormat({ lat: 0, lng: 0 })).toThrow(
        ButcherApplicationError,
      );
    });
  });

  describe('validatePersistedSnapshotTimes', () => {
    it('validates persisted snapshot at submit', () => {
      expect(() =>
        validatePersistedSnapshotTimes('08:00', '20:00'),
      ).not.toThrow();
      expect(() => validatePersistedSnapshotTimes('08:00', '08:00')).toThrow(
        ButcherApplicationError,
      );
    });
  });

  describe('isSupportedCountry', () => {
    it('recognizes GCC + EG codes', () => {
      expect(isSupportedCountry('SA')).toBe(true);
      expect(isSupportedCountry('XX')).toBe(false);
    });
  });

  describe('addSnapshotCrossFieldIssues', () => {
    it('adds zod issue when open equals close', () => {
      const issues: z.ZodIssue[] = [];
      const ctx = {
        addIssue: (issue: z.ZodIssue) => issues.push(issue),
        path: [],
      } as unknown as z.RefinementCtx;

      addSnapshotCrossFieldIssues(
        { openTime: '09:00', closeTime: '09:00' },
        ctx,
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toEqual(['closeTime']);
    });

    it('adds zod issue when coordinates are 0,0', () => {
      const issues: z.ZodIssue[] = [];
      const ctx = {
        addIssue: (issue: z.ZodIssue) => issues.push(issue),
        path: [],
      } as unknown as z.RefinementCtx;

      addSnapshotCrossFieldIssues({ lat: 0, lng: 0 }, ctx);
      expect(issues[0]?.path).toEqual(['lat']);
    });
  });
});
