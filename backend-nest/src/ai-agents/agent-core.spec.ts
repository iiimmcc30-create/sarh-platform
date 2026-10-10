import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { AiBudgetService } from '../ai-safety/ai-budget.service';
import { AiCallGuardService } from '../ai-safety/ai-call-guard.service';
import { AgentRunner, type AgentModel } from './core/agent-runner';
import { AiAuditService, type AuditAppend } from './core/audit.service';
import { OpenAiAgentModel } from './core/openai-agent-model';
import {
  objectJsonSchema,
  ToolRegistry,
  type AgentTool,
} from './core/tool-registry';
import { wrapUntrusted } from './core/untrusted';

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as never;

function auditOf(prisma: unknown) {
  return new AiAuditService(prisma as never, logger);
}

function memoryAudit() {
  const rows: Array<Record<string, unknown>> = [];
  const prisma = {
    aiAuditLog: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        rows.push(data);
        return data;
      }),
      findMany: jest.fn(async () => [...rows]),
    },
  };
  return { rows, audit: auditOf(prisma) };
}

function runnerFor(
  model: AgentModel,
  registry: ToolRegistry,
  audit: AiAuditService,
) {
  const budget = new AiBudgetService(logger);
  const guard = new AiCallGuardService(budget, logger);
  return new AgentRunner(guard, audit, registry, model);
}

function pingTool(execute: AgentTool['execute'], side: AgentTool['sideEffect'] = 'none', scope: AgentTool['scope'] = 'public'): AgentTool {
  return {
    name: 'ping',
    description: 'ping',
    schema: z.object({ n: z.string() }).strict(),
    parameters: objectJsonSchema({ n: { type: 'string' } }, ['n']),
    scope,
    sideEffect: side,
    execute,
  };
}

const baseRun = {
  agent: 'cs' as const,
  actorKind: 'user' as const,
  actorId: 'server-user',
  scope: 'public' as const,
  model: 'fake',
  messages: [{ role: 'user' as const, content: 'هلا' }],
};

describe('agent core (phase 1)', () => {
  const env = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    process.env.REDIS_ENABLED = 'false';
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '1000000';
    process.env.SARH_AI_DAILY_REQUEST_LIMIT = '1000';
    delete process.env.SARH_AI_ENABLED;
  });

  afterAll(() => {
    process.env = env;
  });

  it('wraps untrusted text after redacting a phone number', () => {
    const wrapped = wrapUntrusted('رقمي 0501234567');
    expect(wrapped).toContain('<<<UNTRUSTED_DATA>>>');
    expect(wrapped).toContain('<<<END_UNTRUSTED_DATA>>>');
    expect(wrapped).not.toContain('0501234567');
  });

  it('ships an empty tool registry and is not wired into the app', () => {
    expect(new ToolRegistry().list()).toEqual([]);
    expect(objectJsonSchema({ n: { type: 'string' } }, ['n'])).toMatchObject({
      additionalProperties: false,
    });
    const app = readFileSync(join(__dirname, '../app.module.ts'), 'utf8');
    expect(app).not.toContain('AiAgentsModule');
    const registry = readFileSync(
      join(__dirname, 'core/tool-registry.ts'),
      'utf8',
    );
    expect(registry).not.toContain('payments');
    expect(registry).not.toContain('subscriptions');
  });

  it('rejects arguments outside the schema and never calls the handler', async () => {
    const { rows, audit } = memoryAudit();
    const execute = jest.fn();
    const registry = new ToolRegistry();
    registry.register(pingTool(execute));
    let step = 0;
    const model: AgentModel = {
      complete: jest.fn(async () => {
        step += 1;
        if (step > 1) return { content: 'تم', toolCalls: [] };
        return {
          content: '',
          toolCalls: [
            { id: 'c1', name: 'ping', arguments: '{"n":1,"extra":true}' },
          ],
        };
      }),
    };
    const result = await runnerFor(model, registry, audit).run(baseRun);
    expect(result.stopped).toBe('done');
    expect(execute).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({
        status: 'denied',
        resultSummary: 'invalid_input',
        actorId: 'server-user',
      }),
    ]);
  });

  it('refuses userId or actorId supplied by the model', async () => {
    const { rows, audit } = memoryAudit();
    const execute = jest.fn();
    const registry = new ToolRegistry();
    registry.register(pingTool(execute));
    let step = 0;
    const model: AgentModel = {
      complete: jest.fn(async () => {
        step += 1;
        if (step > 1) return { content: 'تم', toolCalls: [] };
        return {
          content: '',
          toolCalls: [
            {
              id: 'c1',
              name: 'ping',
              arguments: '{"n":"a","userId":"someone-else"}',
            },
          ],
        };
      }),
    };
    await runnerFor(model, registry, audit).run(baseRun);
    expect(execute).not.toHaveBeenCalled();
    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: 'denied',
        resultSummary: 'actor_from_model',
        actorId: 'server-user',
      }),
    );
    expect(JSON.stringify(rows[0].inputJson)).not.toContain('someone-else');
  });

  it('does not execute write or action tools', async () => {
    const { rows, audit } = memoryAudit();
    const execute = jest.fn();
    const registry = new ToolRegistry();
    registry.register(pingTool(execute, 'write'));
    let step = 0;
    const model: AgentModel = {
      complete: jest.fn(async () => {
        step += 1;
        if (step > 1) return { content: 'تم', toolCalls: [] };
        return {
          content: '',
          toolCalls: [{ id: 'c1', name: 'ping', arguments: '{"n":"a"}' }],
        };
      }),
    };
    await runnerFor(model, registry, audit).run(baseRun);
    expect(execute).not.toHaveBeenCalled();
    expect(rows[0]).toEqual(
      expect.objectContaining({ status: 'denied', resultSummary: 'side_effect' }),
    );
  });

  it('stops after four model rounds even if another tool is requested', async () => {
    const { audit } = memoryAudit();
    const execute = jest.fn(async () => 'ok');
    const registry = new ToolRegistry();
    registry.register(pingTool(execute));
    const complete = jest.fn(async () => ({
      content: '',
      toolCalls: [{ id: 'c', name: 'ping', arguments: '{"n":"a"}' }],
    }));
    const result = await runnerFor({ complete }, registry, audit).run(baseRun);
    expect(complete).toHaveBeenCalledTimes(4);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      stopped: 'max_rounds',
      text: '',
      rounds: 4,
      deniedCount: 0,
    });
    for (const call of complete.mock.calls as unknown as Array<
      [{ parallelToolCalls: boolean }]
    >) {
      expect(call[0].parallelToolCalls).toBe(false);
    }
  });

  it('runs requested tools in order and redacts the result sent back', async () => {
    const { rows, audit } = memoryAudit();
    const execute = jest.fn(async (args: unknown) => {
      const n = (args as { n: string }).n;
      return n === 'a' ? '0501234567' : 'ok';
    });
    const registry = new ToolRegistry();
    registry.register(pingTool(execute));
    let step = 0;
    const model: AgentModel = {
      complete: jest.fn(async (request) => {
        expect(request.parallelToolCalls).toBe(false);
        step += 1;
        if (step === 1) {
          return {
            content: '',
            toolCalls: [
              { id: '1', name: 'ping', arguments: '{"n":"a"}' },
              { id: '2', name: 'ping', arguments: '{"n":"b"}' },
            ],
          };
        }
        const blob = JSON.stringify(request.messages);
        expect(blob).toContain('<<<UNTRUSTED_DATA>>>');
        expect(blob).not.toContain('0501234567');
        return { content: 'تم', toolCalls: [] };
      }),
    };
    const result = await runnerFor(model, registry, audit).run(baseRun);
    expect(result).toEqual({
      stopped: 'done',
      text: 'تم',
      rounds: 2,
      deniedCount: 0,
    });
    expect(execute.mock.calls.map((call) => (call[0] as { n: string }).n)).toEqual([
      'a',
      'b',
    ]);
    const firstActor = (execute.mock.calls as unknown[][])[0]?.[1];
    expect(firstActor).toEqual(
      expect.objectContaining({ actorId: 'server-user', actorKind: 'user' }),
    );
    expect(rows.map((row) => row.status)).toEqual(['ok', 'ok']);
    expect(JSON.stringify(rows)).not.toContain('0501234567');
    expect(await audit.list('cs')).toHaveLength(2);
  });

  it('does not call the model when the shared daily budget is spent', async () => {
    process.env.SARH_AI_DAILY_TOKEN_BUDGET = '0';
    const { audit } = memoryAudit();
    const complete = jest.fn();
    const result = await runnerFor(
      { complete },
      new ToolRegistry(),
      audit,
    ).run(baseRun);
    expect(complete).not.toHaveBeenCalled();
    expect(result.stopped).toBe('budget');
  });

  it('writes nothing when the audit table is missing, and has no update or delete', async () => {
    const missing = auditOf({});
    const row: AuditAppend = {
      agent: 'tech',
      actorKind: 'system',
      tool: 'ping',
      inputJson: '{}',
      resultSummary: 'ok',
      status: 'ok',
      durationMs: 1,
    };
    await expect(missing.append(row)).resolves.toBeUndefined();
    expect(await missing.list('tech')).toEqual([]);
    const failing = auditOf({
      aiAuditLog: {
        create: async () => {
          const err = new Error('missing relation');
          (err as { code?: string }).code = 'P2021';
          throw err;
        },
        findMany: async () => {
          throw Object.assign(new Error('missing'), { code: 'P2022' });
        },
      },
    });
    await expect(failing.append(row)).resolves.toBeUndefined();
    expect(await failing.list('cs')).toEqual([]);
    expect(
      (missing as unknown as { update?: unknown; delete?: unknown }).update,
    ).toBeUndefined();
    expect(
      (missing as unknown as { delete?: unknown }).delete,
    ).toBeUndefined();
  });

  it('asks the provider for sequential tool calls and does not store the transcript', async () => {
    const create = jest.fn(async () => ({
      choices: [{ message: { content: 'hi', tool_calls: [] } }],
      usage: { total_tokens: 3 },
    }));
    const model = new OpenAiAgentModel(
      { chat: { completions: { create } } } as never,
      'gpt-4o-mini',
      600,
    );
    const signal = new AbortController().signal;
    await model.complete({
      messages: [{ role: 'user', content: 'هلا' }],
      tools: [],
      parallelToolCalls: false,
      signal,
      timeout: 1000,
      maxRetries: 1,
    });
    const [body, options] = create.mock.calls[0] as unknown as [
      { parallel_tool_calls: boolean; store: boolean },
      { signal: AbortSignal },
    ];
    expect(body.parallel_tool_calls).toBe(false);
    expect(body.store).toBe(false);
    expect(options.signal).toBe(signal);
    expect(JSON.stringify(body)).not.toMatch(/sk-/);
  });
});
