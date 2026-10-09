// Shared listing link: sarhsa.online/l/<id> (sarhListingShareUrl) → the listing screen.
import { Redirect, useLocalSearchParams } from 'expo-router';
import { shareLinkId } from '@/lib/shareLinks';

export default function SharedListingLink() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = shareLinkId(params.id);
  if (!id) return <Redirect href="/" />;
  return <Redirect href={{ pathname: '/listing/[id]', params: { id } }} />;
}
