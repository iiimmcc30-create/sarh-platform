import { groupCollectionSocialProof } from './collection-social-proof';

describe('collection social proof', () => {
  it('keeps three member avatars and the first mutual follower per list', () => {
    const proof = groupCollectionSocialProof(
      ['a', 'b'],
      [
        { collectionId: 'a', user: { id: '1', username: 'one', avatar: null } },
        { collectionId: 'a', user: { id: '2', username: 'two', avatar: 'x' } },
        { collectionId: 'a', user: { id: '3', username: 'three', avatar: null } },
        { collectionId: 'a', user: { id: '4', username: 'four', avatar: null } },
        { collectionId: 'b', user: { id: '9', username: '', avatar: null } },
      ],
      [
        { collectionId: 'a', username: 'Samilm' },
        { collectionId: 'a', username: 'later' },
        { collectionId: 'missing', username: 'nope' },
      ],
    );
    expect(proof.get('a')).toEqual({
      previewMembers: [
        { id: '1', username: 'one', avatar: null },
        { id: '2', username: 'two', avatar: 'x' },
        { id: '3', username: 'three', avatar: null },
      ],
      mutualFollower: { username: 'Samilm' },
    });
    expect(proof.get('b')).toEqual({ previewMembers: [], mutualFollower: null });
    expect(proof.has('missing')).toBe(false);
  });
});
