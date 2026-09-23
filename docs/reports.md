# Support Reports (SupportTicket)

## 1. Business Purpose

Support tickets (`SupportTicket`) let staff track user reports and support cases from the admin panel.

**Who uses it:** Admin/moderator staff in `admin-panel`. End-user ticket submission API is **not implemented** in the current backend (tickets are seeded or created manually).

---

## 2. Frontend Flow

### Admin panel

| Screen | Path |
|--------|------|
| Reports list | `admin-panel/src/app/(dashboard)/reports/page.tsx` |
| Report detail | `admin-panel/src/app/(dashboard)/reports/[id]/page.tsx` |

**List actions:** Mark `IN_REVIEW`, close as `CLOSED` via `updateReport()` from `admin.service.ts`.

**Mobile:** No dedicated report submission screen wired to a public API.

---

## 3. API Flow

All routes under `/api/admin/reports` — staff JWT required.

| Method | URL | Body / query |
|--------|-----|--------------|
| GET | `/admin/reports` | `page`, `pageSize`, `search` |
| GET | `/admin/reports/:id` | — |
| PATCH | `/admin/reports/:id` | `status`, `priority`, `adminNotes` (optional fields) |
| DELETE | `/admin/reports/:id` | Soft delete |

**Status enum:** `OPEN`, `IN_REVIEW`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`  
**Priority enum:** `LOW`, `NORMAL`, `HIGH`, `URGENT`

**Missing:** `POST /reports` or similar public endpoint for mobile users.

---

## 4. Backend Flow

```
AdminController.listReports / getReport / updateReport / deleteReport
  → AdminService
    → AdminRepository.listTickets / findTicket / updateTicket / softDeleteTicket
```

Dashboard stats aggregate open/closed ticket counts (`getDashboardStats`).

---

## 5. Database

| Model | Fields |
|-------|--------|
| `SupportTicket` | `ticketNumber` (unique), `category`, `priority`, `status`, `subject`, `description`, `adminNotes`, `reporterId?`, soft delete |

**Indexes:** `status`, `category`, `priority`, `createdAt`, `deletedAt`.

**Seed:** `backend-nest/scripts/seed-admin.ts` may create sample tickets.

**Cleanup:** Hard delete soft-deleted tickets after retention window (`runCleanup`).

---

## 6. Socket

Not used.

---

## 7. Notifications

No automatic user notification on ticket status change.

---

## 8. Redis

Not used.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Admin/moderator only via `@Roles`
- Reporter relation optional; no PII export controls beyond staff access

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| No user-facing create API | Only admin CRUD exists |
| Category is free string | No enum validation on create (N/A until API exists) |
| Delete is soft archive | Users cannot see ticket history in app |

---

## 12. Production Readiness: **55%**

Admin triage UI works against seeded/manual data. **Missing:** mobile report flow, email alerts, assignment workflow.

**Main files:** `backend-nest/src/admin/`, `admin-panel/src/app/(dashboard)/reports/`
