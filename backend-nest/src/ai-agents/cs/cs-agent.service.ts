import { Inject, Injectable, Optional } from '@nestjs/common';
import { AiCallGuardService } from '../../ai-safety/ai-call-guard.service';
import { isCsAgentWriteEnabled } from '../../ai-safety/ai-flags';
import { AGENT_MODEL } from '../ai-agents.module';
import {
  AgentRunner,
  type AgentModel,
  type AgentTurnMessage,
} from '../core/agent-runner';
import { AiAuditService } from '../core/audit.service';
import { ToolRegistry } from '../core/tool-registry';
import { wrapUntrusted } from '../core/untrusted';
import { CS_AGENT_SYSTEM_PROMPT } from './cs-prompt';
import { CsAccountReads } from './cs-account-reads';
import { buildCsTools } from './cs-tools';
import { replyGroundedInTools } from './money-guard';
import { CsWriteBudget } from './cs-write-budget';
import { buildCsWriteTools, CS_WRITE_API, type CsWriteApi } from './cs-write-tools';

export type CsReply =
  | { accepted: true; replyAr: string }
  | { accepted: false; replyAr: '' };

/**
 * One customer-service turn. The actor id is the server user id.
 * A reply that cites a number or date the tools did not return is rejected.
 */
@Injectable()
export class CsAgentService {
  constructor(
    private readonly guard: AiCallGuardService,
    private readonly audit: AiAuditService,
    private readonly reads: CsAccountReads,
    @Inject(AGENT_MODEL) private readonly model: AgentModel,
    @Optional() private readonly writeBudget?: CsWriteBudget,
    @Optional() @Inject(CS_WRITE_API) private readonly writes?: CsWriteApi,
  ) {}

  async reply(input: {
    userId: string;
    text: string;
    ticketId?: string;
  }): Promise<CsReply> {
    const seen: unknown[] = [];
    const registry = new ToolRegistry();
    const tools = buildCsTools(this.reads);
    if (isCsAgentWriteEnabled() && this.writes && this.writeBudget) {
      tools.push(
        ...buildCsWriteTools({
          customerText: input.text,
          ticketId: input.ticketId || input.userId,
          tickets: this.writes,
          budget: this.writeBudget,
        }),
      );
    }
    for (const tool of tools) {
      registry.register({
        ...tool,
        execute: async (args, actor) => {
          const value = await tool.execute(args, actor);
          seen.push(value);
          return value;
        },
      });
    }
    const messages: AgentTurnMessage[] = [
      { role: 'system', content: CS_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: wrapUntrusted(input.text) },
    ];
    const result = await new AgentRunner(
      this.guard,
      this.audit,
      registry,
      this.model,
    ).run({
      agent: 'cs',
      actorKind: 'user',
      actorId: input.userId,
      scope: 'self',
      model: 'cs-agent',
      messages,
      allowWrite: isCsAgentWriteEnabled(),
    });
    if (result.stopped !== 'done' || result.deniedCount > 0) {
      return { accepted: false, replyAr: '' };
    }
    const replyAr = result.text.trim();
    if (!replyAr || !replyGroundedInTools(replyAr, seen)) {
      return { accepted: false, replyAr: '' };
    }
    return { accepted: true, replyAr };
  }
}
