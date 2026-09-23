# سرح — لوحة الإدارة (Admin Panel)

منصة إدارة ويب مستقلة عن تطبيق الموبايل. تُنشر على **https://sarhsa.online/admin** وترتبط بـ Backend API.

## التقنيات

| الطبقة | التقنية |
|--------|---------|
| Frontend | Next.js 14 App Router, TailwindCSS, Axios, Recharts |
| Backend | Next.js API (مجلد `../backend`) — JWT, Prisma, PostgreSQL |
| Auth | ADMIN + MODERATOR فقط |

## هيكل المشروع

```
admin-panel/
├── src/
│   ├── app/
│   │   ├── login/              # تسجيل دخول
│   │   └── (dashboard)/        # كل صفحات الإدارة
│   ├── components/
│   │   ├── layout/             # Sidebar, AdminShell
│   │   └── ui/                 # Button, Badge, StatCard, ResourcePage
│   ├── services/               # Axios — api.client, auth, admin, dashboard
│   └── middleware.ts           # حماية المسارات
├── .env.local                  # NEXT_PUBLIC_API_URL
└── README.md
```

## التشغيل المحلي

### 1. Backend
```powershell
cd backend
npm.cmd install
npm.cmd run prisma:generate
npx prisma db push
npm.cmd run create-admin   # إنشاء حساب ADMIN
npm.cmd run dev            # http://localhost:3001
```

### 2. Admin Panel
```powershell
cd admin-panel
npm.cmd install
copy .env.example .env.local
npm.cmd run dev            # http://localhost:3000
```

### 3. الدخول
- افتح http://localhost:3000/login
- استخدم بيانات حساب ADMIN

---

## API Endpoints (Backend)

| المسار | الوصف |
|--------|-------|
| `POST /api/admin/auth/login` | دخول Admin/Moderator |
| `GET /api/admin/auth/me` | الجلسة الحالية |
| `GET /api/admin/dashboard/stats` | إحصائيات Dashboard |
| `GET/PATCH/DELETE /api/admin/users` | المستخدمون |
| `GET/PATCH/DELETE /api/admin/posts` | المنشورات |
| `GET/PATCH/DELETE /api/admin/listings` | الإعلانات |
| `GET/PATCH/DELETE /api/admin/reports` | البلاغات |
| `GET/POST/DELETE /api/admin/livestreams` | البث |
| `GET/PATCH /api/admin/butchers` | الملاحم |
| `GET/PUT /api/admin/settings` | Feature Flags |
| `GET/POST/PATCH/DELETE /api/admin/sections` | المحتوى |

---

## الصلاحيات

| الميزة | ADMIN | MODERATOR |
|--------|-------|-----------|
| Dashboard | ✓ | ✓ |
| Users (view/ban) | ✓ | ✓ |
| تغيير Role | ✓ | ✗ |
| Posts/Listings/Reports | ✓ | ✓ |
| Settings / Sections | ✓ | ✗ |
| حذف User | ✓ | ✗ |

---

## النشر على Railway — خطوة بخطوة

### A) Backend (API) — إن لم يكن منشوراً

1. **Railway → New Project → Deploy from GitHub**
2. Root Directory: `backend`
3. **Variables:**
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=<32+ chars>
   JWT_REFRESH_SECRET=<32+ chars>
   ALLOWED_ORIGINS=https://sarhsa.online,https://www.sarhsa.online
   NODE_ENV=production
   ASSISTANT_ENABLED=true
   REDIS_ENABLED=true
   REDIS_HOST=...
   ```
4. **Build:** `npm run build`
5. **Start:** `npm run start`
6. **Post-deploy:** `npx prisma migrate deploy` أو `db push`

### B) Admin Panel (Frontend)

1. **Railway → New Service** (نفس المشروع أو منفصل)
2. Root Directory: `admin-panel`
3. **Variables:**
   ```
   NEXT_PUBLIC_API_URL=https://sarhsa.online
   ```
4. **Build Command:** `npm run build`
5. **Start Command:** `npm run start`
6. **Domain:** `sarhsa.online/admin` على المضيف الحالي (Hostinger)

### C) ربط sarhsa.online

1. في DNS:
   - `sarhsa.online` → الخادم الإنتاجي
   - لوحة الإدارة: `https://sarhsa.online/admin`
2. في Backend `.env`:
   ```
   ALLOWED_ORIGINS=https://sarhsa.online,https://www.sarhsa.online
   ```
3. تأكد أن Admin Panel يستخدم:
   ```
   NEXT_PUBLIC_API_URL=https://sarhsa.online
   ```

### D) إنشاء أول Admin

```powershell
# على Railway CLI أو محلياً متصل بـ DATABASE_URL الإنتاجي
cd backend
npm run create-admin
```

---

## الأمان (Production)

- HTTPS إلزامي على sarhsa.online
- JWT قصير (15m) + Refresh Token
- Rate limiting على `/api/admin/auth/login`
- Cookie `admin_token` + localStorage للـ Bearer
- MODERATOR لا يصل للإعدادات الحساسة

---

## التوسع

- `src/services/admin.service.ts` — أضف دوال API جديدة
- `backend/src/admin/services/` — Business logic
- `backend/pages/api/admin/` — Routes رفيعة
- `src/app/(dashboard)/` — صفحات UI جديدة
