# Butcher Applications

## 1. Business Purpose

Onboarding flow for users applying to become verified butcher shops: draft → submit → staff review → approve (creates `Butcher`) or reject.

**Who uses it:** Mobile applicants; admin/moderator reviewers in admin panel and mobile admin flows.

---

## 2. Frontend Flow

### Mobile (`app/`)

| Screen | Path |
|--------|------|
| Apply / my application | `app/butchers/apply.tsx`, `my-application` |
| Edit draft | `app/butchers/application/edit/[id].tsx` |
| Admin review (mobile) | `app/butchers/application/[id].tsx` |

**Components:** `components/butcherApplication/*`

**Validation:** `lib/butcherApplicationValidation.ts`, `lib/butcherApplicationLabels.ts`

### Admin panel

| Screen | Path |
|--------|------|
| Applications list | `admin-panel/.../applications/page.tsx` |
| Review modal | `ApplicationReviewModal.tsx` |

---

## 3. API Flow

### User API — `/api/butcher-applications`

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/butcher-applications` | List own applications (cursor) |
| POST | `/butcher-applications` | Create **DRAFT** |
| GET | `/butcher-applications/:id` | Detail |
| PATCH | `/butcher-applications/:id` | Update draft (`If-Unmodified-Since`) |
| POST | `/butcher-applications/:id/documents` | Attach document metadata |
| PATCH | `/butcher-applications/:id/documents/:documentId` | Replace document |
| DELETE | `/butcher-applications/:id/documents/:documentId` | Remove document |
| POST | `/butcher-applications/:id/submit` | Submit for review |
| POST | `/butcher-applications/:id/withdraw` | Withdraw |

**Upload:** Presign folder `butcher-applications` via `/api/upload/presign`.

### Admin API — `/api/admin/butcher-applications`

| Method | URL |
|--------|-----|
| GET | `/admin/butcher-applications` |
| GET | `/admin/butcher-applications/:id` |
| POST | `/admin/butcher-applications/:id/approve` |
| POST | `/admin/butcher-applications/:id/reject` |
| POST | `/admin/butcher-applications/:id/comment` |

---

## 4. Backend Flow

### Status machine

`DRAFT` → `SUBMITTED` → `APPROVED` | `REJECTED` | `WITHDRAWN`

Helpers: `helpers/stateTransitions.ts`, `helpers/snapshotValidation.ts`, `helpers/timeline.ts`

### User path

```
ButcherApplicationsController
  → ButcherApplicationUserService (application.service.ts)
    → ApplicationRepository + TransactionService
    → ButcherApplicationNotificationsService (on submit/withdraw)
```

### Admin approve path

```
AdminController → AdminService → ButcherApplicationAdminService.approveApplication()
  Transaction:
    1. assertTransition → APPROVED
    2. assertUserHasNoButcher
    3. createButcher(buildButcherCreateInput(snapshot))
    4. approveUploadedDocuments
    5. updateApplicationStatus
    6. appendTimelineEvent
  → notifyApplicationApproved (if new)
```

**Reject:** Requires `rejectionReason`; timeline + notification.

**Idempotent approve:** If already approved with butcher, returns existing butcher.

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `ButcherApplication` | Snapshot fields, status, timestamps |
| `ButcherApplicationDocument` | Uploaded file refs |
| `ButcherApplicationTimeline` | Audit trail (`CREATE`, `SUBMIT`, `APPROVE`, etc.) |
| `Butcher` | Created on approve (`sourceApplicationId`) |

---

## 6. Socket

Not used.

---

## 7. Notifications

`ButcherApplicationNotificationsService` → `AppNotificationsService` with `data.event`:
- `butcher_application_submitted` (to staff)
- `butcher_application_received` / `withdrawn`
- `butcher_application_approved` / `rejected`

Navigation in `app/lib/notifications.ts` handles `event` field.

---

## 8. Redis

Not used in application module.

---

## 9. BullMQ

Notifications enqueued via standard notification queue on state changes.

---

## 10. Security

- User endpoints scoped to owner (`assertApplicationOwner`)
- Optimistic concurrency via `If-Unmodified-Since`
- Admin endpoints: `@Roles(ADMIN, MODERATOR)`
- Document URLs validated against upload storage

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Moderator can approve | Same roles as admin on approve endpoint |
| `Role.BUTCHER` in schema unused | Butcher access via `Butcher.userId` not JWT role |
| Concurrent draft creation | Transaction guards `ACTIVE_DRAFT_EXISTS` |

---

## 12. Production Readiness: **90%**

Full lifecycle with timeline and notifications. Gaps: finer RBAC on approve, no SLA metrics.

**Main files:** `backend-nest/src/butcher-applications/`, `admin-panel/.../applications/`
