import type { ButcherApplicationTimelineAction, Prisma } from '@prisma/client';
import type { TransactionClient } from './transaction';

/**
 * Legacy worker sentinel that was never inserted into User.
 * Must never be written to createdBy (FK to User.id).
 */
export const LEGACY_DAFTRA_CRON_ACTOR_ID =
  '00000000-0000-4000-8000-daftra00c001';

export const SYSTEM_TIMELINE_ACTOR_LABEL = 'النظام';

export type AppendTimelineParams = {
  applicationId: string;
  action: ButcherApplicationTimelineAction;
  /** Null for automated system events (e.g. Daftra product poll). */
  createdBy?: string | null;
  comment?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type TimelineEventWithActor =
  Prisma.ButcherApplicationTimelineEventGetPayload<{
    include: { actor: { select: { id: true; username: true } } };
  }>;

export function resolveTimelineCreatedBy(
  createdBy?: string | null,
): string | null {
  if (!createdBy || createdBy === LEGACY_DAFTRA_CRON_ACTOR_ID) {
    return null;
  }
  return createdBy;
}

export async function appendTimelineEvent(
  tx: TransactionClient,
  params: AppendTimelineParams,
): Promise<TimelineEventWithActor> {
  return tx.butcherApplicationTimelineEvent.create({
    data: {
      applicationId: params.applicationId,
      action: params.action,
      createdBy: resolveTimelineCreatedBy(params.createdBy),
      comment: params.comment ?? null,
      metadata: params.metadata ?? {},
    },
    include: {
      actor: { select: { id: true, username: true } },
    },
  });
}
