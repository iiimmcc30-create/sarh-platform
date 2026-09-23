# App Settings (Admin)

## 1. Business Purpose

Key-value **feature flags and system configuration** stored in `AppSetting`, editable only by `ADMIN` in the admin panel.

**Who uses it:** Platform administrators. Mobile app does **not** fetch settings via a public API in current code.

---

## 2. Frontend Flow

### Admin panel

| Screen | Path |
|--------|------|
| Settings | `admin-panel/src/app/(dashboard)/settings/page.tsx` |

**UI:** Lists all settings; boolean toggles flip via `PUT`; non-boolean shown as JSON.

**Access:** Page shows warning if user role ≠ `ADMIN`.

---

## 3. API Flow

| Method | URL | Roles |
|--------|-----|-------|
| GET | `/api/admin/settings` | **ADMIN** |
| PUT | `/api/admin/settings` | **ADMIN** |

**PUT body:** `{ key, value, labelAr?, category? }` — upsert by unique `key`.

---

## 4. Backend Flow

```
AdminController → AdminService.listSettings / updateSetting
  → AdminRepository (Prisma AppSetting)
```

`updateSettingSchema` validates key + value (unknown JSON).

---

## 5. Database

| Model | Fields |
|-------|--------|
| `AppSetting` | `key` (unique), `value` (Json), `labelAr`, `category` (default `general`) |

No seed file referenced in docs; settings may be empty until seeded manually.

---

## 6. Socket

Not used.

---

## 7. Notifications

Not used.

---

## 8. Redis

Not used. **Missing:** runtime cache of settings for API feature gates.

---

## 9. BullMQ

Not used.

---

## 10. Security

- `MODERATOR` cannot read or write settings (`@Roles('ADMIN')`)
- No public read endpoint — flags cannot be toggled by clients

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Settings not consumed by backend | Stored but no `AppSettingService` in domain modules found |
| Mobile cannot read flags | No `/api/settings` public route |
| JSON value not validated per key | Generic `z.unknown()` |

---

## 12. Production Readiness: **50%**

Admin CRUD exists. **Missing:** consumer API, backend enforcement of flags, seed documentation.

**Main files:** `backend-nest/src/admin/admin.controller.ts`, `admin-panel/.../settings/page.tsx`
