import { SidebarMenuItem } from '@/components/ui/SidebarMenuItem';
import { useTheme } from '@/hooks/useTheme';
import type { OfficialService } from '@/services/officialServices';
import { Linking } from 'react-native';

type OfficialServiceCardProps = {
  service: OfficialService;
  showDivider?: boolean;
};

export function OfficialServiceCard({
  service,
  showDivider = true,
}: OfficialServiceCardProps) {
  const { colors } = useTheme();

  const openService = async () => {
    const url = service.externalUrl?.trim();
    if (!url) return;
    await Linking.openURL(url);
  };

  return (
    <SidebarMenuItem
      icon={service.icon || 'link-outline'}
      title={service.title}
      subtitle={service.description}
      colors={colors}
      showDivider={showDivider}
      onPress={() => void openService()}
      accessibilityLabel={`طلب خدمة ${service.title}`}
    />
  );
}
