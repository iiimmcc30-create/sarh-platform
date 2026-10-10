import { readFileSync } from 'fs';
import { join } from 'path';
import { AiBudgetService } from '../../ai-safety/ai-budget.service';
import { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';
import {
  isCsAgentWriteEnabled,
} from '../../ai-safety/ai-flags';
import { AiAuditService } from '../core/audit.service';
import type { AgentModel, AgentToolCall } from '../core/agent-runner';
import { CsAgentService } from './cs-agent.service';
import type { CsReads } from './cs-tools';
import { CsWriteBudget } from './cs-write-budget';
import { hasExplicitWriteConfirmation } from './cs-write-confirm';
import type { CsWriteApi } from './cs-write-tools';

const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never;

const reads = {
  subscription: jest.fn(),
  verification: jest.fn(),
  fees: jest.fn(),
  payments: jest.fn(),
  tickets: jest.fn(),
  searchFaq: jest.fn(),
} as CsReads;

function memoryAudit() {
  const rows: Array<Record<string, unknown>> = [];
  const audit = new AiAuditService(
    {
      aiAuditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          rows.push(data);
          return data;
        },
        findMany: async () => rows,
      },
    } as never,
    logger,
  );
  return { rows, audit };
}

function enableWrite() {
  process.env.REDIS_ENABLED = 'false';
  process.env.SARH_AI_ENABLED = 'true';
  process.env.AI_CS_AGENT_ENABLED = 'on';
  process.env.AI_CS_AGENT_WRITE_ENABLED = 'on';
  process.env.SARH_AI_DAILY_TOKEN_BUDGET = '1000000';
  process.env.SARH_AI_DAILY_REQUEST_LIMIT = '100';
}

function harness(opts: {
  model: AgentModel;
  tickets: CsWriteApi;
  budget?: CsWriteBudget;
  withBudget?: boolean;
}) {
  const { rows, audit } = memoryAudit();
  const budget = opts.budget ?? new CsWriteBudget();
  const guard = new AiCallGuardService(new AiBudgetService(logger), logger);
  const service = new CsAgentService(
    guard,
    audit,
    reads as never,
    opts.model,
    opts.withBudget === false ? undefined : budget,
    opts.tickets as never,
  );
  return { service, rows, budget };
}

function modelCalling(calls: AgentToolCall[], then = 'تم'): AgentModel {
  let step = 0;
  return {
    complete: async (request) => {
      expect(request.parallelToolCalls).toBe(false);
      const user = request.messages.find((message) => message.role === 'user');
      expect(user?.content).toContain('<<<UNTRUSTED_DATA>>>');
      step += 1;
      if (step === 1) return { content: '', toolCalls: calls };
      expect(JSON.stringify(request.messages)).toContain('<<<UNTRUSTED_DATA>>>');
      return { content: then, toolCalls: [] };
    },
  };
}

describe('customer-service write tools', () => {
  const env = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...env };
    enableWrite();
  });

  afterAll(() => {
    process.env = env;
  });

  it('stays off unless the write flag, the agent flag, and the master switch are on', () => {
    expect(isCsAgentWriteEnabled()).toBe(true);
    process.env.AI_CS_AGENT_WRITE_ENABLED = 'off';
    expect(isCsAgentWriteEnabled()).toBe(false);
    process.env.AI_CS_AGENT_WRITE_ENABLED = 'on';
    process.env.AI_CS_AGENT_ENABLED = 'off';
    expect(isCsAgentWriteEnabled()).toBe(false);
    process.env.AI_CS_AGENT_ENABLED = 'on';
    process.env.SARH_AI_ENABLED = 'false';
    expect(isCsAgentWriteEnabled()).toBe(false);
  });

  it('accepts only an explicit yes from the customer', () => {
    expect(hasExplicitWriteConfirmation('ticket', 'نعم افتح تذكرة')).toBe(true);
    expect(hasExplicitWriteConfirmation('ticket', 'نعم، أفتح تذكرة')).toBe(true);
    expect(hasExplicitWriteConfirmation('note', 'نعم أضف ملاحظة')).toBe(true);
    expect(hasExplicitWriteConfirmation('handoff', 'نعم حولني لموظف')).toBe(true);
    expect(hasExplicitWriteConfirmation('ticket', 'افتح تذكرة')).toBe(false);
    expect(hasExplicitWriteConfirmation('ticket', 'نعم')).toBe(false);
  });

  it.each([
    ['AI_CS_AGENT_WRITE_ENABLED', 'off'],
    ['AI_CS_AGENT_ENABLED', 'off'],
    ['SARH_AI_ENABLED', 'false'],
  ])('%s=%s does not run a write', async (key, value) => {
    process.env[key] = value;
    const tickets: CsWriteApi = {
      createOwnedHelpTicket: jest.fn(),
      addOwnedNote: jest.fn(),
      handoffOwnedTicket: jest.fn(),
    };
    const { service, rows } = harness({
      tickets,
      model: modelCalling([
        {
          id: 'c1',
          name: 'create_support_ticket',
          arguments: '{"category":"ACCOUNT","summary":"ما اقدر ادخل"}',
        },
      ]),
    });
    await expect(
      service.reply({
        userId: 'user-a',
        ticketId: 't1',
        text: 'نعم افتح تذكرة',
      }),
    ).resolves.toEqual({ accepted: false, replyAr: '' });
    expect(tickets.createOwnedHelpTicket).not.toHaveBeenCalled();
    if (key !== 'SARH_AI_ENABLED') {
      expect(rows[0]).toEqual(
        expect.objectContaining({
          status: 'denied',
          tool: 'create_support_ticket',
        }),
      );
    }
  });

  it('does not write without an explicit confirmation, and audits the denial', async () => {
    const tickets: CsWriteApi = {
      createOwnedHelpTicket: jest.fn(),
      addOwnedNote: jest.fn(),
      handoffOwnedTicket: jest.fn(),
    };
    const { service, rows } = harness({
      tickets,
      model: modelCalling([
        {
          id: 'c1',
          name: 'create_support_ticket',
          arguments: '{"category":"ACCOUNT","summary":"ما اقدر ادخل"}',
        },
      ]),
    });
    await service.reply({
      userId: 'user-a',
      ticketId: 't1',
      text: 'ابي تذكرة للحساب',
    });
    expect(tickets.createOwnedHelpTicket).not.toHaveBeenCalled();
    expect(rows[0]).toEqual(
      expect.objectContaining({
        status: 'denied',
        resultSummary: 'confirmation_required',
      }),
    );
  });

  it('creates a ticket only for the server user and redacts the summary', async () => {
    const tickets: CsWriteApi = {
      createOwnedHelpTicket: jest.fn(async () => ({
        ticketNumber: 'SRH-2026-000010',
        duplicate: false,
      })),
      addOwnedNote: jest.fn(),
      handoffOwnedTicket: jest.fn(),
    };
    const { service, rows } = harness({
      tickets,
      model: modelCalling([
        {
          id: 'c1',
          name: 'create_support_ticket',
          arguments:
            '{"category":"ACCOUNT","summary":"رقمي 0501234567","userId":"user-b"}',
        },
      ]),
    });
    await service.reply({
      userId: 'user-a',
      ticketId: 't1',
      text: 'نعم افتح تذكرة رقمي 0501234567',
    });
    expect(tickets.createOwnedHelpTicket).not.toHaveBeenCalled();
    expect(rows[0]).toEqual(
      expect.objectContaining({ status: 'denied', resultSummary: 'actor_from_model' }),
    );
    expect(JSON.stringify(rows)).not.toContain('0501234567');
    expect(JSON.stringify(rows)).not.toContain('user-b');
  });

  it('writes after yes, refuses another user ticket, and records both attempts', async () => {
    const tickets: CsWriteApi = {
      createOwnedHelpTicket: jest.fn(async (_userId: string, _category: string, summary: string) => {
        expect(summary).not.toContain('0501234567');
        return { ticketNumber: 'SRH-2026-000010', duplicate: false };
      }),
      addOwnedNote: jest.fn(async () => ({ ok: false, reason: 'not_owner' as const })),
      handoffOwnedTicket: jest.fn(),
    };
    const { service, rows } = harness({
      tickets,
      model: modelCalling([
        {
          id: 'c1',
          name: 'create_support_ticket',
          arguments: '{"category":"ACCOUNT","summary":"رقمي 0501234567"}',
        },
        {
          id: 'c2',
          name: 'add_ticket_note',
          arguments: '{"ticketNumber":"SRH-2026-000002","body":"متابعة"}',
        },
      ]),
    });
    await service.reply({
      userId: 'user-a',
      ticketId: 't1',
      text: 'نعم افتح تذكرة ونعم أضف ملاحظة',
    });
    expect(tickets.createOwnedHelpTicket).toHaveBeenCalledWith(
      'user-a',
      'ACCOUNT',
      expect.any(String),
    );
    expect(tickets.addOwnedNote).toHaveBeenCalledWith(
      'user-a',
      'SRH-2026-000002',
      'متابعة',
    );
    expect(rows.map((row) => row.status)).toEqual(['ok', 'denied']);
    expect(rows[1]).toEqual(
      expect.objectContaining({ resultSummary: 'not_owner' }),
    );
  });

  it('stops at two writes in one conversation and three in one day', async () => {
    const tickets: CsWriteApi = {
      createOwnedHelpTicket: jest.fn(async () => ({
        ticketNumber: 'SRH-2026-000010',
        duplicate: false,
      })),
      addOwnedNote: jest.fn(async () => ({ ok: true })),
      handoffOwnedTicket: jest.fn(async () => ({ ok: true })),
    };
    const budget = new CsWriteBudget();
    const calls: AgentToolCall[] = [
      {
        id: '1',
        name: 'create_support_ticket',
        arguments: '{"category":"ACCOUNT","summary":"الاول"}',
      },
      {
        id: '2',
        name: 'add_ticket_note',
        arguments: '{"ticketNumber":"SRH-2026-000010","body":"ثاني"}',
      },
      {
        id: '3',
        name: 'request_human_handoff',
        arguments: '{"ticketNumber":"SRH-2026-000010"}',
      },
    ];
    const { service, rows } = harness({
      tickets,
      budget,
      model: modelCalling(calls),
    });
    await service.reply({
      userId: 'user-a',
      ticketId: 'conv-1',
      text: 'نعم افتح تذكرة ونعم أضف ملاحظة ونعم حولني',
    });
    expect(tickets.createOwnedHelpTicket).toHaveBeenCalledTimes(1);
    expect(tickets.addOwnedNote).toHaveBeenCalledTimes(1);
    expect(tickets.handoffOwnedTicket).not.toHaveBeenCalled();
    expect(rows.map((row) => row.resultSummary)).toContain('conversation_limit');

    const third = harness({
      tickets,
      budget,
      model: modelCalling([
        {
          id: 'd',
          name: 'create_support_ticket',
          arguments: '{"category":"TECHNICAL","summary":"ثالث"}',
        },
      ]),
    });
    await third.service.reply({
      userId: 'user-a',
      ticketId: 'conv-2',
      text: 'نعم افتح تذكرة',
    });
    expect(tickets.createOwnedHelpTicket).toHaveBeenCalledTimes(2);

    const blocked = harness({
      tickets,
      budget,
      model: modelCalling([
        {
          id: 'e',
          name: 'create_support_ticket',
          arguments: '{"category":"OTHER","summary":"رابع"}',
        },
      ]),
    });
    await blocked.service.reply({
      userId: 'user-a',
      ticketId: 'conv-3',
      text: 'نعم افتح تذكرة',
    });
    expect(blocked.rows[blocked.rows.length - 1]).toEqual(
      expect.objectContaining({ resultSummary: 'daily_limit', status: 'denied' }),
    );
    expect(tickets.createOwnedHelpTicket).toHaveBeenCalledTimes(2);
  });

  it('does not import payment or subscription services', () => {
    const source = readFileSync(join(__dirname, 'cs-write-tools.ts'), 'utf8');
    expect(source).not.toContain('payments/');
    expect(source).not.toContain('subscriptions/');
    expect(source).toContain("sideEffect: 'write'");
    expect(source).not.toContain("sideEffect: 'action'");
  });
});
