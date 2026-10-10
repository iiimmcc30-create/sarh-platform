/**
 * Runtime switches and limits for Sarh's AI features («مساعد سرح» and the
 * Knowledge Center summarizer). Read from the environment on every call so
 * tests can toggle them; in production change the env and restart.
 *
 * Every switch defaults to ON (current behaviour). Only an explicit
 * false / 0 / off / no / disabled turns it off.
 */

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
export function isAiEnabled(): boolean {
  return envFlag('SARH_AI_ENABLED');
}

/**
 * SARH_ASSISTANT_ENABLED — «مساعد سرح». The assistant is active only when
 * BOTH this and the master switch are on; otherwise help requests go
 * straight to the human support team.
 */
export function isAssistantEnabled(): boolean {
  return isAiEnabled() && envFlag('SARH_ASSISTANT_ENABLED');
}

/** SARH_AI_EMAIL_ALERTS_ENABLED — e-mail to support when a ticket is handed to a human. */
export function isAiEmailAlertsEnabled(): boolean {
  return envFlag('SARH_AI_EMAIL_ALERTS_ENABLED');
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
