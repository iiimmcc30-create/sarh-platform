import { filterBlockedComments } from './block-filter';

describe('filterBlockedComments', () => {
  const rows = [
    { id: 'c1', authorId: 'a' },
    { id: 'c2', authorId: 'blocked' },
    { id: 'r1', authorId: 'a', parentId: 'c2' },
    { id: 'r2', authorId: 'blocked', parentId: 'c1' },
    { id: 'r3', authorId: 'b', parentId: 'c1' },
  ];

  it('drops comments by blocked accounts and replies under them', () => {
    expect(filterBlockedComments(rows, ['blocked']).map((c) => c.id)).toEqual([
      'c1',
      'r3',
    ]);
  });

  it('returns the same list when nothing is blocked', () => {
    expect(filterBlockedComments(rows, [])).toBe(rows);
  });
});
