// PDPL consent log: once per app session, signed-in users who have not yet
// accepted the CURRENT privacy policy version (server-side ConsentRecord) are
// asked to accept it. New accounts are recorded at signup, so they are never
// asked; everyone else is asked again only when the policy version changes.
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { authFetch } from '@/services/authFetch';
import { API_BASE } from '@/services/api';

type ConsentStatus = { policyVersion: string; accepted: boolean };

async function fetchConsentStatus(): Promise<ConsentStatus | null> {
  try {
    const res = await authFetch(`${API_BASE}/api/privacy/consent`, {}, 15_000);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const data = json?.data;
    if (!data || typeof data.accepted !== 'boolean') return null;
    return { policyVersion: String(data.policyVersion ?? ''), accepted: data.accepted };
  } catch {
    return null;
  }
}

async function acceptConsent(policyVersion: string): Promise<void> {
  await authFetch(
    `${API_BASE}/api/privacy/consent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ policyVersion }),
    },
    15_000,
  ).catch(() => undefined);
}

export function usePrivacyConsentPrompt(isAuthenticated: boolean) {
  const router = useRouter();
  const askedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || askedRef.current) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchConsentStatus().then((status) => {
        if (cancelled || !status || status.accepted || askedRef.current) return;
        askedRef.current = true;
        Alert.alert(
          'سياسة الخصوصية',
          'نحتاج موافقتك على سياسة الخصوصية الحالية لسرح: ما البيانات التي نجمعها، وأين تُحفظ، ولماذا، وكم مدة الاحتفاظ بها.',
          [
            {
              text: 'قراءة السياسة',
              onPress: () => router.push('/info/privacy' as never),
            },
            {
              text: 'أوافق',
              style: 'default',
              onPress: () => void acceptConsent(status.policyVersion),
            },
          ],
          { cancelable: false },
        );
      });
    }, 4_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, router]);
}
