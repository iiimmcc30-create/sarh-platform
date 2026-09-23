import type {
  ButcherApplicationStatus,
  ButcherApplicationTimelineAction,
} from '@prisma/client';
import { ButcherApplicationError } from '../errors';

const ALLOWED_TRANSITIONS: Record<
  ButcherApplicationStatus,
  ButcherApplicationStatus[]
> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

const TRANSITION_TIMELINE_ACTION: Partial<
  Record<ButcherApplicationStatus, ButcherApplicationTimelineAction>
> = {
  SUBMITTED: 'SUBMIT',
  APPROVED: 'APPROVE',
  REJECTED: 'REJECT',
  WITHDRAWN: 'WITHDRAW',
};

export function canTransition(
  from: ButcherApplicationStatus,
  to: ButcherApplicationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Single status-transition gate. Maps duplicate/wrong-state attempts to Phase C error codes.
 */
export function assertTransition(
  from: ButcherApplicationStatus,
  to: ButcherApplicationStatus,
): void {
  if (from === to) {
    switch (to) {
      case 'SUBMITTED':
        throw new ButcherApplicationError('APPLICATION_ALREADY_SUBMITTED');
      case 'APPROVED':
        throw new ButcherApplicationError('APPLICATION_ALREADY_APPROVED');
      case 'REJECTED':
        throw new ButcherApplicationError('APPLICATION_ALREADY_REJECTED');
      case 'WITHDRAWN':
        throw new ButcherApplicationError('APPLICATION_ALREADY_WITHDRAWN');
      default:
        throw new ButcherApplicationError('INVALID_STATUS_TRANSITION', {
          from,
          to,
        });
    }
  }

  if (canTransition(from, to)) return;

  if (from === 'APPROVED') {
    throw new ButcherApplicationError('APPLICATION_ALREADY_APPROVED');
  }
  if (from === 'REJECTED') {
    throw new ButcherApplicationError('APPLICATION_ALREADY_REJECTED');
  }
  if (from === 'WITHDRAWN') {
    throw new ButcherApplicationError('APPLICATION_ALREADY_WITHDRAWN');
  }
  if (from === 'SUBMITTED' && to === 'SUBMITTED') {
    throw new ButcherApplicationError('APPLICATION_ALREADY_SUBMITTED');
  }
  if (from !== 'DRAFT' && to === 'SUBMITTED') {
    throw new ButcherApplicationError('APPLICATION_ALREADY_SUBMITTED');
  }

  throw new ButcherApplicationError('INVALID_STATUS_TRANSITION', { from, to });
}

export function timelineActionForTransition(
  to: ButcherApplicationStatus,
): ButcherApplicationTimelineAction {
  const action = TRANSITION_TIMELINE_ACTION[to];
  if (!action) {
    throw new ButcherApplicationError('INVALID_STATUS_TRANSITION', { to });
  }
  return action;
}

/** Draft-only guard for edits/uploads — not a lifecycle transition. */
export function assertEditableStatus(status: ButcherApplicationStatus): void {
  if (status !== 'DRAFT') {
    throw new ButcherApplicationError('APPLICATION_NOT_EDITABLE');
  }
}
