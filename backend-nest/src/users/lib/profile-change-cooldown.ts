export const NAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export const PROFILE_CHANGE_ERRORS = {
  NAME_COOLDOWN: 'NAME_CHANGE_COOLDOWN',
  USERNAME_COOLDOWN: 'USERNAME_CHANGE_COOLDOWN',
  USERNAME_TAKEN: 'username_taken',
} as const;

export type ProfileChangeState = {
  username: string;
  displayName: string;
  arabicName: string;
  nameChangedAt: Date | null;
  usernameChangedAt: Date | null;
};

export type IdentityPatch = {
  username?: string;
  displayName?: string;
  arabicName?: string;
};

export type IdentityPlanData = {
  username?: string;
  displayName?: string;
  arabicName?: string;
  nameChangedAt?: Date;
  usernameChangedAt?: Date;
};

export type IdentityPlan =
  | { ok: true; data: IdentityPlanData }
  | {
      ok: false;
      status: number;
      error: string;
      messageAr: string;
      details: { nextAllowedAt: string };
    };

export function nextAllowedAt(
  changedAt: Date | null | undefined,
  cooldownMs: number,
  now: Date = new Date(),
): Date | null {
  if (!changedAt) return null;
  const next = new Date(changedAt.getTime() + cooldownMs);
  return now.getTime() < next.getTime() ? next : null;
}

export function cooldownPayload(
  nameChangedAt: Date | null | undefined,
  usernameChangedAt: Date | null | undefined,
  now: Date = new Date(),
) {
  return {
    nameChangedAt: nameChangedAt ? nameChangedAt.toISOString() : null,
    usernameChangedAt: usernameChangedAt
      ? usernameChangedAt.toISOString()
      : null,
    nameNextAllowedAt:
      nextAllowedAt(
        nameChangedAt,
        NAME_CHANGE_COOLDOWN_MS,
        now,
      )?.toISOString() ?? null,
    usernameNextAllowedAt:
      nextAllowedAt(
        usernameChangedAt,
        USERNAME_CHANGE_COOLDOWN_MS,
        now,
      )?.toISOString() ?? null,
  };
}

export function planProfileIdentityUpdate(
  current: ProfileChangeState,
  patch: IdentityPatch,
  now: Date = new Date(),
): IdentityPlan {
  const data: IdentityPlanData = {};

  if (patch.username !== undefined) {
    if (patch.username !== current.username) {
      const next = nextAllowedAt(
        current.usernameChangedAt,
        USERNAME_CHANGE_COOLDOWN_MS,
        now,
      );
      if (next) {
        return {
          ok: false,
          status: 409,
          error: PROFILE_CHANGE_ERRORS.USERNAME_COOLDOWN,
          messageAr: 'لا يمكنك تغيير اسم المستخدم الآن',
          details: { nextAllowedAt: next.toISOString() },
        };
      }
      data.username = patch.username;
      data.usernameChangedAt = now;
    }
  }

  const nextDisplay = patch.displayName ?? current.displayName;
  const nextArabic = patch.arabicName ?? current.arabicName;
  const nameRequested =
    patch.displayName !== undefined || patch.arabicName !== undefined;
  if (
    nameRequested &&
    (nextDisplay !== current.displayName || nextArabic !== current.arabicName)
  ) {
    const next = nextAllowedAt(
      current.nameChangedAt,
      NAME_CHANGE_COOLDOWN_MS,
      now,
    );
    if (next) {
      return {
        ok: false,
        status: 409,
        error: PROFILE_CHANGE_ERRORS.NAME_COOLDOWN,
        messageAr: 'لا يمكنك تغيير اسمك الآن',
        details: { nextAllowedAt: next.toISOString() },
      };
    }
    if (patch.displayName !== undefined) data.displayName = patch.displayName;
    if (patch.arabicName !== undefined) data.arabicName = patch.arabicName;
    data.nameChangedAt = now;
  }

  return { ok: true, data };
}
