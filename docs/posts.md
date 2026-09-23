# Posts (الخلاصة والتفاعل)

التحديث: 2026-09-23 وفق المتحكم الحالي وملفات الخلاصة التي دخلت مع PR #290.

**Implemented** في الكود. اختبارات وحدة الخلاصة/الوسائط شُغّلت في Phase 1.  
سلوك الإنتاج ومهاجرة `PostBookmark` على القاعدة الحية: **غير محقَّقين**.

---

## 1. الغرض

منشورات اجتماعية (نص عربي، صور، فيديو) مع إعجاب، إعادة نشر، تعليقات، مشاهدة، إشارة مرجعية، ومشاركة من العميل.

الملفات الأساسية:

- API: `backend-nest/src/posts/posts.controller.ts` · `posts.service.ts`
- عميل: `app/contexts/AppContext.tsx` · `app/lib/usePostFeedActions.ts` · `PostItem` · `PostMediaGallery` · `FeedVideoTile`
- عارض: `MediaViewerModal` · `ImageViewerModal`

---

## 2. العميل

| السطح | الدور |
|--------|--------|
| تبويب المنشورات | `app/app/(tabs)/posts.tsx` — `usePostFeedActions` + تسجيل مشاهدة عند ظهور العنصر (~60٪ / 800ms) |
| تفاصيل المنشور | `app/app/post/[id].tsx` |
| إنشاء/تعديل | `app/app/create/post.tsx` |
| معرض الوسائط | صور + فيديو؛ فتح العارض من الصورة المصغّرة (`measureMediaOrigin`) |
| عارض ملء الشاشة | تكبير من `origin` إن وُجد، وإلا fade+scale 0.96 |

تفاعل متفائل: `toggleLike` / `toggleRepost` / `toggleBookmark` في `AppContext` مع مجموعات `likedPosts` · `repostedPosts` · `bookmarkedPosts`.

المشاركة: `sharePost` في `app/lib/postInteractions.ts` (عميل).

---

## 3. API (`/api/posts`)

| Method | Path | Auth على الدالة |
|--------|------|------------------|
| GET | `/posts` | OptionalAuth |
| POST | `/posts` | JWT |
| GET | `/posts/:id` | OptionalAuth |
| PUT | `/posts/:id` | JWT |
| DELETE | `/posts/:id` | JWT |
| GET | `/posts/:id/comments` | OptionalAuth |
| POST | `/posts/:id/comments` | JWT |
| DELETE | `/posts/:id/comments/:commentId` | JWT |
| POST | `/posts/:id/like` | JWT |
| POST | `/posts/:id/repost` | JWT |
| POST | `/posts/:id/bookmark` | JWT |
| POST | `/posts/:id/view` | OptionalAuth |

---

## 4. قاعدة البيانات

| النموذج | الدور |
|---------|--------|
| `Post` | المحتوى، الوسائط، العدادات، إخفاء/حذف ناعم |
| `PostLike` | فريد `(postId, userId)` |
| `PostRepost` | فريد `(postId, userId)` |
| `PostComment` | تعليقات |
| `PostBookmark` | فريد `(postId, userId)` — migration `20260923180000_post_bookmarks` |

Prisma schema validation نجحت في Phase 1. **لم يُطبَّق migrate على أي قاعدة.**

---

## 5. الوسائط

- المعرض يجمع صور المنشور والفيديو (`collectPostMedia`).
- التشغيل المضمّن: `FeedVideoTile` + إيقاف عند الخروج (`feedVideoPlayback`).
- العارض: صور فقط → `ImageViewerModal`؛ خليط/فيديو → `MediaViewerModal`.

---

## 6. Socket

لا أحداث Socket مخصّصة للمنشورات في هذا التوثيق. التحديث بسحب REST.

---

## 7. التحقق

| | |
|--|--|
| Implemented | نعم |
| App/backend unit tests ذات الصلة | ضمن نتائج Phase 1 |
| e2e / إنتاج | NOT RUN |
