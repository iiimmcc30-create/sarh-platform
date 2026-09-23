# Release notes

## 2026-09-23

مصدر الحقائق: تدقيق Phase 1 + دمج GitHub لـ PR **#290**.

### ما دخل المستودع (Implemented + unit-tested في Phase 1)

- تشغيل فيديو في الخلاصة (`FeedVideoTile`, `PostMediaGallery`)
- عارض صور/فيديو موحّد (`MediaViewerModal` / `ImageViewerModal`) مع تكبير من موضع الصورة إن وُجد `origin`
- تفاعل الخلاصة: إعجاب، إعادة نشر، إشارة مرجعية، مشاهدات، تعليقات، مشاركة
- تفاعل متفائل في التطبيق (`AppContext` / `usePostFeedActions`)
- نموذج وmigration **`PostBookmark`**: `20260923180000_post_bookmarks`
- انتقالات الشاشات: Fade + Scale (`opacity 0→1`, `scale 0.96→1`, ≈200ms، بدون انزلاق أفقي) عبر `FadeScaleAppear` و`screenLayout`
- اختبارات وحدة جديدة/محدّثة للخلاصة والانتقالات

### Git / CI

- الفرع: `cursor/feed-screen-transitions-161b`
- الالتزام المفحوص محليًا: `0ae66fcaf72578b90762f571bbeb83d03443bb32`
- PR [#290](https://github.com/iiimmcc30-create/sarh.app/pull/290) **MERGED** في 2026-09-23T18:03:08Z إلى الالتزام `62d241690677731791eb287469b399ab2379ed86`
- فحوصات CI الأربعة (backend, frontend, admin-panel, butcher-dashboard): **SUCCESS** حسب GitHub

### قيود صريحة

`PostBookmark` migration exists but production migration state was not verified.

لم يُتحقق في Phase 1: e2e، Playwright، EAS، جهاز Android، Docker الحي، N-Genius الحي، health على `sarhsa.online`، backup/restore.
