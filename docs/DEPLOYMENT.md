# Deployment

> **Two-server production (App Server + Data Server):** see [`deployment/two-server.md`](deployment/two-server.md)
> — `docker-compose.app.yml` / `docker-compose.data.yml`, private network or WireGuard, firewall, backups, cut-over and rollback plan.

Production deployment and live infrastructure were not re-verified during Phase 1.

ما يلي مأخوذ من ملفات المستودع (`README.md` السابق، `docker-compose.prod.yml`، `scripts/hostinger/`). **لم يُنفَّذ** أي نشر أو `docker compose up` أو فحص حي في Phase 1 أو Phase 2.

---

## ما يوثّقه المستودع

- المضيف المقصود: **Hostinger VPS**
- النطاق الرسمي: **https://getsarh.com**
- `sarhsa.online` يبقى للشهادات والـ API والمقابس والرفع وملفات الروابط العميقة وصفحات عودة الدفع؛ صفحات الويب تُحوَّل إلى `getsarh.com`
- المسار الشائع على الخادم في السكربتات: `/opt/sarh` أو `SARH_ROOT`
- Compose الإنتاج:  
  `docker compose -f docker-compose.prod.yml -f docker-compose.prod.ssl.yml --env-file .env.production up -d`
- لا تستخدم `docker-compose.yml` على الإنتاج — الملف نفسه يحذّر أن ذلك يقطع شبكة nginx↔socket.

### خدمات Compose الإنتاج

`postgres` · `redis` · `api` · `worker` · `socket` · `admin` · nginx (عبر ملف الـ SSL الإضافي)

الصور: Postgres 18 Alpine · Redis 7 Alpine · backend من `backend-nest/Dockerfile` · لوحات Next من Dockerfiles الخاصة.

### الصحة (معرَّفة في الكود / compose — غير مستدعاة حيًا هنا)

| الهدف | المسار |
|--------|--------|
| لiveness API | `GET /api/health` |
| readiness API | `GET /api/health/ready` |
| Socket | `GET /health` على :3002 |
| Admin | `GET /admin/login` داخل الحاوية |

README يذكر أن Nginx يمرّر `GET /health` إلى الـ API. GitHub keep-alive ما زال يضرب `https://sarhsa.online/api/health` لأن الواجهة تُخدم هناك أيضًا؛ المسار المكافئ على النطاق الرسمي هو `https://getsarh.com/api/health`. **لم يُتحقق من ذلك في Phase 1.**

---

## Migrations (تشغيلية، غير منفَّذة هنا)

entrypoint الـ API موثَّق لتشغيل `npx prisma migrate deploy` عند الإقلاع.  
بديل يدوي موثَّق في README:

```bash
cd backend-nest
npx prisma migrate deploy
```

Phase 1/2 **لم تنفّذ** `migrate` أو `migrate deploy` أو `db push`.  
ترحيل المبالغ إلى `DECIMAL(12,2)`: `20261017120000_payment_amounts_decimal` (يُطبَّق بـ `prisma migrate deploy` عند إقلاع الـ API ما لم يُضبط `SKIP_MIGRATIONS=true`). يحافظ على الهللات عبر `ROUND(col::numeric, 2)`.

لا تشغّل `migrate reset` ضد الإنتاج (تحذير README).

---

## سكربتات Hostinger (موجودة في Git)

تحت `scripts/hostinger/`:

| ملف | الدور الموثَّق في الملف نفسه |
|-----|------------------------------|
| `validate-env.sh` | فحص متغيرات (قيم مقنَّعة) |
| `04-deploy.sh` | نشر |
| `05-verify.sh` | تحقق بعد النشر |
| `06-setup-ssl.sh` | SSL |
| `07-repair-ssl.sh` | إصلاح HTTPS |
| `09-backup-postgres.sh` | نسخة Postgres |
| `10-restore-postgres.sh` | استعادة (يتطلب كتابة `RESTORE`) |
| `env.production.example` | قالب إنتاج |

لم تُشغَّل هذه السكربتات في Phase 1.

---

## Backup / restore

المجال موثَّق (dump محلي + SHA256 + مثال cron في `backup-cron.example`).  
المزامنة الخارجية (rclone/S3) مذكورة كإعداد على الـ VPS **خارج Git**.  
**يحتاج تحققًا فعليًا** — لم يُجرَ في Phase 1.

---

## ما لا يُعامل كإنتاج حالي

- `render.yaml`
- `railway.json`
- `Dockerfile` الجذري (تعليقه يشير لـ Railway)
- `backend-nest/.env.example` ما زال يذكر Supabase/Render في التعليقات
