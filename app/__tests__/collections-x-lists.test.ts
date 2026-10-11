import { readFileSync } from 'fs';
import path from 'path';
import {
  COLLECTION_MARK_COLORS,
  COLLECTION_MARK_SIZE,
  collectionMarkColor,
} from '@/lib/collectionMark';
import { applyCollectionFollow, sortPinnedFirst, togglePinnedId } from '@/lib/collectionLists';
import { LISTS_GLYPH_FRAME, LISTS_GLYPH_LINES, LISTS_ICON_NAME } from '@/lib/listsGlyph';
import {
  collectionFollowersIncluding,
  collectionMembersMeta,
  type Collection,
} from '@/services/collections';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

function sample(id: string, extra: Partial<Collection> = {}): Collection {
  return {
    id,
    name: 'Khobar',
    description: null,
    coverUrl: null,
    type: 'POSTS',
    createdAt: '',
    updatedAt: '',
    owner: {
      id: 'u1',
      username: 'owner',
      displayName: 'مالك',
      arabicName: 'مالك',
      avatar: null,
      verified: false,
    },
    membersCount: 56,
    followersCount: 5800,
    isFollowing: false,
    isOwner: false,
    ...extra,
  };
}

describe('X lists glyph and default mark', () => {
  it('draws a rounded sheet and horizontal rules at the shared stroke', () => {
    expect(LISTS_GLYPH_FRAME).toContain('a2.5 2.5');
    expect(LISTS_GLYPH_LINES).toHaveLength(3);
    expect(src('components/ui/ListsGlyphIcon.tsx')).toContain('ICON_STROKE');
    expect(src('components/ui/FlaticonIcon.tsx')).toContain('LISTS_ICON_NAME');
    expect(LISTS_ICON_NAME).toBe('lists-outline');
    expect(src('components/feature/AppSidebar.tsx')).toContain(`icon: '${LISTS_ICON_NAME}'`);
    expect(src('components/feature/collections/CollectionRow.tsx')).toContain('lists-outline');
  });

  it('picks a stable quiet color from the list id', () => {
    expect(COLLECTION_MARK_SIZE).toBe(48);
    expect(COLLECTION_MARK_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(COLLECTION_MARK_COLORS.length).toBeLessThanOrEqual(8);
    const color = collectionMarkColor('list-khobar');
    expect(COLLECTION_MARK_COLORS).toContain(color);
    expect(collectionMarkColor('list-khobar')).toBe(color);
    expect(new Set(COLLECTION_MARK_COLORS).size).toBe(COLLECTION_MARK_COLORS.length);
    expect(src('lib/collectionMark.ts')).not.toMatch(/gradient|linear-gradient/i);
  });
});

describe('X lists copy and follow/pin behavior', () => {
  it('formats members and mutual followers the way the row reads', () => {
    expect(collectionMembersMeta(56)).toBe('· 56 من الأعضاء');
    expect(collectionFollowersIncluding(5800, 'Samilm')).toBe('5,800 من المتابعين بما في ذلك @Samilm');
    expect(collectionFollowersIncluding(0, '@already')).toBe('0 من المتابعين بما في ذلك @already');
    expect(collectionFollowersIncluding(12, null)).toBe('12 من المتابعين');
  });

  it('follows optimistically and pins to the front without a server column', () => {
    const row = sample('c1');
    const next = applyCollectionFollow(row, true);
    expect(next.isFollowing).toBe(true);
    expect(next.followersCount).toBe(5801);
    expect(applyCollectionFollow(next, true)).toBe(next);
    expect(applyCollectionFollow(next, false).followersCount).toBe(5800);

    const ordered = sortPinnedFirst(
      [sample('a'), sample('b'), sample('c')],
      new Set(['c', 'a']),
    );
    expect(ordered.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(togglePinnedId(['a'], 'b', true)).toEqual(['b', 'a']);
    expect(togglePinnedId(['b', 'a'], 'b', false)).toEqual(['a']);
  });

  it('home and suggested screens match the X structure', () => {
    const home = src('app/collections/index.tsx');
    const suggested = src('app/collections/suggested.tsx');
    const row = src('components/feature/collections/CollectionRow.tsx');
    expect(home).toContain('بحث عن القوائم');
    expect(home).toContain('القوائم التي أنت مدرج بها');
    expect(home).toContain('اكتشاف قوائم جديدة');
    expect(home).toContain('عرض المزيد');
    expect(home).toContain('قوائمك');
    expect(home).toContain("mode={mineRow ? 'mine' : 'discover'}");
    expect(home).toContain('applyCollectionFollow');
    expect(home).toContain('setCollectionPinned');
    expect(home).toContain('useNativeDriver: true');
    expect(home).toContain("safePush('/collections/suggested'");
    expect(suggested).toContain('القوائم المقترحة');
    expect(suggested).toContain('اكتشاف قوائم جديدة');
    expect(suggested).toContain('fetchSuggestedCollections(cursor)');
    expect(suggested).toContain('CollectionCreateFab');
    expect(suggested).not.toContain('react-native-reanimated');
    expect(row).toContain('collectionMembersMeta');
    expect(row).toContain('collectionFollowersIncluding');
    expect(row).toContain("name=\"pin\"");
    expect(row).not.toContain('shadow');
    expect(src('components/feature/collections/CollectionCreateFab.tsx')).toContain('ListsGlyphIcon');
    expect(src('components/feature/collections/CollectionCreateFab.tsx')).not.toContain('shadowOpacity');
    expect(src('app/_layout.tsx')).toContain('name="collections/suggested"');
  });
});
