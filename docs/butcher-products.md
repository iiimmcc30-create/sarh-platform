# Butcher Products (Inventory CRUD)

## 1. Business Purpose

Butcher owners manage meat product catalog: names, categories, cuts, pricing (per-kg or fixed), images, stock flags, and **available quantity** (kg) used for order inventory. Customers see products on public butcher profile; owners manage via butcher dashboard.

**Key files:** `backend-nest/src/butchers/butchers.controller.ts` (products routes), `backend-nest/src/butchers/butchers.service.ts`, `backend-nest/src/butchers/lib/product-inventory.util.ts`, `app/app/(butcher)/manage.tsx` (`AddProductForm`).

---

## 2. Frontend Flow

### Owner — `app/app/(butcher)/manage.tsx`

**`AddProductForm` component** (lines ~79+):

| Field | UI | API field |
|-------|-----|-----------|
| Name | `nameAr` | `nameAr`, `nameEn` (duplicated from Arabic) |
| Category | chips from `CATEGORY_LABELS` | `category` (`MeatCategory`) |
| Price | per-kg OR fixed | `pricePerKg`, `priceFixed` |
| Quantity | **الكمية المتاحة (كغ)** | `availableQuantity` (optional float) |
| Cuts | multi-select | `availableCuts[]` |
| Freshness / stock | toggles | `freshness`, `inStock` |
| Images | up to 5, upload to `butchers` folder | `images[]` URLs |

**Save:**

- Create: `POST /api/butchers/products`
- Update: `PUT /api/butchers/products/:id`
- Uses raw `fetch` + `Authorization: Bearer` (not `authFetch`)

### Customer — `app/app/butchers/[id].tsx`

`ProductsTab` displays products from `GET /api/butchers/:id` embedded `products` array; order button respects `inStock`.

**Public product list endpoint:** `GET /api/butchers/products?butcherId=` exists but profile uses embedded products.

---

## 3. API Flow

| Method | Endpoint | Auth | Body / Query |
|--------|----------|------|--------------|
| GET | `/api/butchers/products` | JWT (controller default) | `?butcherId=` required |
| POST | `/api/butchers/products` | JWT | `createProductSchema` |
| PUT | `/api/butchers/products/:id` | JWT | `updateProductSchema` |
| DELETE | `/api/butchers/products/:id` | JWT | — → `{ deleted: true }` |

**Note:** `GET products` has no `@Public()` — unauthenticated clients cannot call it; public reads use butcher detail include.

### Create schema highlights (`createProductSchema`)

- `category`: `whole_livestock`, `lamb`, `beef`, `camel`, `chicken`, `goat`, `special_orders`
- `availableCuts`: min 1 string
- `availableQuantity`: optional number ≥ 0
- `images`: 0–5 URLs
- `country`: required on create

---

## 4. Backend Flow

**createProduct:**

1. `findButcherIdByUser(user.userId)` — 403 if no butcher profile
2. Zod validate body
3. `availableQuantity = resolveProductAvailableQuantity(parsed.data)`
4. `repo.createProduct({ ... butcherId })`

**`resolveProductAvailableQuantity`** (`product-inventory.util.ts`):

1. If `availableQuantity` provided and ≥ 0 → use it
2. Else fallback `weightMax` → `weightMin` → `0`

**updateProduct:**

- Owner or ADMIN
- Re-resolve quantity if `availableQuantity`, `weightMin`, or `weightMax` changed
- Invalidate `butcher:{butcherId}`, `butcher:me` Redis keys

**deleteProduct:** soft delete (`softDeleteProduct`)

**getProducts:** `findProducts(butcherId)` — no cache layer in service.

---

## 5. Database

**Model:** `ButcherProduct` — `schema.prisma` (lines 541–570)

| Field | Type | Notes |
|-------|------|-------|
| `availableQuantity` | Float | default 0 |
| `reservedQuantity` | Float | default 0; used by orders (order flow) |
| `inStock` | Boolean | default true |
| `pricePerKg`, `priceFixed` | Float? | Either pricing model |
| `availableCuts` | String[] | |
| `weightMin`, `weightMax` | Float? | Fallback for quantity |
| `deletedAt` | DateTime? | Soft delete |

**Relation:** `butcherId` → `Butcher`; `orderItems` → `ButcherOrder`.

Indexes: `butcherId`, `inStock`, `deletedAt`.

---

## 6. Socket

**missing** — stock/quantity changes are not pushed to clients viewing product list.

---

## 7. Notifications

**missing** for product CRUD (no alert to followers on new stock).

---

## 8. Redis

On **update** and **delete** only:

- `redis.cacheDel(\`butcher:${butcherId}\`)`
- `redis.cacheDel('butcher:me')`

**missing** cache invalidation on **create** in `createProduct` (stale butcher detail until TTL/update elsewhere).

---

## 9. BullMQ

**missing** — no async image processing or inventory sync jobs for products.

Order placement (separate feature) may reserve quantity via order services.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Mutations | JWT + must own butcher profile |
| Admin override | `user.role === 'ADMIN'` on update/delete |
| Validation | Zod strict schemas; URL images |
| Public read | Via butcher profile OptionalAuth endpoint |
| GET `/products` | Effectively owner/tooling — requires auth on route |

---

## 11. Possible Bugs

1. **Create cache stale** — new product not invalidating `butcher:{id}` cache.
2. **Quantity fallback** — if owner leaves quantity empty and no weight range, quantity resolves to **0** → may block orders incorrectly.
3. **`nameEn` copied from Arabic** in mobile form — poor i18n/data quality.
4. **GET products auth** — public clients cannot refresh products without loading full butcher.
5. **`inStock` vs quantity** — UI can show "اطلب الآن" based on `inStock` only; quantity not shown on profile cards.
6. **Image optional on create** — schema allows 0 images; UX may allow save without images if not validated client-side.

---

## 12. Production Readiness (with %)

**73%**

| Ready | Gap |
|-------|-----|
| Full CRUD API + Zod validation | Create cache invalidation missing |
| Inventory quantity resolver | No real-time stock updates |
| Owner mobile form (`AddProductForm`) | Quantity/stock UX inconsistent on buyer side |
| Soft delete + authz | Reserved quantity logic lives in orders (must stay in sync) |
