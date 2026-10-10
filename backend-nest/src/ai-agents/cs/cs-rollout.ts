export type CsAudience = {
  userId: string;
  role?: string | null;
  username?: string | null;
};

export type CsRolloutMode =
  | { kind: 'off' }
  | { kind: 'staff_only' }
  | { kind: 'percent'; percent: number }
  | { kind: 'on' };

/** Unknown or empty values are off. `on` is the only full rollout. */
export function parseCsRollout(raw: string | undefined): CsRolloutMode {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'on') return { kind: 'on' };
  if (value === 'staff_only') return { kind: 'staff_only' };
  const percent = /^percent:(\d{1,3})$/.exec(value);
  if (percent) {
    const n = Number(percent[1]);
    if (n >= 0 && n <= 100) return { kind: 'percent', percent: n };
  }
  return { kind: 'off' };
}

export function currentCsRollout(): CsRolloutMode {
  return parseCsRollout(process.env.AI_CS_AGENT_ENABLED);
}

/** Stable 0–99 bucket so the same user stays in or out of a percent rollout. */
export function stableBucket(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function csRolloutIncludes(mode: CsRolloutMode, user: CsAudience): boolean {
  if (mode.kind === 'off') return false;
  if (mode.kind === 'on') return true;
  if (mode.kind === 'staff_only') {
    return user.role === 'ADMIN' || user.username?.toLowerCase() === 'sarh';
  }
  if (mode.percent <= 0) return false;
  return stableBucket(user.userId) < mode.percent;
}
