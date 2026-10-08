// Is the signed-in user eligible for the one-week free Blue+ trial?
// Used for a quiet hint on the subscriptions entry point (sidebar). One small
// request, cached for the session (refreshed after 10 minutes or when the
// trial starts / a subscription is bought).
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchFreeTrial } from '@/services/verification';

const TTL_MS = 10 * 60 * 1000;
let cached: { userKey: string; eligible: boolean; at: number } | null = null;
let inflight: Promise<boolean> | null = null;

export function invalidateFreeTrialEligibility(): void {
  cached = null;
}

async function load(userKey: string): Promise<boolean> {
  if (cached && cached.userKey === userKey && Date.now() - cached.at < TTL_MS) {
    return cached.eligible;
  }
  if (!inflight) {
    inflight = fetchFreeTrial()
      .then((trial) => {
        const eligible = !!trial?.eligible;
        cached = { userKey, eligible, at: Date.now() };
        return eligible;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useFreeTrialEligibility(): boolean {
  const { isAuthenticated, user } = useAuth();
  const userKey = isAuthenticated ? (user?.id ?? 'me') : '';
  const [eligible, setEligible] = useState(
    () => !!userKey && cached?.userKey === userKey && cached.eligible,
  );

  useEffect(() => {
    if (!userKey) return;
    let alive = true;
    void load(userKey).then((value) => {
      if (alive) setEligible(value);
    });
    return () => {
      alive = false;
    };
  }, [userKey]);

  // Signed out: never eligible (no request is made).
  return userKey ? eligible : false;
}
