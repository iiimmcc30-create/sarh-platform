import { existsSync, readFileSync } from 'fs';
import path from 'path';
import {
  COLLECTION_COVER_UPLOAD_FOLDER,
  COLLECTION_EMPTY_FEED_TEXT,
  COLLECTIONS_EMPTY_TEXT,
  COLLECTIONS_NO_MATCH_TEXT,
  COLLECTION_NO_MEMBERS_TEXT,
  COLLECTION_TYPE_LABELS,
  isValidCollectionName,
  MEMBER_OF_SECTION_TITLE,
} from '@/services/collections';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Collections: naming & navigation', () => {
  it('sidebar label is القوائم under bookmarks', () => {
    const panel = src('components/feature/AppSidebar.tsx');
    expect(panel).toContain(
      "{ key: 'collections', icon: 'people-outline', label: 'القوائم', route: '/collections' },",
    );
    // Directly UNDER bookmarks, as its own row.
    expect(panel.indexOf("key: 'collections'")).toBeGreaterThan(panel.indexOf("key: 'bookmarks'"));
    expect(panel.indexOf("key: 'bookmarks'")).toBeGreaterThan(panel.indexOf("key: 'verification'"));
    expect(panel.indexOf("key: 'promote'")).toBeGreaterThan(panel.indexOf("key: 'collections'"));
  });

  it('القوائم stays in the sidebar (the Home quick-access rail is gone)', () => {
    // Lists remain reachable (sidebar row + routes).
    expect(src('components/feature/AppSidebar.tsx')).toContain("route: '/collections'");
    expect(existsSync(path.join(root, 'app/collections/index.tsx'))).toBe(true);
    // Services page/route remains (Search still reaches it).
    expect(src('app/search.tsx')).toContain("{ id: 'services', label: 'الخدمات' }");
    expect(existsSync(path.join(root, 'app/ministry/index.tsx'))).toBe(true);
  });

  it('never uses the old word مجموعات; user-facing copy says قوائم', () => {
    const files = [
      'services/collections.ts',
      'app/collections/index.tsx',
      'app/collections/create.tsx',
      'app/collections/[id]/index.tsx',
      'app/collections/[id]/members.tsx',
      'app/collections/[id]/edit.tsx',
      'components/feature/collections/CollectionRow.tsx',
      'components/feature/collections/CollectionFormScreen.tsx',
      'components/feature/collections/CollectionCreateFab.tsx',
      'components/feature/AppSidebar.tsx',
      'lib/homeQuickAccess.ts',
    ];
    for (const file of files) {
      expect(src(file)).not.toContain('مجموع');
    }
    expect(src('components/feature/AppSidebar.tsx')).toContain("label: 'القوائم'");
    // Quick access now shows المجالس in that slot; Lists stays in the sidebar.
    expect(src('lib/homeQuickAccess.ts')).not.toContain("label: 'القوائم'");
  });
});

describe('Collections: screens & empty states', () => {
  it('registers Expo Router screens', () => {
    const layout = src('app/_layout.tsx');
    for (const name of [
      'collections/index',
      'collections/create',
      'collections/[id]/index',
      'collections/[id]/members',
      'collections/[id]/edit',
    ]) {
      expect(layout).toContain(`name="${name}"`);
      const file = name.includes('[id]')
        ? `app/${name.replace('[id]', '[id]')}.tsx`
        : `app/${name}.tsx`;
      // create.tsx / edit.tsx re-export the form; index/members are screens.
      expect(existsSync(path.join(root, file === 'app/collections/create.tsx' || file === 'app/collections/[id]/edit.tsx' ? file : file))).toBe(true);
    }
    expect(existsSync(path.join(root, 'app/collections/index.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'app/collections/[id]/index.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'app/collections/[id]/members.tsx'))).toBe(true);
  });

  it('ships the required empty texts', () => {
    expect(COLLECTIONS_EMPTY_TEXT).toBe('لا توجد قوائم حتى الآن');
    expect(COLLECTIONS_NO_MATCH_TEXT).toBe('لم نعثر على قوائم مطابقة');
    expect(COLLECTION_NO_MEMBERS_TEXT).toBe('لم تتم إضافة أي حسابات بعد');
    expect(COLLECTION_EMPTY_FEED_TEXT).toBe('لا يوجد محتوى جديد من أعضاء هذه القائمة');
    const index = src('app/collections/index.tsx');
    const detail = src('app/collections/[id]/index.tsx');
    const members = src('app/collections/[id]/members.tsx');
    expect(index).toContain('COLLECTIONS_EMPTY_TEXT');
    expect(index).toContain('COLLECTIONS_NO_MATCH_TEXT');
    expect(detail).toContain('COLLECTION_EMPTY_FEED_TEXT');
    expect(members).toContain('COLLECTION_NO_MEMBERS_TEXT');
  });

  it('collection page keeps feed free of extra cards and reuses PostItem / ListingCard', () => {
    const detail = src('app/collections/[id]/index.tsx');
    expect(detail).toContain('<PostItem post={post}');
    expect(detail).toContain('<ListingCard');
    expect(detail).toContain("variant=\"list\"");
    expect(detail).toContain('listMode="market"');
    expect(detail).toContain("label: 'حظر القائمة'");
    expect(detail).toContain("label: 'إبلاغ عن القائمة'");
    expect(detail).toContain("promptReport('collection'");
    // No Reanimated.
    expect(detail).not.toContain('react-native-reanimated');
    expect(detail).not.toContain('from \'reanimated\'');
  });

  it('create form is RTL Arabic with cover upload via existing helper', () => {
    const form = src('components/feature/collections/CollectionFormScreen.tsx');
    expect(form).toContain('أنشئ قائمتك');
    expect(form).toContain('اسم القائمة');
    expect(form).toContain('أدخل اسم القائمة');
    expect(form).toContain('وصف القائمة');
    expect(form).toContain('اكتب وصفًا مختصرًا للقائمة');
    expect(form).toContain('نوع القائمة');
    expect(form).toContain('COLLECTION_TYPE_LABELS[value]');
    expect(COLLECTION_TYPE_LABELS.POSTS).toBe('منشورات');
    expect(COLLECTION_TYPE_LABELS.ADS).toBe('إعلانات');
    expect(form).toContain('إنشاء قائمة');
    expect(form).toContain('اختيار صورة');
    expect(form).toContain('uploadCollectionCover');
    expect(form).toContain('launchImageLibraryAsync');
    expect(COLLECTION_COVER_UPLOAD_FOLDER).toBe('avatars');
    expect(src('services/collections.ts')).toContain("uploadImageFromUri(token, localUri, COLLECTION_COVER_UPLOAD_FOLDER)");
  });

  it('members setup screen has تخطي and suggested accounts', () => {
    const members = src('app/collections/[id]/members.tsx');
    expect(members).toContain('أضف أعضاء قائمتك');
    expect(members).toContain('اختر الحسابات التي تريد ظهور محتواها في قائمتك.');
    expect(members).toContain('حسابات مقترحة');
    expect(members).toContain('تخطي');
    expect(members).toContain('تمت الإضافة');
  });

  it('list + FAB stay on the Sarh DS (no Reanimated, fixed FAB pattern)', () => {
    const index = src('app/collections/index.tsx');
    const fab = src('components/feature/collections/CollectionCreateFab.tsx');
    expect(index).toContain('اكتشف القوائم الجديدة');
    expect(index).toContain('قوائمي');
    expect(index).toContain('CollectionCreateFab');
    expect(fab).toContain('CreatePostFab');
    expect(fab).toContain("from 'react-native'");
    expect(fab).not.toContain('reanimated');
    expect(isValidCollectionName('أب')).toBe(true);
    expect(isValidCollectionName('أ')).toBe(false);
  });
});

describe('Collections: main feed components untouched', () => {
  it('does not change PostItem or ListingCard', () => {
    // Sanity: the production feed files still export the same components and are not imported from collections for mutation.
    expect(src('components/feature/PostItem.tsx')).toContain('export const PostItem = memo(PostItemComponent');
    expect(src('components/feature/ListingCard.tsx')).toContain('export const ListingCard');
    const postsTab = src('app/(tabs)/posts.tsx');
    expect(postsTab).toContain('<PostItem');
    expect(postsTab).not.toContain('collections');
  });
});

describe('Profile cover', () => {
  const layout = src('components/feature/ProfileScreenLayout.tsx');
  const edit = src('app/profile/edit/index.tsx');
  const ctx = src('contexts/AppContext.tsx');

  it('renders an optional cover across the top with a clean default and an overlapping avatar', () => {
    expect(layout).toContain('coverImage?: string;');
    expect(layout).toContain('testID="profile-cover"');
    expect(layout).toContain('user.coverImage ? (');
    expect(layout).toContain('styles.coverDefault');
    expect(layout).toContain('marginTop: -PROFILE_AVATAR_COVER_OVERLAP');
    // No gradient / shadow on the default cover.
    const coverStyle = layout.slice(layout.indexOf('coverDefault: {'), layout.indexOf('coverDefault: {') + 200);
    expect(coverStyle).not.toMatch(/shadow|Gradient/);
    // Tabs/structure kept.
    expect(layout).toContain('<ProfileTabs');
    expect(src('app/(tabs)/profile.tsx')).toContain('coverImage: me.coverImage,');
    expect(src('app/users/[id].tsx')).toContain('coverImage: profile.coverImage,');
  });

  it('edit screen changes / replaces / removes the cover via the existing upload flow', () => {
    expect(edit).toContain('تغيير غلاف الملف الشخصي');
    expect(edit).toContain('launchImageLibraryAsync');
    expect(edit).toContain("label: 'استبدال الغلاف'");
    expect(edit).toContain("label: 'إزالة الغلاف'");
    expect(edit).toContain('updateMe({ coverImage: next })');
    expect(edit).toContain("await saveCover('')");
    // Existing Cloudinary upload + folder in updateMe; '' clears to null.
    expect(ctx).toMatch(/coverImage = await uploadImageFromUri\([\s\S]*?'avatars',/);
    expect(ctx).toContain("body.coverImage = coverImage === '' ? null : coverImage;");
  });
});

describe('Profile ••• menu: القوائم المضاف إليها', () => {
  it('is a menu entry, not a new profile tab', () => {
    const menu = src('lib/profileCollectionsMenu.ts');
    expect(menu).toContain('MEMBER_OF_TITLE');
    expect(menu).toContain("{ pathname: '/collections', params: { section: 'member-of', userId } }");
    expect(src('app/(tabs)/profile.tsx')).toContain('presentOwnProfileMenu(router, me.id, { profileViewsCount })');
    const visitor = src('app/users/[id].tsx');
    expect(visitor).toContain('MEMBER_OF_MENU_ITEM,');
    expect(visitor).toContain('openMemberOfCollections(router, profile.id)');
    expect(src('lib/profileTabs.ts')).not.toContain('member');
    expect(src('lib/profileTabs.ts')).not.toContain('القوائم');
  });

  it('opens the SAME Collections page (no separate page), scrolled to «المضاف إليها»', () => {
    const index = src('app/collections/index.tsx');
    expect(existsSync(path.join(root, 'app/collections/member-of.tsx'))).toBe(false);
    expect(src('app/_layout.tsx')).not.toContain('collections/member-of');
    expect(src('lib/profileCollectionsMenu.ts')).toContain("{ pathname: '/collections', params: { section: 'member-of', userId } }");
    expect(index).toContain("params.section === COLLECTIONS_MEMBER_OF_SECTION");
    expect(index).toContain('scrollToIndex');
    // Same row design for all three sections; one paginated endpoint, no per-row requests.
    expect(index).toContain("section: 'memberOf'");
    expect(index).toContain('fetchMemberOfCollections(memberUserId)');
    expect(index).toContain('fetchMemberOfCollections(memberUserId, memberOfCursor)');
    expect(MEMBER_OF_SECTION_TITLE).toBe('المضاف إليها');
    // Profile screens never fetch it themselves (loads only on the Collections page).
    expect(src('app/(tabs)/profile.tsx')).not.toContain('fetchMemberOfCollections');
    expect(src('app/users/[id].tsx')).not.toContain('fetchMemberOfCollections');
    expect(src('services/collections.ts')).toContain('/member-of/');
  });

  it('hides «المضاف إليها» entirely when the user is a member of none (no title, no empty text)', () => {
    const index = src('app/collections/index.tsx');
    const block = index.slice(index.indexOf('if (memberOf.length > 0) {'), index.indexOf('const memberOfHeaderIndex'));
    expect(block).toContain('MEMBER_OF_SECTION_TITLE');
    expect(block).not.toContain("kind: 'empty'");
    // The header row is only pushed inside the non-empty guard.
    expect(index.match(/MEMBER_OF_SECTION_TITLE/g)).toHaveLength(2);
    expect(src('services/collections.ts')).not.toContain('MEMBER_OF_EMPTY_TEXT');
  });
});
