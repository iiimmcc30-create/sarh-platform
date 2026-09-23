# Refunds

## 1. Business Purpose

Refunds reverse a completed payment when Network International sends a reversal/refund webhook. The system marks the `Payment` as `refunded` and, for fulfilled subscription payments, downgrades the user back to the free plan.

**Who uses it:**
- **Network International** — webhook events only
- **Affected users** — receive in-app notification on refund
- **No admin or mobile UI** — refunds are not initiated from the app

---

## 2. Frontend Flow

There is **no refund UI** in the mobile app or admin panel.

Users may see:
- In-app notification: "تم استرداد الدفع" (from webhook handler)
- Subscription downgrade notification: "تم استرداد مبلغ الاشتراك" (from `downgradeUser` with `reason: 'refund'`)

`SubscriptionContext` reflects downgrade on next `GET /api/subscriptions`.

---

## 3. API Flow

**No dedicated refund endpoints exist.**

Refunds are processed exclusively via:

| Method | URL | Trigger |
|--------|-----|---------|
| POST | `/api/payments/webhook` | NI events `ORDER.REVERSED`, `ORDER.REFUNDED`, `ORDER.PARTIALLY_REFUNDED` or order states `REVERSED`, `REFUNDED`, `PARTIALLY_REFUNDED` |

There is no `POST /api/payments/refund` or admin refund route in the codebase.

---

## 4. Backend Flow

```
PaymentsService.handleNIWebhook()
  → isRefundEvent = eventType/state in refund sets
  → if payment.status === 'refunded' → return (idempotent)
  → if payment.status === 'paid' && isRefundEvent:
       PaymentsRepository.markPaymentRefunded(paymentId, metadata)
       if type === 'subscription' && subscriptionFulfilled:
         find subscription → SubscriptionLifecycleService.downgradeUser(userId, planId, audience, 'refund')
       SubscriptionCacheService.invalidate(userId)
       AppNotificationsService.notifyUser({ type: 'system', titleAr: 'تم استرداد الدفع', ... })
```

### `markPaymentRefunded` (`payments.repository.ts`)

```typescript
prisma.payment.update({
  where: { id: paymentId },
  data: {
    status: 'refunded',
    metadata: { ...existing, refundedAt, refundEvent },
  },
});
```

### `downgradeUser` with `reason: 'refund'` (`subscription-lifecycle.service.ts`)

- `SubscriptionLifecycleRepository.downgradeToFreeTx()` — plan → `free`, reset counters, butcher subscription flags cleared
- Notification type `system` with refund-specific Arabic copy

**Listing fee refunds:** payment marked `refunded` but **no** automatic reversal of `ListingFee.paid` or listing activation in webhook handler.

---

## 5. Database

### `PaymentStatus` enum (`schema.prisma`)

```
pending | paid | failed | refunded
```

### Refund-related fields

| Model | Field | On refund |
|-------|-------|-----------|
| `Payment` | `status` | → `refunded` |
| `Payment` | `metadata` | adds `refundedAt`, `refundEvent` |
| `Subscription` | plan, counters | downgraded only if subscription payment was fulfilled |
| `ListingFee` | — | **not updated** on refund |
| `Listing` | — | **not reverted** on refund |

---

## 6. Socket

No refund-specific socket events.

---

## 7. Notifications

| Trigger | Type | Title (AR) |
|---------|------|------------|
| Payment refunded | `system` | تم استرداد الدفع |
| Subscription downgraded after refund | `system` | تم استرداد مبلغ الاشتراك |

Queued via `AppNotificationsService` → BullMQ.

---

## 8. Redis

`SubscriptionCacheService.invalidate(userId)` after refund processing.

---

## 9. BullMQ

Refund path does not enqueue dedicated jobs. User notifications go through the standard notification queue.

---

## 10. Security

- Refunds only accepted via verified NI webhook (HMAC in production).
- No user-facing refund API — prevents arbitrary refund requests.
- Subscription downgrade only when `metadata.subscriptionFulfilled === true` (payment actually activated plan).

---

## 11. Possible Bugs

1. **Partial implementation for listing fees** — fee payment refunded in `Payment` table but `ListingFee` stays `paid` and listing stays `active`.
2. **Partial refunds treated as full downgrade** — `ORDER.PARTIALLY_REFUNDED` triggers same path as full refund for subscriptions.
3. **No refund API for support** — operations must use NI portal + wait for webhook.
4. **No ledger/audit table** — only `metadata.refundEvent` string stored.
5. **`activateFromPayment` in lifecycle service unused by webhook** — fulfillment happens in `payments.repository.processSuccessfulPayment` instead; two parallel activation paths exist in codebase.
6. **Double idempotency** — `refunded` status short-circuits; good, but no compensation if downgrade fails after `markPaymentRefunded`.

---

## 12. Production Readiness (%)

**65%**

Core subscription refund webhook path exists with status enum and downgrade logic. Missing: fee refund reversal, partial refund handling, admin tools, and dedicated refund API. Treat as **partial / webhook-only**.
