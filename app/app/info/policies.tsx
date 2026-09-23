import { SettingsMenuScreen, type SettingsMenuItem } from '@/components/ui/SettingsMenuScreen';
import { SARH_POLICIES } from '@/constants/sarhPolicies';
import { fetchPublicPolicies } from '@/services/content';
import { useEffect, useState } from 'react';

const ICONS: Record<string, string> = {
  terms: 'file-document-outline',
  privacy: 'lock-outline',
  'intellectual-property': 'shield-checkmark',
  'content-ads': 'megaphone-outline',
  'payment-refund': 'receipt-outline',
};

const FALLBACK_ITEMS: SettingsMenuItem[] = SARH_POLICIES.map((p) => ({
  icon: ICONS[p.slug] ?? 'file-document-outline',
  label: p.titleAr,
  route: `/info/policy/${p.slug}`,
}));

export default function PoliciesHubScreen() {
  const [items, setItems] = useState<SettingsMenuItem[]>(FALLBACK_ITEMS);

  useEffect(() => {
    let alive = true;
    void fetchPublicPolicies().then((list) => {
      if (!alive || !list.length) return;
      setItems(
        list.map((s) => ({
          icon: ICONS[s.slug] ?? 'file-document-outline',
          label: s.titleAr,
          route: `/info/policy/${s.slug}`,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <SettingsMenuScreen
      title="السياسات والشروط"
      items={items}
    />
  );
}
