# Order Management

## 1. Business Purpose

Order management lets **customers** place meat orders from **butchers**, and lets **butchers** advance orders through a fulfillment pipeline. **Admins** monitor orders read-only.

**Who uses it:**
- Customer: place order, view details, realtime status
- Butcher: receive orders, confirm/prepare/ready/deliver/cancel
- Admin: list, filter, view audit (no status mutation in UI)

---

## 2. Frontend Flow

### Customer

| Screen | File | Entry |
|--------|------|-------|
| Place order | `app/butchers/order.tsx` | From butcher profile `[id].tsx` |
| Success | `app/butchers/order-success.tsx` | After `POST /orders` |
| Order details | `app/butchers/order/[id].tsx` | "تتبع الطلب" button |

**Hooks:** `hooks/useOrderSocket.ts` — listens `order.updated`, `order.cancelled`, `order.timeline.updated`, `inventory.updated`.

**No Redux/React Query** — `useState` + `fetch` + socket refresh.

### Butcher

| Screen | File |
|--------|------|
| Manage orders tab | `app/(butcher)/manage.tsx` |

- Loads `GET /api/butchers/orders`
- Status buttons call `PUT /api/butchers/orders/:id` with `{ status }`
- Cancel: modal with predefined/custom `cancellationReason`
- Socket listeners refresh order list

### Admin

| Screen | File |
|--------|------|
| Orders list | `admin-panel/.../orders/page.tsx` |
| Order detail | `admin-panel/.../orders/[id]/page.tsx` |

`useAdminOrderSocket` for realtime table refresh. Read-only.

---

## 3. API Flow

| Method | URL | Auth | Body |
|--------|-----|------|------|
| GET | `/api/butchers/orders` | JWT (butcher or customer) | — |
| POST | `/api/butchers/orders` | JWT (customer) | `butcherId`, `productId`, `cutType`, `weightKg`, `deliveryType`, `notes`, etc. |
| PUT | `/api/butchers/orders/:id` | JWT (butcher owner) | `{ status, cancellationReason? }` |
| GET | `/api/butchers/orders/:id` | JWT (customer, butcher, admin) | — |
| GET | `/api/admin/orders` | ADMIN/MODERATOR | query filters |
| GET | `/api/admin/orders/:id` | ADMIN/MODERATOR | — |

**Status codes:** 201 create, 200 update, 409 invalid transition / insufficient inventory, 404 not found, 403 forbidden.

---

## 4. Backend Flow

```
ButchersController
  → ButchersService.createOrder / updateOrder / getOrderById
    → OrderLifecycleService (ONLY path for status changes)
      → OrderStateMachineService.assertTransition
      → Prisma $transaction:
          SELECT ... FOR UPDATE OF o
          → inventory UPDATE ... WHERE
          → butcherOrder.update
          → orderTimeline.create
          → orderStatusAudit.create
      → AppNotificationsService (customer, butcher, staff)
      → SocketEmitService (customer, butcher, admin.*)
```

**Same-status no-op:** If `locked.status === nextStatus`, return order without timeline/audit/notifications/sockets.

**State machine:**
```
pending → confirmed | cancelled
confirmed → preparing | cancelled
preparing → ready
ready → delivered
```

**Inventory:**
- Create: reserve `reservedQuantity` on `ButcherProduct`
- Cancel: release reservation
- Deliver: decrement `reservedQuantity` and `availableQuantity`

---

## 5. Database

| Model | Role |
|-------|------|
| `ButcherOrder` | Order record, `orderNumber`, status, pricing, cancellation fields |
| `OrderTimeline` | Status history events |
| `OrderStatusAudit` | Audit trail |
| `OrderNumberSequence` | `ORD-YYYY-######` generation |
| `ButcherProduct` | `availableQuantity`, `reservedQuantity` |

Relations: Order → Butcher, Customer (User), Product.

---

## 6. Socket

| Event | Emitter | Listeners |
|-------|---------|-----------|
| `order.created` | `OrderLifecycleService` | Butcher manage, admin orders |
| `order.updated`, `order:updated` | Lifecycle | Customer detail, butcher |
| `order.timeline.updated` | Lifecycle | Customer, butcher |
| `order.cancelled` | Lifecycle | All parties |
| `inventory.updated` | Lifecycle | Product inventory UIs |
| `admin.order.*` | Broadcast | Admin dashboard |

**Client → Server:** `order:status` on socket (butcher) → `handleOrderStatus` → `transitionOrder`.

---

## 7. Notifications

On create and every transition:
- **DB + Push:** Customer, butcher user, all ADMIN/MODERATOR staff via `notifyOrderParties`
- **Socket:** Realtime UI refresh (not a separate notification inbox event)

Cancel includes `cancellationReason` in timeline note.

---

## 8. Redis

Order rows are not cached. Rate limiting uses `rl:api`. No order-specific Redis keys.

---

## 9. BullMQ

Orders do not enqueue BullMQ jobs directly. Notifications go through `notifications` → `push-notifications` queues.

---

## 10. Security

- Customer can only create orders as self (`customerId` from JWT)
- Butcher can only update own shop orders
- Admin/moderator can read any order
- Status changes **only** via `OrderLifecycleService` (repo bypass methods removed)
- Concurrency: PostgreSQL `FOR UPDATE` row lock in transaction
- Invalid transitions: HTTP 409

---

## 11. Possible Bugs / Risks

| Risk | Notes |
|------|-------|
| Admin cannot mutate status from UI | By design; may need ops tooling |
| Socket disconnect on mobile background | Client may miss events until reconnect |
| Product `availableQuantity` 0 blocks orders | Must set on product create |
| No E2E concurrency integration test | Unit tests mock transaction |

---

## 12. Production Readiness: **91%**

Lifecycle, inventory, notifications, sockets, and UIs are implemented. Gaps: admin write actions, integration test coverage.

**Main files:**
- `backend-nest/src/butchers/services/order-lifecycle.service.ts`
- `backend-nest/src/butchers/services/order-state-machine.service.ts`
- `app/app/butchers/order/[id].tsx`
- `app/app/(butcher)/manage.tsx`
- `admin-panel/src/app/(dashboard)/orders/`
