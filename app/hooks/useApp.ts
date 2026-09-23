// Powered by OnSpace.AI
import { useContext } from 'react';
import { AppContext, AppUserContext } from '@/contexts/AppContext';

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/** User identity only — does not subscribe to feed/like updates. */
export function useAppUser() {
  const ctx = useContext(AppUserContext);
  if (!ctx) throw new Error('useAppUser must be used within AppProvider');
  return ctx;
}
