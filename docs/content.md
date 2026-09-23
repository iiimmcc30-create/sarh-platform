# Content Sections & Sarh Policies (CMS)

## 1. Business Purpose

`ContentSection` stores bilingual CMS blocks for static in-app content. The five Sarh legal policies are seeded and managed here:

1. `terms` — الشروط والأحكام  
2. `privacy` — سياسة الخصوصية  
3. `intellectual-property` — الملكية الفكرية  
4. `content-ads` — سياسة المحتوى والإعلانات  
5. `payment-refund` — سياسة الدفع والاسترداد  

`ContentSectionVersion` stores previous snapshots for restore.

**Who uses it:** Admin/moderator via admin panel. Mobile reads **published** sections via public API, with local Arabic fallback if API unavailable.

> Internal note: policies must be legally reviewed before final publication. Replace placeholders like `[اسم الكيان القانوني]` and `[البريد الإلكتروني الرسمي]`.

---

## 2. Frontend Flow

### Admin panel

| Screen | Path |
|--------|------|
| Policies CMS | `admin-panel/src/app/(dashboard)/content/page.tsx` |

**Actions:** seed five policies, edit, save, publish, unpublish, archive, list versions, restore version.

### Mobile

| Screen | Path |
|--------|------|
| More tab | `app/app/(tabs)/more.tsx` |
| Policies hub | `app/app/info/policies.tsx` |
| Policy detail | `app/app/info/policy/[slug].tsx` |

Fallback copy: `app/constants/sarhPolicies.ts`. Client: `app/services/content.ts`.

---

## 3. API Flow

### Public

| Method | URL | Auth |
|--------|-----|------|
| GET | `/api/content/sections` | Public |
| GET | `/api/content/sections/:slug` | Public |
| POST | `/api/content/seed-policies` | ADMIN, MODERATOR |

### Staff — `/api/admin/sections`

| Method | URL | Notes |
|--------|-----|-------|
| GET | `/admin/sections` | Includes recent versions |
| POST | `/admin/sections` | Create + v1 snapshot |
| PATCH | `/admin/sections/:id` | Save draft; snapshots previous |
| POST | `/admin/sections/:id/publish` | Set active + publishedAt + version |
| POST | `/admin/sections/:id/unpublish` | Set inactive |
| GET | `/admin/sections/:id/versions` | Full history |
| POST | `/admin/sections/:id/restore/:versionId` | Restore snapshot (unpublished) |
| DELETE | `/admin/sections/:id` | Soft archive |

---

## 4. Database

| Model | Fields |
|-------|--------|
| `ContentSection` | slug, titleAr/En, bodyAr/En, isActive, sortOrder, publishedAt, updatedByName, deletedAt |
| `ContentSectionVersion` | sectionId, version, title/body, isPublished, createdByName, createdAt |
