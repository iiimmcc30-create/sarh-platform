/**
 * Runtime switches and limits for Sarh's AI features («مساعد سرح» and the
 * Knowledge Center summarizer). Read from the environment on every call so
 * tests can toggle them; in production change the env and restart.
 *
 * Every switch defaults to ON (current behaviour). Only an explicit
 * false / 0 / off / no / disabled turns it off.
 */

import { currentCsRollout } from '../ai-agents/cs/cs-rollout';

const OFF_VALUES = new Set(['false', '0', 'off', 'no', 'disabled']);

export function envFlag(name: string, defaultValue = true): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return !OFF_VALUES.has(raw);
}

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** SARH_AI_ENABLED — master switch: no new model (OpenAI) calls anywhere when off. */
export const AI_CONTROL_FLAGS = [
  'SARH_AI_ENABLED',
  'SARH_ASSISTANT_ENABLED',
  'AI_CS_AGENT_ENABLED',
  'AI_CS_AGENT_WRITE_ENABLED',
  'AI_TECH_AGENT_ENABLED',
] as const;

export type AiControlFlag = (typeof AI_CONTROL_FLAGS)[number];

const runtimeOff = new Set<string>();

/** Process-local copy of the Redis kill switch. Env off always wins. */
export function setRuntimeFlagOff(name: string, off: boolean): void {
  if (off) runtimeOff.add(name);
  else runtimeOff.delete(name);
}

export function isRuntimeFlagOff(name: string): boolean {
  return runtimeOff.has(name);
}

export function clearRuntimeFlagsForTests(): void {
  runtimeOff.clear();
}

function explicitOn(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/** What the environment allows. A runtime switch cannot widen this. */
export function envAllowsFlag(name: AiControlFlag): boolean {
  if (name === 'SARH_AI_ENABLED') return envFlag('SARH_AI_ENABLED');
  if (name === 'SARH_ASSISTANT_ENABLED') return envFlag('SARH_ASSISTANT_ENABLED');
  if (name === 'AI_CS_AGENT_ENABLED') return currentCsRollout().kind !== 'off';
  return explicitOn(name);
}

export function isAiEnabled(): boolean {
  return envAllowsFlag('SARH_AI_ENABLED') && !isRuntimeFlagOff('SARH_AI_ENABLED');
}

/**
 * SARH_ASSISTANT_ENABLED — «مساعد سرح». The assistant is active only when
 * BOTH this and the master switch are on; otherwise help requests go
 * straight to the human support team.
 */
export function isAssistantEnabled(): boolean {
  return (
    isAiEnabled() &&
    envAllowsFlag('SARH_ASSISTANT_ENABLED') &&
    !isRuntimeFlagOff('SARH_ASSISTANT_ENABLED')
  );
}

/** SARH_AI_EMAIL_ALERTS_ENABLED — e-mail to support when a ticket is handed to a human. */
export function isAiEmailAlertsEnabled(): boolean {
  return envFlag('SARH_AI_EMAIL_ALERTS_ENABLED');
}

/**
 * AI_CS_AGENT_ENABLED — customer-service agent with read-only tools.
 * Default OFF. Only an explicit on/true/1/yes enables it. Anything else,
 * including an unset variable, keeps the current «مساعد سرح» path.
 */
export function isCsAgentEnabled(): boolean {
  return (
    envAllowsFlag('AI_CS_AGENT_ENABLED') &&
    !isRuntimeFlagOff('AI_CS_AGENT_ENABLED')
  );
}

/**
 * AI_CS_AGENT_WRITE_ENABLED — let the customer-service agent open a ticket,
 * add a note, or hand off to a human. Default OFF. Requires both the
 * customer-service agent and the master AI switch.
 */
export function isCsAgentWriteEnabled(): boolean {
  if (!isAiEnabled() || !isCsAgentEnabled()) return false;
  return (
    envAllowsFlag('AI_CS_AGENT_WRITE_ENABLED') &&
    !isRuntimeFlagOff('AI_CS_AGENT_WRITE_ENABLED')
  );
}

/** AI_TECH_AGENT_ENABLED — read-only tech agent. Default OFF. */
export function isTechAgentEnabled(): boolean {
  if (!isAiEnabled()) return false;
  return (
    envAllowsFlag('AI_TECH_AGENT_ENABLED') &&
    !isRuntimeFlagOff('AI_TECH_AGENT_ENABLED')
  );
}

/** Hard deadline for one model request, retries included (ms). */
export function aiTimeoutMs(): number {
  return envInt('SARH_AI_TIMEOUT_MS', 15_000, 1_000, 60_000);
}

/** SDK retries inside the deadline above. */
export function aiMaxRetries(): number {
  return envInt('SARH_AI_MAX_RETRIES', 1, 0, 3);
}

/** Output cap per support-assistant call. */
export function aiMaxOutputTokens(): number {
  return envInt('SARH_AI_MAX_OUTPUT_TOKENS', 600, 50, 4_000);
}

/** Shared daily token budget (input + output) for all AI calls, Riyadh day. 0 blocks all calls. */
export function aiDailyTokenBudget(): number {
  return envInt('SARH_AI_DAILY_TOKEN_BUDGET', 1_000_000, 0, 1_000_000_000);
}

/** Shared daily request cap for all AI calls, Riyadh day. 0 blocks all calls. */
export function aiDailyRequestLimit(): number {
  return envInt('SARH_AI_DAILY_REQUEST_LIMIT', 2_000, 0, 10_000_000);
}

/**
 * Extra daily token cap for one feature. Defaults to the shared budget, so
 * an unset value does not raise or bypass the shared ceiling.
 */
export function aiFeatureTokenBudget(
  feature: 'support_assistant' | 'knowledge_summarizer' | 'other',
): number {
  if (feature === 'support_assistant') {
    return envInt(
      'SARH_AI_ASSISTANT_DAILY_TOKEN_BUDGET',
      aiDailyTokenBudget(),
      0,
      1_000_000_000,
    );
  }
  if (feature === 'knowledge_summarizer') {
    return envInt(
      'SARH_AI_SUMMARIZER_DAILY_TOKEN_BUDGET',
      aiDailyTokenBudget(),
      0,
      1_000_000_000,
    );
  }
  return aiDailyTokenBudget();
}

/** Extra daily request cap for one feature. Same default rule as tokens. */
export function aiFeatureRequestLimit(
  feature: 'support_assistant' | 'knowledge_summarizer' | 'other',
): number {
  if (feature === 'support_assistant') {
    return envInt(
      'SARH_AI_ASSISTANT_DAILY_REQUEST_LIMIT',
      aiDailyRequestLimit(),
      0,
      10_000_000,
    );
  }
  if (feature === 'knowledge_summarizer') {
    return envInt(
      'SARH_AI_SUMMARIZER_DAILY_REQUEST_LIMIT',
      aiDailyRequestLimit(),
      0,
      10_000_000,
    );
  }
  return aiDailyRequestLimit();
}
