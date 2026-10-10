import { z } from 'zod';
import { PiiPseudonymizer } from '../../ai-safety/pii-redaction';
import { SUPPORT_TICKET_CATEGORIES } from '../../support/constants/support.constants';
import type { SupportEscalationReason } from '../../support/ai/ai-provider';
import {
  objectJsonSchema,
  ToolDenied,
  type AgentTool,
  type ToolActor,
} from '../core/tool-registry';
import { CsWriteBudget } from './cs-write-budget';
import {
  hasExplicitWriteConfirmation,
  type WriteKind,
} from './cs-write-confirm';

const WRITE_CATEGORIES = SUPPORT_TICKET_CATEGORIES.filter(
  (category) => category !== 'FRAUD',
);

export const CS_WRITE_API = Symbol('CS_WRITE_API');

export type CsWriteApi = {
  createOwnedHelpTicket(
    userId: string,
    category: string,
    summary: string,
  ): Promise<{ ticketNumber: string; duplicate: boolean }>;
  addOwnedNote(
    userId: string,
    ticketNumber: string,
    body: string,
  ): Promise<{ ok: boolean; reason?: 'not_owner' | 'closed' }>;
  handoffOwnedTicket(
    userId: string,
    ticketNumber: string,
    reason: SupportEscalationReason,
  ): Promise<{ ok: boolean; reason?: 'not_owner' | 'closed' }>;
};

const HANDOFF_REASON: Record<string, SupportEscalationReason> = {
  money: 'payment_dispute',
  fraud: 'fraud',
  legal: 'human_requested',
  account: 'human_requested',
  other: 'human_requested',
};

function selfId(actor: ToolActor): string {
  if (!actor.actorId || actor.scope === 'public') {
    throw new ToolDenied('no_actor');
  }
  return actor.actorId;
}

function writeTool(
  name: string,
  description: string,
  schema: z.ZodType,
  parameters: Record<string, unknown>,
  execute: AgentTool['execute'],
): AgentTool {
  return {
    name,
    description,
    schema,
    parameters,
    scope: 'self',
    sideEffect: 'write',
    execute,
  };
}

/**
 * Write tools for the signed-in user only. They do not touch payments,
 * subscriptions, fees, verification, listings, or account settings.
 */
export function buildCsWriteTools(deps: {
  customerText: string;
  ticketId: string;
  tickets: CsWriteApi;
  budget: CsWriteBudget;
}): AgentTool[] {
  const pii = new PiiPseudonymizer();
  const confirm = (kind: WriteKind) => {
    if (!hasExplicitWriteConfirmation(kind, deps.customerText)) {
      throw new ToolDenied('confirmation_required');
    }
  };
  const guarded = async <T>(userId: string, fn: () => Promise<T>): Promise<T> => {
    const gate = await deps.budget.reserve(userId, deps.ticketId);
    if (gate !== 'ok') throw new ToolDenied(gate);
    try {
      return await fn();
    } catch (err) {
      await deps.budget.release(userId, deps.ticketId);
      throw err;
    }
  };

  return [
    writeTool(
      'create_support_ticket',
      'Open a help ticket for the signed-in user.',
      z
        .object({
          category: z.enum(WRITE_CATEGORIES as [string, ...string[]]),
          summary: z.string().min(1).max(300),
        })
        .strict(),
      objectJsonSchema(
        { category: { type: 'string' }, summary: { type: 'string' } },
        ['category', 'summary'],
      ),
      async (args, actor) => {
        const userId = selfId(actor);
        confirm('ticket');
        const parsed = args as { category: string; summary: string };
        const summary = pii.redact(parsed.summary).slice(0, 300);
        return guarded(userId, async () => {
          const created = await deps.tickets.createOwnedHelpTicket(
            userId,
            parsed.category,
            summary,
          );
          if (created.duplicate) await deps.budget.release(userId, deps.ticketId);
          return created;
        });
      },
    ),
    writeTool(
      'add_ticket_note',
      'Add a message on a ticket the signed-in user owns.',
      z
        .object({
          ticketNumber: z.string().min(4).max(40),
          body: z.string().min(1).max(800),
        })
        .strict(),
      objectJsonSchema(
        { ticketNumber: { type: 'string' }, body: { type: 'string' } },
        ['ticketNumber', 'body'],
      ),
      async (args, actor) => {
        const userId = selfId(actor);
        confirm('note');
        const parsed = args as { ticketNumber: string; body: string };
        const body = pii.redact(parsed.body).slice(0, 800);
        return guarded(userId, async () => {
          const result = await deps.tickets.addOwnedNote(
            userId,
            parsed.ticketNumber,
            body,
          );
          if (!result.ok) throw new ToolDenied(result.reason ?? 'not_owner');
          return { ok: true, ticketNumber: parsed.ticketNumber };
        });
      },
    ),
    writeTool(
      'request_human_handoff',
      'Hand the user\'s own ticket to human support.',
      z
        .object({
          ticketNumber: z.string().min(4).max(40),
          reason: z
            .enum(['money', 'fraud', 'legal', 'account', 'other'])
            .optional(),
        })
        .strict(),
      objectJsonSchema(
        { ticketNumber: { type: 'string' }, reason: { type: 'string' } },
        ['ticketNumber'],
      ),
      async (args, actor) => {
        const userId = selfId(actor);
        confirm('handoff');
        const parsed = args as { ticketNumber: string; reason?: string };
        const reason = HANDOFF_REASON[parsed.reason ?? 'other'] ?? 'human_requested';
        return guarded(userId, async () => {
          const result = await deps.tickets.handoffOwnedTicket(
            userId,
            parsed.ticketNumber,
            reason,
          );
          if (!result.ok) throw new ToolDenied(result.reason ?? 'not_owner');
          return { ok: true, ticketNumber: parsed.ticketNumber };
        });
      },
    ),
  ];
}
