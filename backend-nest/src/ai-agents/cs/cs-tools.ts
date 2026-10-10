import { z } from 'zod';
import {
  objectJsonSchema,
  type AgentTool,
  type ToolActor,
} from '../core/tool-registry';

export type TicketFilter = 'open' | 'review' | 'closed';

export type CsReads = {
  subscription(userId: string): Promise<unknown>;
  verification(userId: string): Promise<unknown>;
  fees(userId: string): Promise<unknown>;
  payments(userId: string, limit: number): Promise<unknown>;
  tickets(userId: string, status?: TicketFilter): Promise<unknown>;
  searchFaq(query: string): Promise<unknown>;
};

function selfId(actor: ToolActor): string | null {
  if (!actor.actorId) return null;
  if (actor.scope === 'public') return null;
  return actor.actorId;
}

function none(name: string, description: string, schema: z.ZodType, parameters: Record<string, unknown>, execute: AgentTool['execute']): AgentTool {
  return {
    name,
    description,
    schema,
    parameters,
    scope: 'self',
    sideEffect: 'none',
    execute,
  };
}

/** Read-only tools. The user id is the server actor, never a model argument. */
export function buildCsTools(reads: CsReads): AgentTool[] {
  return [
    none(
      'search_faq',
      'Search the help-center FAQ.',
      z.object({ query: z.string().min(1).max(300) }).strict(),
      objectJsonSchema({ query: { type: 'string' } }, ['query']),
      async (args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        const query = (args as { query: string }).query;
        return reads.searchFaq(query);
      },
    ),
    none(
      'get_my_subscription',
      'The signed-in user subscription.',
      z.object({}).strict(),
      objectJsonSchema({}, []),
      async (_args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        return reads.subscription(userId);
      },
    ),
    none(
      'get_my_verification',
      'The signed-in user verification badge.',
      z.object({}).strict(),
      objectJsonSchema({}, []),
      async (_args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        return reads.verification(userId);
      },
    ),
    none(
      'get_my_fees',
      'The signed-in user listing fees.',
      z.object({}).strict(),
      objectJsonSchema({}, []),
      async (_args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        return reads.fees(userId);
      },
    ),
    none(
      'get_my_payments',
      'Recent payments for the signed-in user.',
      z
        .object({ limit: z.number().int().min(1).max(10).optional() })
        .strict(),
      objectJsonSchema({ limit: { type: 'number' } }, []),
      async (args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        const limit = (args as { limit?: number }).limit ?? 5;
        return reads.payments(userId, limit);
      },
    ),
    none(
      'list_my_tickets',
      'The signed-in user support tickets.',
      z
        .object({
          status: z.enum(['open', 'review', 'closed']).optional(),
        })
        .strict(),
      objectJsonSchema({ status: { type: 'string' } }, []),
      async (args, actor) => {
        const userId = selfId(actor);
        if (!userId) return { error: 'no_actor' };
        return reads.tickets(
          userId,
          (args as { status?: TicketFilter }).status,
        );
      },
    ),
  ];
}
