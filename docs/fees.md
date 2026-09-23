# Fees & Commissions

## 1. Business Purpose

Listing fees are **commission charges** owed when users publish marketplace listings. Rules vary by animal/category; store listings may be exempt or charged a plan-based percentage. Fees must be paid within a due window or listings move to `pending_fee` / `overdue`.

**Who uses it:**
- **Sellers** — `app/app/fees.tsx` hub (pay fees, view rules, subscription tab)
- **Listings service** — creates `ListingFee` on listing publish
- **Payments** — `type: 'listing_fee'` checkout via NI
- **Cron / BullMQ** — marks overdue fees and notifies users

---

## 2. Frontend Flow

| Screen | File | Tabs |
|--------|------|------|
| Fees hub | `app/app/fees.tsx` | `fees`, `subscription`, `history`, `rules` |

### Data loading

| Source | Endpoint | Status |
|--------|----------|--------|
| Commission rules table | `GET /api/fees/rules` | **Implemented** (public) |
| User's pending/paid fees | `GET /api/fees` | **Called by frontend but NOT implemented in backend** |

`fees.tsx` maps `json.data.fees` when present; otherwise fees list stays empty.

### Pay flow

1. User selects pending fee(s).
2. `POST /api/payments/initiate` with `type: 'listing_fee'`, `referenceId: fee.id`, `amount: fee.commission`.
3. Opens NI `checkoutUrl`.
4. Webhook marks fee paid and activates listing (see `docs/payments.md`).

**Also links to:** `/subscription` for plan upgrades (store commission exemption).

---

## 3. API Flow

### Implemented

| Method | URL | Auth | Response |
|--------|-----|------|----------|
| GET | `/api/fees/rules` | Public | `{ rules: COMMISSION_TABLE }` |

`FeesController` (`backend-nest/src/fees/fees.controller.ts`) — **only** `getRules()`.

### Referenced by frontend but missing

| Method | URL | Expected by |
|--------|-----|-------------|
| GET | `/api/fees` | `app/app/fees.tsx` `fetchFees()` |

### Related (payments module)

| Method | URL | Purpose |
|--------|-----|---------|
| POST | `/api/payments/initiate` | Pay fee (`type: 'listing_fee'`) |

---

## 4. Backend Flow

### Rule source (`backend-nest/src/lib/commissions.ts`)

`FeesService.getRules()` returns static `COMMISSION_TABLE` for UI display.

`calculateCommission(category, price, quantity, permissions)` used at listing creation:

| Category | Rule |
|----------|------|
| sheep, goats | 20 SAR / head |
| camels | 60 SAR / head |
| horses, cows, birds, feed, equipment | 2% of price |
| store | `storeCommission` from plan permissions (default 5%), or **exempt** if commission <= 0 |

`shouldCreateFee` — skips fee row for exempt store listings.

### Listing creation (`listings.service.ts`)

```
create(user, dto)
  → entitlements.assertCanCreateListing()
  → calculateCommission(category, price, quantity, permissions)
  → repo.createListingWithFee({ commission, dueDate, ... })
  → feeCheckQueue.scheduleFeeCheck({ listingFeeId, userId, amount }, delayMs)
  → notifyUser type 'fee_due' — "تم نشر إعلانك"
```

`dueDate` = now + 7 days from `calculateCommission` (notification text mentions 14 days — copy mismatch).

### Overdue processing

```
WorkerCronService (daily 09:00)
  → findOverdueListingFees (pending + dueDate < now)
  → feeCheckQueue.addFeeCheck per fee

FeeCheckProcessor
  → if still pending and past dueDate:
       ListingFee.status = overdue
       Listing.status = pending_fee
       notifyUser type 'fee_due' — "رسوم متأخرة"
```

### Payment fulfillment

`PaymentsRepository.processSuccessfulPayment` for `fee` / `listing_fee`:
- `ListingFee.status = paid`, `paidAt`, `transactionId`
- `Listing.status = active`

---

## 5. Database

### `ListingFee`

| Field | Type / notes |
|-------|----------------|
| `listingId` | Unique — one fee per listing |
| `userId` | Seller |
| `category`, `quantity`, `price` | Snapshot at creation |
| `commission` | Amount due |
| `status` | `pending` \| `paid` \| `overdue` \| `waived` |
| `dueDate` | Payment deadline |
| `paidAt`, `transactionId` | Set on successful payment |

### `FeeStatus` enum

`pending`, `paid`, `overdue`, `waived`

### Relations

- `Listing.fee` — optional 1:1
- `Payment.feeId` — links NI payment to fee

Indexes: `userId`, `status`, `dueDate`, `(status, dueDate)`.

---

## 6. Socket

Fees do not use socket events.

---

## 7. Notifications

| Trigger | Type | Message |
|---------|------|---------|
| Listing created with fee | `fee_due` | إعلانك منشور + commission amount |
| Fee marked overdue (processor) | `fee_due` | رسوم متأخرة — listing suspended until paid |
| Payment success | `system` | Via payments webhook (generic payment success) |

---

## 8. Redis

| Key | Purpose |
|-----|---------|
| `cron:fee_check:lock` | Daily overdue scan lock (TTL 120s) |

Fee check queue only runs when `RedisCacheService.isEnabled()`.

---

## 9. BullMQ

**Queue:** `fee-checks` (`QUEUE_NAMES.FEE_CHECKS`)

| Job name | Payload | When |
|----------|---------|------|
| `check` | `{ listingFeeId, userId, amount }` | Scheduled at listing create (`delay` until after dueDate + 60s) or cron for overdue |

`FeeCheckProcessor` concurrency: **5**. Job id: `fee:{listingFeeId}`.

---

## 10. Security

- Rules endpoint is public (marketing/transparency).
- Fee payment requires JWT + `findPendingFee` validates ownership and amount.
- Listing creation enforces plan listing limits before fee creation.
- Overdue transition runs in DB transaction.

---

## 11. Possible Bugs

1. **Missing `GET /api/fees`** — primary fees UI cannot load user fees from API.
2. **Due date copy** — notification says 14 days; code sets 7 days.
3. **No waive endpoint** — `waived` status exists in schema but no controller sets it.
4. **Refund gap** — refunded payment does not revert `ListingFee` or listing status.
5. **Batch pay** — UI allows multi-select but `handleConfirmPayment` only pays first selected fee.
6. **History tab** — depends on same missing `GET /api/fees` data.

---

## 12. Production Readiness (%)

**68%**

Commission calculation, fee creation on listing, overdue cron, NI payment fulfillment, and public rules API exist. Critical gap: **no authenticated fees list endpoint** for the mobile hub. Treat fees listing as **partial**.
