import { Module } from '@nestjs/common';
import { AiCallGuardService } from '../ai-safety/ai-call-guard.service';
import { aiMaxOutputTokens } from '../ai-safety/ai-flags';
import { AiSafetyModule } from '../ai-safety/ai-safety.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentRunner, type AgentModel } from './core/agent-runner';
import { AiAuditService } from './core/audit.service';
import {
  createOpenAiAgentModel,
  UnavailableAgentModel,
} from './core/openai-agent-model';
import { ToolRegistry } from './core/tool-registry';

export const AGENT_MODEL = Symbol('AGENT_MODEL');

/**
 * Shared agent core. Not imported by AppModule or SupportModule: nothing in
 * the product calls it yet, and the tool registry is empty.
 */
@Module({
  imports: [AiSafetyModule, PrismaModule],
  providers: [
    AiAuditService,
    { provide: ToolRegistry, useFactory: () => new ToolRegistry() },
    {
      provide: AGENT_MODEL,
      useFactory: (): AgentModel =>
        createOpenAiAgentModel(aiMaxOutputTokens()) ??
        new UnavailableAgentModel(),
    },
    {
      provide: AgentRunner,
      useFactory: (
        guard: AiCallGuardService,
        audit: AiAuditService,
        registry: ToolRegistry,
        model: AgentModel,
      ) => new AgentRunner(guard, audit, registry, model),
      inject: [AiCallGuardService, AiAuditService, ToolRegistry, AGENT_MODEL],
    },
  ],
  exports: [AgentRunner, ToolRegistry, AiAuditService],
})
export class AiAgentsModule {}
