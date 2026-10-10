import { z } from 'zod';
import {
  objectJsonSchema,
  type AgentTool,
  type ToolActor,
} from '../core/tool-registry';

export type TechOps = {
  health(): Promise<{
    status: string;
    checks: { api: boolean; db: boolean; redis: boolean; queue: boolean };
  }>;
  queues(): Promise<
    Array<{
      name: string;
      waiting: number;
      active: number;
      failed: number;
      delayed: number;
    }>
  >;
  errors(minutes: number): Promise<Array<{ route: string; count: number }>>;
  sentry(hours: number): Promise<{
    available: boolean;
    issues: Array<{ title: string; count: number }>;
  }>;
};

function adminActor(actor: ToolActor): boolean {
  return actor.scope === 'admin' && Boolean(actor.actorId);
}

function readOnly(
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
    scope: 'admin',
    sideEffect: 'none',
    execute,
  };
}

/** Read-only tech tools. No shell, restarts, settings, user records, or secrets. */
export function buildTechTools(ops: TechOps): AgentTool[] {
  return [
    readOnly(
      'get_health',
      'Health of API, database, Redis, and queues.',
      z.object({}).strict(),
      objectJsonSchema({}, []),
      async (_args, actor) => {
        if (!adminActor(actor)) return { error: 'no_actor' };
        return ops.health();
      },
    ),
    readOnly(
      'get_queue_stats',
      'Waiting, active, failed, and delayed job counts.',
      z.object({}).strict(),
      objectJsonSchema({}, []),
      async (_args, actor) => {
        if (!adminActor(actor)) return { error: 'no_actor' };
        return ops.queues();
      },
    ),
    readOnly(
      'get_error_stats',
      '5xx counts by route for a recent window.',
      z.object({ minutes: z.number().int().min(1).max(1440).optional() }).strict(),
      objectJsonSchema({ minutes: { type: 'number' } }, []),
      async (args, actor) => {
        if (!adminActor(actor)) return { error: 'no_actor' };
        const minutes = (args as { minutes?: number }).minutes ?? 60;
        return ops.errors(minutes);
      },
    ),
    readOnly(
      'sentry_recent_issues',
      'Recent Sentry issue titles, or unavailable.',
      z.object({ hours: z.number().int().min(1).max(48).optional() }).strict(),
      objectJsonSchema({ hours: { type: 'number' } }, []),
      async (args, actor) => {
        if (!adminActor(actor)) return { error: 'no_actor' };
        const hours = (args as { hours?: number }).hours ?? 24;
        return ops.sentry(hours);
      },
    ),
  ];
}
