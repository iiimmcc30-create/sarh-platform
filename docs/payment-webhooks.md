# Payment Webhooks (Network International)

## 1. Business Purpose

The webhook endpoint receives asynchronous payment events from **Network International** and updates internal `Payment` records, fulfills subscriptions/listing fees, handles refunds, and triggers user notifications. It is the **only** path that marks payments `paid` after hosted checkout.

**Who uses it:**
- **Network International** — POSTs order lifecycle events
- **Backend** — `PaymentsService.handleNIWebhook()` drives all post-checkout state changes

---

## 2. Frontend Flow

No frontend directly calls the webhook. Mobile apps open NI `checkoutUrl` and rely on backend webhook processing.

**Indirect client behavior:**
- `app/app/payment.tsx` — user returns manually; calls `refetchSubscription()`
- `app/app/fees.tsx` — `fetchFees()` after payment alert (depends on missing `GET /api/fees`)

---

## 3. API Flow

| Method | URL | Auth | Headers | Body |
|--------|-----|------|---------|------|
| POST | `/api/payments/webhook` | None (`@Public()`) | `x-signature` **or** `x-ni-signature` | Raw JSON (not standard `json()` parser) |

**Controller:** `backend-nest/src/payments/payments.controller.ts`

```typescript
@RawBody()
@Public()
@Post('webhook')
async webhook(@Req() req, @Res() res, @Headers('x-signature') xSignature?, @Headers('x-ni-signature') xNiSignature?)
```

**Signature verification responses:**
- `401 { error: 'invalid_signature' }` — HMAC mismatch
- `401 { error: 'missing_signature' }` — production without secret/signature

**Processing response:**
- `200 { received: true }` — always returned after `processWebhook` (even on internal errors)
- `400 { error: 'invalid_json' }` — malformed body

**Global prefix:** `/api` (`main.ts`). Alternate alias `/api/v1/payments/webhook` rewritten to `/api/...`.

**Body parser bypass:** `main.ts` skips default JSON middleware for `/api/payments/webhook`; `RawBodyMiddleware` captures raw string into `req.rawBody`.

---

## 4. Backend Flow

```
POST /api/payments/webhook
  → PaymentsController.webhook
    → PaymentsService.verifyWebhookSignature(rawBody, signature)
    → PaymentsService.processWebhook(rawBody)
      → JSON.parse(rawBody)
      → handleNIWebhook(event)
```

### `handleNIWebhook` (`payments.service.ts`)

1. **Parse event:** `order = event.order ?? event`; `eventType = event.eventName ?? event.type`.
2. **Resolve payment:**
   - `merchantOrderRef` from `merchantAttributes.merchantOrderReference`, `order.reference`, etc.
   - `internalPaymentId` from `order.customData.paymentId` (set at initiate).
   - `PaymentsRepository.findPaymentForWebhook(internalPaymentId, merchantOrderRef)`.
3. **Extract metadata:** `type`, `referenceId`, `userId`, `targetPlanId`, `billingCycle` from DB row + stored/custom metadata.
4. **Refund branch** (if `payment.status === 'paid'` and refund event):
   - Events: `ORDER.REVERSED`, `ORDER.REFUNDED`, `ORDER.PARTIALLY_REFUNDED` or states `REVERSED`, `REFUNDED`, `PARTIALLY_REFUNDED`.
   - `markPaymentRefunded()` → if subscription fulfilled, `subscriptionLifecycle.downgradeUser(..., 'refund')`.
5. **Idempotency:** skip if already `refunded`, `paid`, or `failed` (except refund branch above).
6. **Success branch:**
   - Events: `ORDER.PAID`, `ORDER.CAPTURED`, `ORDER.AUTHORISED` or states `CAPTURED`, `AUTHORISED`, `PURCHASED`.
   - `PaymentsRepository.processSuccessfulPayment({...})`.
   - `subscriptionCache.invalidate(userId)`.
   - Notify renewal success or generic payment success.
7. **Failure branch:**
   - Events: `ORDER.FAILED`, `ORDER.REVERSED`, `ORDER.CANCELLED` or states `FAILED`, `REVERSED`, `CANCELLED`.
   - `markPaymentFailedById()` + failure notifications.

### HMAC verification (`verifyNISignature`)

```typescript
crypto.createHmac('sha256', NI_WEBHOOK_SECRET).update(body).digest('hex')
crypto.timingSafeEqual(expected, signature.replace(/^sha256=/, ''))
```

If `NI_WEBHOOK_SECRET` is unset, verification is **skipped** except in production (rejected).

### `processSuccessfulPayment` (`payments.repository.ts`)

Transactional:
1. `UPDATE Payment SET status='paid' WHERE id=? AND status='pending'` — returns `{ processed: false }` if no row updated (race/idempotent).
2. Subscription: extend `renewDate`, update plan, reset counters, set `metadata.subscriptionFulfilled = true`.
3. Fee: `ListingFee.status = paid`, `Listing.status = active`.

---

## 5. Database

**Tables touched:**
- `Payment` — status, `transactionId`, `paidAt`, `metadata`
- `Subscription` — on subscription payments
- `ListingFee`, `Listing` — on fee payments
- `User.verified`, `Butcher.subscriptionActive` — side effects on subscription fulfillment

**Payment lookup:**
```sql
WHERE id = :internalPaymentId OR orderId = :merchantOrderRef
```

---

## 6. Socket

Webhooks do not emit socket events.

---

## 7. Notifications

| Outcome | Service | Notification |
|---------|---------|--------------|
| Success (subscription) | `SubscriptionLifecycleService.notifyRenewalSuccess` | `subscription_renew` + optional email |
| Success (fee/other) | `AppNotificationsService.notifyUser` | `system` — "تم الدفع بنجاح" |
| Failure | `notifyRenewalFailed` or `notifyUser` | `subscription_renew` or `system` |
| Refund | `notifyUser` | `system` — "تم استرداد الدفع" |

All via BullMQ notification/email queues.

---

## 8. Redis

`SubscriptionCacheService.invalidate(userId)` after success and refund.

No webhook-specific Redis keys.

---

## 9. BullMQ

Webhook handler does not enqueue BullMQ jobs directly. Notifications and emails are queued asynchronously by `AppNotificationsService` / `EmailQueueService`.

---

## 10. Security

- **HMAC-SHA256** with `NI_WEBHOOK_SECRET`; timing-safe comparison.
- Production **requires** signature when secret is configured; missing signature returns 401.
- Endpoint is public — signature is the primary auth layer.
- Raw body required — re-parsing JSON from parsed body would break HMAC.
- CORS allows `x-signature` and `x-ni-signature` headers (`main.ts`).
- Errors in `handleNIWebhook` are logged but webhook still returns 200 to avoid NI retry storms (may mask failures).

---

## 11. Possible Bugs

1. **Always 200 on handler errors** — `processWebhook` catches exceptions and still returns `{ received: true }`; NI will not retry failed fulfillments.
2. **`ORDER.REVERSED` in both refund and failure lists** — handled correctly for `paid` (refund first) but confusing for `pending` payments.
3. **No webhook event persistence** — no audit log of raw events for dispute debugging.
4. **Partial refunds** — `PARTIALLY_REFUNDED` triggers full subscription downgrade if `subscriptionFulfilled === true`.
5. **Missing payment** — unknown `merchantOrderRef` logs warning and returns silently (200 to NI).
6. **Non-production skips signature** — dev environments accept unsigned webhooks.

---

## 12. Production Readiness (%)

**82%**

HMAC verification, raw body handling, idempotent `updateMany` on pay, and refund/downgrade paths are production-grade. Weaknesses: silent error swallowing, no event store, and no admin replay tool.
