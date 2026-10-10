import { Injectable } from '@nestjs/common';
import type { AiUsage } from '../../ai-safety/ai-call-guard.service';
import { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';
import { aiMaxOutputTokens } from '../../ai-safety/ai-flags';
import { AiAuditService, type AuditStatus } from './audit.service';
import {
  scopeAllows,
  ToolRegistry,
  type ToolActor,
  type ToolScope,
} from './tool-registry';
import { wrapUntrusted } from './untrusted';

export const AGENT_MAX_ROUNDS = 4;

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type AgentTurnMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
};

export type AgentModelRequest = {
  messages: AgentTurnMessage[];
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  parallelToolCalls: false;
  signal: AbortSignal;
  timeout: number;
  maxRetries: number;
};

export type AgentModelResponse = {
  content: string;
  toolCalls: AgentToolCall[];
  usage?: AiUsage;
};

export interface AgentModel {
  complete(request: AgentModelRequest): Promise<AgentModelResponse>;
}

export type AgentRunInput = {
  agent: 'cs' | 'tech';
  actorKind: ToolActor['actorKind'];
  actorId?: string;
  scope: ToolScope;
  model: string;
  messages: AgentTurnMessage[];
};

export type AgentRunResult = {
  stopped: 'done' | 'max_rounds' | 'disabled' | 'budget' | 'timeout' | 'error';
  text: string;
  rounds: number;
};

/**
 * At most four model calls. Tool calls on the fourth call are not executed
 * and do not start another round. Only sideEffect "none" runs.
 */
@Injectable()
export class AgentRunner {
  constructor(
    private readonly guard: AiCallGuardService,
    private readonly audit: AiAuditService,
    private readonly registry: ToolRegistry,
    private readonly model: AgentModel,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const messages = input.messages.map((message) => ({ ...message }));
    const tools = this.registry.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
    let text = '';
    for (let round = 1; round <= AGENT_MAX_ROUNDS; round++) {
      const inputChars = JSON.stringify(messages).length;
      const guarded = await this.guard.run({
        feature: input.agent,
        model: input.model,
        inputChars,
        maxOutputTokens: aiMaxOutputTokens(),
        call: async (controls) => {
          const value = await this.model.complete({
            messages,
            tools,
            parallelToolCalls: false,
            signal: controls.signal,
            timeout: controls.timeout,
            maxRetries: controls.maxRetries,
          });
          return { value, usage: value.usage };
        },
      });
      if (!guarded.ok) {
        return { stopped: guarded.reason, text, rounds: round };
      }
      const turn = guarded.value;
      text = turn.content ?? '';
      const calls = turn.toolCalls ?? [];
      if (!calls.length || round === AGENT_MAX_ROUNDS) {
        return {
          stopped: calls.length ? 'max_rounds' : 'done',
          text,
          rounds: round,
        };
      }
      for (const call of calls) {
        const content = await this.executeTool(call, input);
        messages.push({ role: 'tool', content, toolCallId: call.id });
      }
    }
    return { stopped: 'max_rounds', text, rounds: AGENT_MAX_ROUNDS };
  }

  private async executeTool(
    call: AgentToolCall,
    input: AgentRunInput,
  ): Promise<string> {
    const started = Date.now();
    const actor: ToolActor = {
      actorKind: input.actorKind,
      actorId: input.actorId,
      scope: input.scope,
    };
    const finish = async (
      status: AuditStatus,
      rawInput: string,
      summary: string,
    ) => {
      await this.audit.append({
        agent: input.agent,
        actorKind: input.actorKind,
        actorId: input.actorId,
        tool: call.name || 'unknown',
        inputJson: rawInput,
        resultSummary: summary,
        status,
        durationMs: Date.now() - started,
      });
    };

    let parsed: unknown;
    try {
      parsed = JSON.parse(call.arguments || '{}');
    } catch {
      await finish('denied', call.arguments || '', 'invalid_json');
      return wrapUntrusted('denied');
    }
    const rawInput = JSON.stringify(stripActorFields(parsed));
    if (containsActorField(parsed)) {
      await finish('denied', rawInput, 'actor_from_model');
      return wrapUntrusted('denied');
    }
    const tool = this.registry.get(call.name);
    if (!tool) {
      await finish('denied', rawInput, 'unknown_tool');
      return wrapUntrusted('denied');
    }
    const checked = tool.schema.safeParse(parsed);
    if (!checked.success) {
      await finish('denied', rawInput, 'invalid_input');
      return wrapUntrusted('denied');
    }
    if (!scopeAllows(input.scope, tool.scope)) {
      await finish('denied', rawInput, 'scope');
      return wrapUntrusted('denied');
    }
    if (tool.sideEffect !== 'none') {
      await finish('denied', rawInput, 'side_effect');
      return wrapUntrusted('denied');
    }
    try {
      const value = await tool.execute(checked.data, actor);
      const raw =
        typeof value === 'string' ? value : JSON.stringify(value ?? null);
      await finish('ok', rawInput, raw);
      return wrapUntrusted(raw);
    } catch {
      await finish('error', rawInput, 'tool_error');
      return wrapUntrusted('error');
    }
  }
}

function stripActorFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripActorFields);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'userId' || key === 'actorId') continue;
    out[key] = stripActorFields(child);
  }
  return out;
}

function containsActorField(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsActorField);
  for (const [key, child] of Object.entries(value)) {
    if (key === 'userId' || key === 'actorId') return true;
    if (containsActorField(child)) return true;
  }
  return false;
}
