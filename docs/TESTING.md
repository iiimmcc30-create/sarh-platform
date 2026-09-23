# Testing

نتائج **Phase 1** فقط (2026-09-23). آلة التدقيق: Node **v22.14.0** · npm **10.9.7**.  
التشغيل من نسخ معزولة في `/tmp` بعد `npm ci` من الـ lockfiles.

اختبارات backend / admin / butcher التي تقرأ ملفات Nginx فشلت أولًا لأن النسخة المعزولة لم تضم `nginx/`. بعد نسخ `nginx/` إلى جوار التطبيقات نجحت تلك الـ suites. الشجرة الأصلية في المستودع تحتوي `nginx/`.

---

## Verified

| Area | Command / suite | Result |
|------|-----------------|--------|
| Backend install + build | `npm ci` → `npm run build` (`nest build`) | PASS |
| App install + typecheck | `npm ci` → `npm run typecheck` | PASS |
| Admin install + build | `npm ci` → `NODE_ENV=production next build` | PASS |
| Butcher install + typecheck/build | `npm ci` → `tsc --noEmit` + `next build` | PASS |
| Prisma | `npx prisma validate` | schema valid |
| Backend lint | `npm run lint` | 0 errors, 7 warnings |
| Admin lint | `npm run lint` | 0 errors, 3 warnings |
| Butcher lint | `npm run lint` | 0 errors |
| App Jest | 76 suites / 777 tests | PASS |
| Backend Jest | 121 suites / 879 tests | PASS |
| Admin Jest | 12 suites | PASS |
| Butcher Jest | 14 suites | PASS |
| GitHub CI on PR #290 | backend, frontend, admin-panel, butcher-dashboard | COMPLETED SUCCESS (via `gh pr view`) |

أوامر المشروع (كما في `package.json`):

```bash
cd backend-nest && npm test && npm run lint && npm run build
cd app && npm test && npm run typecheck
cd admin-panel && npm test && npm run lint && npm run build
cd butcher-dashboard && npm test && npm run typecheck && npm run lint && npm run build
```

`admin-panel` في CI الجذر (`.github/workflows/ci.yml`) يشغّل lint + build **دون** `npm test`. الاختبارات أعلاه شُغّلت يدويًا في Phase 1.

---

## Not verified

| Area | Why |
|------|-----|
| Backend e2e (`backend-nest/test/**`) | NOT RUN |
| App Playwright (`app/e2e/`) | NOT RUN |
| Admin Playwright (`admin-panel/e2e/`) | NOT RUN |
| `expo lint` | NOT RUN في Phase 1 |
| EAS build / تثبيت Android | NOT RUN |
| Docker production runtime | NOT RUN |
| Live Socket.IO | NOT RUN |
| Live N-Genius | NOT RUN |
| `https://sarhsa.online/api/health` | NOT RUN |
| `prisma migrate deploy` | NOT RUN |
| Backup / restore | NOT RUN |

---

## تمييز الحالات

- **Implemented:** ملف اختبار موجود في Git.
- **Tested:** صف في جدول Verified أعلاه.
- **Production Verified:** نجاح CI على PR #290 حسب GitHub فقط — ليس إعادة تشغيل الإنتاج.
