import type { ZodType } from 'zod';

export type ToolScope = 'public' | 'self' | 'admin';
export type ToolSideEffect = 'none' | 'write' | 'action';

export type ToolActor = {
  actorKind: 'user' | 'system' | 'admin';
  actorId?: string;
  scope: ToolScope;
};

/** JSON Schema for a flat object. No extra properties. */
export function objectJsonSchema(
  properties: Record<string, { type: 'string' | 'number' | 'boolean' }>,
  required: string[],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

/** A write tool refused the call. `code` is a short token, never user text. */
export class ToolDenied extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ToolDenied';
  }
}

export type AgentTool = {
  name: string;
  description: string;
  schema: ZodType;
  parameters: Record<string, unknown>;
  scope: ToolScope;
  sideEffect: ToolSideEffect;
  execute: (args: unknown, actor: ToolActor) => Promise<unknown>;
};

const SCOPE_RANK: Record<ToolScope, number> = {
  public: 0,
  self: 1,
  admin: 2,
};

export function scopeAllows(actor: ToolScope, tool: ToolScope): boolean {
  return SCOPE_RANK[actor] >= SCOPE_RANK[tool];
}

/** In-memory tool list. The production module registers nothing. */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }
}
