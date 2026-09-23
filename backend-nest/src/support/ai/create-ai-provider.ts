import { HeuristicAiProvider } from './heuristic-ai.provider';
import { OpenAiAiProvider } from './openai-ai.provider';
import type { AiProvider } from './ai-provider';
import { LoggerService } from '../../common/services/logger.service';

export function createAiProvider(logger: LoggerService): AiProvider {
  const provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const apiKey = (
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ''
  ).trim();
  const model = (
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini'
  ).trim();

  if ((provider === 'openai' || provider === '') && apiKey) {
    return new OpenAiAiProvider(apiKey, model, logger);
  }
  return new HeuristicAiProvider();
}
