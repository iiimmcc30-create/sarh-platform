import { sarhListingShareUrl } from '@/constants/sarhOfficial';

/**
 * "Message the seller" from a listing: an editable composer draft only.
 * The conversation itself is the general 1:1 with the listing owner — no
 * listing id is attached to the thread or the navigation params.
 */
export function buildListingChatDraft(listing: {
  id: string;
  title?: string | null;
  arabicTitle?: string | null;
}): string {
  const title = (listing.arabicTitle || listing.title || '').trim();
  const link = sarhListingShareUrl(listing.id);
  return title
    ? `مرحباً، أستفسر عن إعلانك «${title}»\n${link}`
    : `مرحباً، أستفسر عن إعلانك\n${link}`;
}

/** Navigation params for opening the 1:1 chat with a listing's seller. */
export function sellerChatParams(input: {
  listing: { id: string; title?: string | null; arabicTitle?: string | null };
  seller: { id: string; arabicName?: string | null; avatar?: string | null };
  draftMessage?: string;
}): Record<string, string> {
  const draft = input.draftMessage?.trim() || buildListingChatDraft(input.listing);
  return {
    receiverId: input.seller.id,
    receiverName: input.seller.arabicName ?? '',
    receiverAvatar: input.seller.avatar ?? '',
    draftMessage: draft,
  };
}
