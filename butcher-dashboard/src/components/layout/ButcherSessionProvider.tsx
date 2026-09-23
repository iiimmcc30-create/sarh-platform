'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { persistButcher, getStoredButcher, getStoredUser, tryRestoreSession, type AuthUser, clearSession, NO_BUTCHER_MESSAGE } from '@/services/auth.service';
import { withButcherBase } from '@/constants/butcherBasePath';
import { fetchMyButcher, type ButcherProfile } from '@/services/butcher.service';

type SessionValue = {
  user: AuthUser | null;
  butcher: ButcherProfile | null;
  refreshButcher: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useButcherSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useButcherSession must be used within ButcherSessionProvider');
  }
  return ctx;
}

export function ButcherSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [butcher, setButcher] = useState<ButcherProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    const status = await tryRestoreSession();
    if (status === 'none' || status === 'cleared') {
      window.location.assign(withButcherBase('/login'));
      return;
    }
    if (status === 'no_butcher') {
      setError(NO_BUTCHER_MESSAGE);
      setReady(true);
      return;
    }
    setUser(getStoredUser());
    setButcher(getStoredButcher());
    setReady(true);
  };

  useEffect(() => {
    void load();
  }, []);

  const refreshButcher = useCallback(async () => {
    const profile = await fetchMyButcher();
    persistButcher(profile);
    setButcher(profile);
  }, []);

  const value = useMemo(
    () => ({ user, butcher, refreshButcher }),
    [user, butcher, refreshButcher],
  );

  if (!ready) {
    return <LoadingState label="جارٍ التحقق من صلاحية الملحمة..." />;
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorState
          message={error}
          onRetry={() => {
            clearSession();
            window.location.assign(withButcherBase('/login'));
          }}
        />
      </div>
    );
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
