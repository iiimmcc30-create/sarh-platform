import { setCurrentPathname } from '@/lib/safeNavigate';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';

/** Keeps safeNavigate aware of the active pathname (no UI). */
export function NavigationPathTracker() {
  const pathname = usePathname();

  useEffect(() => {
    setCurrentPathname(pathname);
  }, [pathname]);

  return null;
}
