# Butcher Analytics

## 1. Business Purpose

Butcher shop owners view revenue, orders, and product performance over selectable periods. Plan feature `analyticsDashboard` exists in subscription catalog but is **not enforced** on the stats API in current code.

**There is no separate `analytics` Nest module.**

---

## 2. Frontend Flow

### Mobile

| Screen | Path |
|--------|------|
| Analytics dashboard | `app/butchers/dashboard.tsx` |

**Hooks:** `useButcherStats` → `GET /api/butchers/stats?period=`, `useRequireApprovedButcher` (approved application gate — **not** plan feature gate)

**Periods:** `week`, `month`, `year` (validated server-side)

**UI:** Revenue chart, order counts, top products, completion rate, trends vs previous period.

---

## 3. API Flow

| Method | URL | Auth |
|--------|-----|------|
| GET | `/api/butchers/stats` | JWT |

**Query:** `period` — `week` \| `month` \| `year` (default `month`)

**Response highlights:** `revenue`, `orders`, `profileViews`, `completionRate`, `avgOrderValue`, `newCustomers`, `dailyRevenue[]`, `topProducts[]`, `trends`, `reviews`, `butcher` summary.

---

## 4. Backend Flow

```
ButchersController.stats
  → ButchersService.getStats(user, period)
    → findButcherForStats(userId) — 404 if no butcher
    → findOrdersInRange (current + previous period)
    → Aggregate revenue, products, trends
```

**Plan check:** **Missing** — `PlanPermissionService.hasAnalyticsDashboard()` is not called in `getStats`.

**Feature catalog:** `analyticsDashboard` boolean on paid butcher plans in `seed-plans.ts`.

---

## 5. Database

Reads `Butcher`, `ButcherOrder`, `ButcherProduct` (via order relations). No analytics tables or events warehouse.

---

## 6. Socket

Not used.

---

## 7. Notifications

Not used for analytics.

---

## 8. Redis

No stats caching.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Requires JWT and linked butcher profile
- Any approved butcher can call API regardless of subscription tier (current behavior)
- Returns aggregated shop data only for owning user’s butcher

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| **Plan entitlement not enforced** | `hasAnalyticsDashboard` unused in butchers.service |
| `profileViews` trend always null | Returned as `null` in trends object |
| No export/CSV | Not implemented |
| Heavy queries on large order history | No pagination on stats computation |

---

## 12. Production Readiness: **70%**

Useful stats endpoint exists. **Missing:** `analyticsDashboard` enforcement, dedicated analytics module, caching.

**Main files:** `backend-nest/src/butchers/butchers.controller.ts`, `butchers.service.ts` (`getStats`), `app/butchers/dashboard.tsx`
