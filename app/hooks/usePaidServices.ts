import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  fetchPaidServiceFlags,
  getCachedPaidServiceFlags,
  hasAnyBoostService,
  hasCachedPaidServiceFlags,
  type PaidServiceFlags,
} from '@/services/paidServices';

/** Live paid-service visibility flags from admin settings. */
export function usePaidServices() {
  const [flags, setFlags] = useState<PaidServiceFlags>(() => getCachedPaidServiceFlags());
  const [loading, setLoading] = useState(() => !hasCachedPaidServiceFlags());

  const reload = useCallback(async (force = false) => {
    const showSpinner = !hasCachedPaidServiceFlags();
    if (showSpinner) setLoading(true);
    try {
      const next = await fetchPaidServiceFlags({ force });
      setFlags(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return {
    flags,
    loading,
    reload,
    hasAnyBoostService: hasAnyBoostService(flags),
  };
}
