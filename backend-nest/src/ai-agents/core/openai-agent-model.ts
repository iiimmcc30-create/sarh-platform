import OpenAI from 'openai';
import type {
  AgentModel,
  AgentModelRequest,
  AgentModelResponse,
} from './agent-runner';

type ChatClient = {
  chat: {
    completions: {
      create: (
        body: Record<string, unknown>,
        options: { signal: AbortSignal; timeout: number; maxRetries: number },
      ) => Promise<{
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
        usage?: AgentModelResponse['usage'];
      }>;
    };
  };
};

/** Builds the request the runner is allowed to send. No stored transcripts. */
export function agentCompletionBody(
  model: string,
  request: AgentModelRequest,
  maxOutputTokens: number,
): Record<string, unknown> {
  return {
    model,
    temperature: 0.2,
    max_completion_tokens: maxOutputTokens,
    store: false,
    parallel_tool_calls: false,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content,
      tool_call_id: message.toolCallId,
    })),
    tools: request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })),
  };
}

export class OpenAiAgentModel implements AgentModel {
  constructor(
    private readonly client: ChatClient,
    private readonly model: string,
    private readonly maxOutputTokens: number,
  ) {}

  async complete(request: AgentModelRequest): Promise<AgentModelResponse> {
    if (request.parallelToolCalls !== false) {
      throw new Error('parallel_tool_calls_required_false');
    }
    let completion: Awaited<ReturnType<ChatClient['chat']['completions']['create']>>;
    try {
      completion = await this.client.chat.completions.create(
        agentCompletionBody(this.model, request, this.maxOutputTokens),
        {
          signal: request.signal,
          timeout: request.timeout,
          maxRetries: request.maxRetries,
        },
      );
    } catch (err) {
      const wrapped = new Error('agent_model_failed');
      wrapped.name = err instanceof Error ? err.name : 'AgentModelError';
      throw wrapped;
    }
    const message = completion.choices?.[0]?.message;
    return {
      content: message?.content ?? '',
      toolCalls: (message?.tool_calls ?? []).map((call, index) => ({
        id: call.id || `call-${index}`,
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '{}',
      })),
      usage: completion.usage,
    };
  }
}

/** Uses the environment key only. No key is written into source. */
export function createOpenAiAgentModel(
  maxOutputTokens: number,
): OpenAiAgentModel | null {
  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim();
  if (!apiKey) return null;
  const model = (
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini'
  ).trim();
  return new OpenAiAgentModel(
    new OpenAI({ apiKey }) as unknown as ChatClient,
    model,
    maxOutputTokens,
  );
}

export class UnavailableAgentModel implements AgentModel {
  async complete(): Promise<AgentModelResponse> {
    const err = new Error('agent_model_unavailable');
    err.name = 'AgentModelUnavailable';
    throw err;
  }
}
