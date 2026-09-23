# Commissions

## 1. Business Purpose

Commissions define how much the platform charges sellers when livestock listings are sold. Rules are used to calculate `ListingFee` amounts owed by sellers.

**Who uses it:**
- **Sellers** — see commission rules in `app/fees.tsx`
- **Backend** — applies rules when creating listing fees on sale
- **Admins** — indirect via listing/fee management

---

## 2. Frontend Flow

| Location | File | Behavior |
|----------|------|----------|
| Fees screen rules tab | `app/app/fees.tsx` | `GET /api/fees/rules` for live rules |
| Local display helpers | `app/services/commissions.ts` | **Client-side** commission calculation helpers for UI labels |

**Note:** `app/services/commissions.ts` contains local rules/constants for display — not the authoritative server source.

---

## 3. API Flow

| Method | URL | Auth | Response |
|--------|-----|------|----------|
| GET | `/api/fees/rules` | Public | Commission rule definitions |

Controller: `fees.controller.ts` → `FeesService.getRules()`.

**Missing:** `GET /api/fees` is called by `fees.tsx` for user fee list but **no such endpoint exists** in `fees.controller.ts` (only `/rules`). Fee history may fail or use alternate path — verify `fees.tsx` implementation.

---

## 4. Backend Flow

```
FeesController.getRules()
  → FeesService.getRules()
    → Returns static/configured rules (see fees.service.ts)
```

**Listing fee creation:** When listing marked sold — `listings.repository.ts` / `ListingFee` creation with `commission` amount.

**Payment:** User pays fee via `POST /api/payments/initiate` with `type: 'fee'` or `listing_fee`.

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `ListingFee` | Per-listing commission owed: `amount`, `commission`, `status`, `dueDate` |
| `Payment` | Fee payment records linked via `feeId` |

---

## 6. Socket

Not used.

---

## 7. Notifications

Overdue fees: `WorkerCronService` (09:00) → `fee-checks` queue → `FeeCheckProcessor` → may send `fee_reminder` email.

---

## 8. Redis

Cron lock: `cron:fee_check:lock`.

---

## 9. BullMQ

| Queue | Job | Purpose |
|-------|-----|---------|
| `fee-checks` | `check` | Process overdue listing fees |

---

## 10. Security

- Rules endpoint is public (read-only)
- Fee payment requires authenticated user + ownership of fee
- Webhook fulfills payment (see [payment-webhooks.md](./payment-webhooks.md))

---

## 11. Possible Bugs / Risks

| Risk | Notes |
|------|-------|
| `GET /api/fees` missing | Mobile `fees.tsx` may error on fees tab |
| Client vs server rule mismatch | `commissions.ts` local vs `fees/rules` API |
| No refund of commission on listing dispute | See [refunds.md](./refunds.md) |

---

## 12. Production Readiness: **78%**

Rules API works; user fee listing endpoint gap reduces readiness.

**Main files:** `backend-nest/src/fees/`, `app/services/commissions.ts`, `app/app/fees.tsx`

See also: [fees.md](./fees.md)
