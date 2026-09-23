// Powered by OnSpace.AI
// SAFAT — Market Tab (السوق)
import { MarketListingsFeed } from '@/components/market/MarketListingsFeed';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';

/** Light-mode market keeps the grey page tone so listing cards read as cards. */
const MARKET_PAGE_LIGHT = '#F8F9FA';

export default function MarketScreen() {
  const { scheme } = useTheme();

  return (
    <Screen
      edges={['top']}
      style={scheme === 'light' ? { backgroundColor: MARKET_PAGE_LIGHT } : undefined}
    >
      <ScreenBody scroll={false} gutter={false} bottomInset="tabBar">
        <MarketListingsFeed variant="market" />
      </ScreenBody>
    </Screen>
  );
}
