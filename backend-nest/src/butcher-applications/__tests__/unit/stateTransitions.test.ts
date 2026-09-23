import {
  canTransition,
  assertTransition,
  timelineActionForTransition,
  assertEditableStatus,
} from '../../helpers/stateTransitions';
import { ButcherApplicationError } from '../../errors';

describe('stateTransitions', () => {
  describe('canTransition', () => {
    it('allows DRAFT → SUBMITTED', () => {
      expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    });

    it('allows SUBMITTED → APPROVED, REJECTED, WITHDRAWN', () => {
      expect(canTransition('SUBMITTED', 'APPROVED')).toBe(true);
      expect(canTransition('SUBMITTED', 'REJECTED')).toBe(true);
      expect(canTransition('SUBMITTED', 'WITHDRAWN')).toBe(true);
    });

    it('forbids terminal state transitions', () => {
      expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
      expect(canTransition('REJECTED', 'SUBMITTED')).toBe(false);
      expect(canTransition('WITHDRAWN', 'DRAFT')).toBe(false);
    });
  });

  describe('assertTransition', () => {
    it('throws APPLICATION_ALREADY_SUBMITTED on duplicate submit', () => {
      expect(() => assertTransition('SUBMITTED', 'SUBMITTED')).toThrow(
        ButcherApplicationError,
      );
      try {
        assertTransition('SUBMITTED', 'SUBMITTED');
      } catch (err) {
        expect((err as ButcherApplicationError).code).toBe(
          'APPLICATION_ALREADY_SUBMITTED',
        );
      }
    });

    it('throws APPLICATION_ALREADY_APPROVED when patching approved', () => {
      expect(() => assertTransition('APPROVED', 'REJECTED')).toThrow(
        ButcherApplicationError,
      );
      try {
        assertTransition('APPROVED', 'REJECTED');
      } catch (err) {
        expect((err as ButcherApplicationError).code).toBe(
          'APPLICATION_ALREADY_APPROVED',
        );
      }
    });

    it('throws INVALID_STATUS_TRANSITION for DRAFT → APPROVED', () => {
      try {
        assertTransition('DRAFT', 'APPROVED');
      } catch (err) {
        expect((err as ButcherApplicationError).code).toBe(
          'INVALID_STATUS_TRANSITION',
        );
      }
    });
  });

  describe('timelineActionForTransition', () => {
    it('maps lifecycle targets to timeline actions', () => {
      expect(timelineActionForTransition('SUBMITTED')).toBe('SUBMIT');
      expect(timelineActionForTransition('APPROVED')).toBe('APPROVE');
      expect(timelineActionForTransition('REJECTED')).toBe('REJECT');
      expect(timelineActionForTransition('WITHDRAWN')).toBe('WITHDRAW');
    });
  });

  describe('assertEditableStatus', () => {
    it('allows DRAFT only', () => {
      expect(() => assertEditableStatus('DRAFT')).not.toThrow();
    });

    it('rejects non-draft statuses', () => {
      expect(() => assertEditableStatus('SUBMITTED')).toThrow(
        ButcherApplicationError,
      );
      expect(() => assertEditableStatus('APPROVED')).toThrow(
        ButcherApplicationError,
      );
    });
  });
});
