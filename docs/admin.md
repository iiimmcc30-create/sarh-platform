# Admin API & Panel

## 1. Business Purpose

Staff dashboard for moderating users, content, butcher shops, applications, orders, plans, CMS sections, and system settings.

**Who uses it:** `ADMIN` and `MODERATOR` roles via `admin-panel/` (Next.js). Some endpoints are `ADMIN`-only.

---

## 2. Frontend Flow

### Admin panel (`admin-panel/`)

| Page | Path | API |
|------|------|-----|
| Dashboard | `(dashboard)/page.tsx` | `GET /admin/dashboard/stats` |
| Users | `users/page.tsx`, `users/[id]/page.tsx` | users CRUD |
| Posts | `posts/page.tsx` | hide/delete posts |
| Listings | `listings/page.tsx` | suspend listings |
| Reports | `reports/page.tsx`, `reports/[id]/page.tsx` | support tickets |
| Live | `live/page.tsx` | stop/delete streams |
| Butchers | `butchers/page.tsx` | butcher management |
| Applications | `applications/page.tsx` | approve/reject butcher apps |
| Orders | `orders/page.tsx`, `orders/[id]/page.tsx` | order oversight |
| Plans | `plans/page.tsx`, `plans/[id]/page.tsx` | `admin/plans` controller |
| Content | `content/page.tsx` | CMS sections |
| Settings | `settings/page.tsx` | `AppSetting` (ADMIN only) |
| Login | `login/page.tsx` | `POST /admin/auth/login` |

**Nav:** `components/layout/Sidebar.tsx`

**Auth:** `admin_access_token` + cookie; `middleware.ts` checks cookie presence.

**Services:** `services/admin.service.ts`, `services/auth.service.ts`, `services/api.client.ts`

---

## 3. API Flow

Base: `/api/admin` — `admin.controller.ts`  
Plans (separate): `/api/admin/plans` — `admin-plans.controller.ts`

### Auth

| Method | URL | Roles | Notes |
|--------|-----|-------|-------|
| POST | `/admin/auth/login` | Public | Rate limit `auth` |
| GET | `/admin/auth/me` | ADMIN, MODERATOR | |

### Dashboard

| GET | `/admin/dashboard/stats` | ADMIN, MODERATOR |

### Users

| GET | `/admin/users` | List (pagination, search) |
| GET | `/admin/users/:id` | Detail |
| PATCH | `/admin/users/:id` | `isActive`, `verified`, `role` |
| DELETE | `/admin/users/:id` | **ADMIN only** — soft purge |

### Posts

| GET | `/admin/posts` | Query `hidden=true\|false` |
| PATCH | `/admin/posts/:id` | `{ isHidden: boolean }` |
| DELETE | `/admin/posts/:id` | Soft delete + `isHidden: true` |

### Listings

| GET | `/admin/listings` | Query `status` |
| PATCH | `/admin/listings/:id` | `{ status }` incl. `suspended` |
| DELETE | `/admin/listings/:id` | Soft delete + `suspended` |

### Reports (SupportTicket)

| GET | `/admin/reports` | List |
| GET | `/admin/reports/:id` | Detail |
| PATCH | `/admin/reports/:id` | status, priority, adminNotes |
| DELETE | `/admin/reports/:id` | Soft delete |

### Livestreams

| GET | `/admin/livestreams` | List |
| POST | `/admin/livestreams/:id` | Stop stream |
| DELETE | `/admin/livestreams/:id` | Soft delete |

### Butchers & orders

| GET | `/admin/butchers` | List |
| GET | `/admin/butchers/:id` | Detail + user |
| PATCH | `/admin/butchers/:id` | `type`, `isOpen` |
| GET | `/admin/orders` | Filters: status, butcherId, customerId, dates |
| GET | `/admin/orders/:id` | Detail |

### Settings (ADMIN only)

| GET | `/admin/settings` | All `AppSetting` rows |
| PUT | `/admin/settings` | Upsert by `key` |

### Content sections

| GET | `/admin/sections` | List CMS sections |
| POST | `/admin/sections` | Create |
| PATCH | `/admin/sections/:id` | Update |
| DELETE | `/admin/sections/:id` | Soft delete |

### Butcher applications

| GET | `/admin/butcher-applications` | List |
| GET | `/admin/butcher-applications/:id` | Detail |
| POST | `/admin/butcher-applications/:id/approve` | Create butcher profile |
| POST | `/admin/butcher-applications/:id/reject` | Reject with reason |
| POST | `/admin/butcher-applications/:id/comment` | Staff timeline comment |

### Maintenance

| POST | `/admin/cleanup` | Public with `x-cron-secret` or staff JWT |

### Plans (`admin-plans.controller.ts`)

| GET/POST/PATCH/DELETE | `/admin/plans/*` | Plan catalog + features |

---

## 4. Backend Flow

```
AdminController → AdminService → AdminRepository (Prisma)
Butcher applications → ButcherApplicationAdminService (separate module)
Plans → AdminPlansController → Plans module
```

Staff login validates `role IN (ADMIN, MODERATOR)` and issues JWT like mobile auth.

---

## 5. Database

Touches: `User`, `Post`, `Listing`, `SupportTicket`, `LiveStream`, `Butcher`, `ButcherOrder`, `AppSetting`, `ContentSection`, `ButcherApplication`, and related entities.

---

## 6. Socket

`useAdminOrderSocket` listens for `order:updated` on admin panel (optional).

---

## 7. Notifications

Admin actions trigger butcher-application notifications via `ButcherApplicationNotificationsService`. Other admin actions do not auto-notify users in all cases.

---

## 8. Redis

Session blacklist checked on `adminMe`. No admin-specific cache.

---

## 9. BullMQ

`POST /admin/cleanup` triggered by worker cron — not enqueued via BullMQ.

---

## 10. Security

- `@Roles('ADMIN' | 'MODERATOR')` + `RolesGuard`
- Delete user: ADMIN only
- Settings: ADMIN only
- Cleanup: `CRON_SECRET` header or Bearer staff token
- Admin panel middleware: cookie-only (does not re-validate JWT server-side per request)

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Moderator can approve butcher apps | Same role as ADMIN on application endpoints |
| No audit log table | Timeline on applications only |
| Panel middleware weak | Cookie presence only |

---

## 12. Production Readiness: **87%**

Broad admin surface is implemented. Gaps: stricter moderator RBAC, audit trail, public ticket creation API missing.

**Main files:** `backend-nest/src/admin/`, `admin-panel/src/app/(dashboard)/`
