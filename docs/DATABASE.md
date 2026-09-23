# Database

Prisma schema validation was verified, but migrations were NOT deployed to a database during Phase 1.

---

## المحرّك

- PostgreSQL عبر Prisma (`backend-nest/prisma/schema.prisma`).
- `migration_lock.toml`: `provider = "postgresql"`.
- عميل/أداة مثبتة في Phase 1: Prisma **5.22.0**.
- `npx prisma validate`: نجح.

---

## أسماء القواعد الظاهرة في المستودع

| السياق | الاسم |
|--------|--------|
| `docker-compose.prod.yml` الافتراضي | `POSTGRES_DB` أو `sarh` |
| `docker-compose.yml` المحلي | `sarouh` |
| GitHub CI | `sarouh_test` (Postgres 16) |

لم يُتصل بأي من هذه القواعد في Phase 1 لغرض migrate.

---

## Migrations

- عدد المجلدات تحت `backend-nest/prisma/migrations/` (عدا القفل): **51**.
- أحدث مجلد في الشجرة المفحوصة: **`20260923180000_post_bookmarks`**  
  ينشئ جدول `PostBookmark` (`postId` + `userId` فريد، فهارس، FK إلى `Post` و`User` مع `ON DELETE CASCADE`).
- النموذج موجود أيضًا في `schema.prisma`.
- الترتيب الزمني للأسماء: `20250706_*` ثم سلسلة `202607*` / `202608*` / `202609*`.

أوامر موثَّقة **ولم تُنفَّذ هنا**:

```bash
npx prisma migrate deploy
npx prisma migrate status
```

entrypoint الـ API في الإنتاج موثَّق لتشغيل `migrate deploy` عند الإقلاع. حالة الإنتاج بعد دمج PR #290 **غير محققة**.

---

## Seed (ملفات موجودة — لم تُشغَّل)

| ملف | سكربت package.json إن وُجد |
|-----|------------------------------|
| `backend-nest/scripts/seed-plans.ts` | `npm run seed:plans` |
| `backend-nest/scripts/seed-admin.ts` | — |
| `backend-nest/scripts/seed-official-services.ts` | — |
| `backend-nest/scripts/ensure-e2e-admin.ts` | `npm run ensure:e2e-admin` |
| `backend-nest/scripts/ensure-free-plans.js` | — |

---

## ما لم يُتحقق

- إنشاء قاعدة فارغة وتطبيق كل الـ 51 migration
- تطابق `_prisma_migrations` مع الإنتاج
- seeds
- النسخ الاحتياطي/الاستعادة على VPS
