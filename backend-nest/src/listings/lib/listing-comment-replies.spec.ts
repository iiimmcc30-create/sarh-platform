import { listingReplyNotifyTarget } from './listing-comment-replies';

describe('listingReplyNotifyTarget', () => {
  it('notifies the parent author on a reply', () => {
    expect(listingReplyNotifyTarget('a', 'b')).toBe('a');
  });
  it('does not notify on self-replies or top-level comments', () => {
    expect(listingReplyNotifyTarget('a', 'a')).toBeNull();
    expect(listingReplyNotifyTarget(null, 'a')).toBeNull();
    expect(listingReplyNotifyTarget(undefined, 'a')).toBeNull();
  });
});
