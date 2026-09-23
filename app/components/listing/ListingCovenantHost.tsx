import { SarhListingCovenantModal } from '@/components/listing/SarhListingCovenantModal';
import {
  closeListingCovenant,
  isListingCovenantOpen,
  subscribeListingCovenant,
} from '@/lib/listingCovenant';
import { useEffect, useState } from 'react';

export function ListingCovenantHost() {
  const [visible, setVisible] = useState(isListingCovenantOpen());

  useEffect(() => {
    return subscribeListingCovenant(() => {
      setVisible(isListingCovenantOpen());
    });
  }, []);

  return (
    <SarhListingCovenantModal
      visible={visible}
      onAccept={() => closeListingCovenant(true)}
      onClose={() => closeListingCovenant(false)}
    />
  );
}
