# API index

فهرس من `@Controller` + ديكورات HTTP في `backend-nest/src/**/*controller*.ts` بتاريخ التوثيق.  
البادئة العامة: **`/api`** إلا المسارات المستثناة في `main.ts`.  
التوافق: `/api/v1/*` يُعاد كتابته إلى `/api/*`.

معظم المسارات تتطلب JWT (`JwtAuthGuard` عام). الاستثناءات تُعلَّم `@Public()` أو `@OptionalAuth()` في المتحكم — راجع الملف إن احتجت التفاصيل.  
هذا الفهرس **Implemented**. لم يُضرب أي endpoint حي في Phase 1.

Swagger: ` /api/docs` عندما `NODE_ENV !== 'production'` أو `SWAGGER_ENABLED=true`.

---

## Health

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `@Public()` — عملية API |
| GET | `/api/health/ready` | `@Public()` |
| GET | `/health` | عملية Socket (`socket-health.controller`) — **بدون** `/api` |

---

## Auth

`auth.controller.ts` — `@Controller('auth')`

| Method | Path |
|--------|------|
| POST | `/api/auth/login` |
| POST | `/api/auth/register` |
| POST | `/api/auth/refresh` |
| POST | `/api/auth/logout` |
| POST | `/api/auth/change-password` |
| POST | `/api/auth/check-signup` |
| POST | `/api/auth/send-otp` |
| POST | `/api/auth/verify-otp` |
| POST | `/api/auth/google` |
| POST | `/api/auth/reset-password` |
| POST | `/api/auth/verify-email` |
| POST | `/api/auth/resend-verification` |

---

## Users

`users.controller.ts`

| Method | Path |
|--------|------|
| GET | `/api/users` |
| GET | `/api/users/blocked` |
| GET | `/api/users/me/account` |
| PATCH | `/api/users/me/account` |
| POST | `/api/users/me/phone` |
| GET | `/api/users/me/privacy` |
| PATCH | `/api/users/me/privacy` |
| GET | `/api/users/username-available` |
| GET | `/api/users/:id` |
| PUT | `/api/users/:id` |
| DELETE | `/api/users/:id` |
| POST | `/api/users/:id/follow` |
| POST | `/api/users/:id/block` |
| POST | `/api/users/:id/rate` |
| GET | `/api/users/:id/connections` |

---

## Listings

`listings.controller.ts` + `listing-boost.controller.ts` + `listing-promotion.controller.ts` (كلها `@Controller('listings')`)

| Method | Path |
|--------|------|
| GET | `/api/listings` |
| POST | `/api/listings` |
| GET | `/api/listings/:id` |
| PUT | `/api/listings/:id` |
| DELETE | `/api/listings/:id` |
| GET | `/api/listings/:id/comments` |
| POST | `/api/listings/:id/comments` |
| DELETE | `/api/listings/:id/comments/:commentId` |
| POST | `/api/listings/:id/plan-promote` |
| GET | `/api/listings/boost/plans` |
| POST | `/api/listings/:listingId/boost` |
| GET | `/api/listings/:listingId/boosts` |
| POST | `/api/listings/boost/:boostId/dev-complete` |
| GET | `/api/listings/promotion/plans` |
| GET | `/api/listings/promote/quote` |
| POST | `/api/listings/:listingId/promotion` |
| GET | `/api/listings/:listingId/promotion/stats` |
| POST | `/api/listings/:listingId/promotion/track` |
| POST | `/api/listings/promotion/:promotionId/dev-complete` |

رسوم الإعلان: `fees.controller.ts`

| Method | Path |
|--------|------|
| GET | `/api/fees` |
| POST | `/api/fees/quote` |
| GET | `/api/fees/rules` |

تصنيفات السوق: `@Controller('categories')`

| Method | Path |
|--------|------|
| GET | `/api/categories` |
| GET | `/api/categories/:id` |
| GET | `/api/categories/:id/subcategories` |

---

## Search / home / explore

| Method | Path | Controller |
|--------|------|------------|
| GET | `/api/search` | `search` |
| GET | `/api/search/explore` | `search` |
| GET | `/api/search/trending` | `search` |
| GET | `/api/search/suggest` | `search` |
| GET | `/api/home/explore` | `home-explore` |
| GET | `/api/explore-sarh-banners` | `explore-sarh-banners` |
| GET | `/api/editorial-stories` | `editorial-stories` |
| GET | `/api/feed-suppliers` | `feed-suppliers` |
| GET | `/api/feed-suppliers/:id` | `feed-suppliers` |
| GET | `/api/settings/paid-services` | `settings` |

---

## Posts / comments / bookmarks

`posts.controller.ts`

| Method | Path | Auth on method |
|--------|------|----------------|
| GET | `/api/posts` | OptionalAuth |
| POST | `/api/posts` | JWT |
| GET | `/api/posts/:id` | OptionalAuth |
| PUT | `/api/posts/:id` | JWT |
| DELETE | `/api/posts/:id` | JWT |
| GET | `/api/posts/:id/comments` | OptionalAuth |
| POST | `/api/posts/:id/comments` | JWT |
| DELETE | `/api/posts/:id/comments/:commentId` | JWT |
| POST | `/api/posts/:id/like` | JWT |
| POST | `/api/posts/:id/repost` | JWT |
| POST | `/api/posts/:id/bookmark` | JWT |
| POST | `/api/posts/:id/view` | OptionalAuth |

---

## Payments

`payments.controller.ts` · `payment-redirect.controller.ts` · `integrations-webhook.controller.ts`

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/payments/initiate` | JWT · `@RateLimit('payment')` |
| POST | `/api/payments/:id/sync` | JWT |
| POST | `/api/payments/:id/dev-complete` | JWT · sandbox mock only |
| POST | `/api/payments/webhook` | Public · raw body · توقيع NI |
| POST | `/api/integrations/ni/webhook` | نفس عائلة التوقيع |
| GET | `/payment/result` | **بدون** `/api` |
| GET | `/payment/cancel` | **بدون** `/api` |

---

## Admin

`admin.controller.ts` `@Controller('admin')` إضافة إلى متحكمات `admin/*` الأخرى.

| Method | Path |
|--------|------|
| POST | `/api/admin/auth/login` |
| GET | `/api/admin/auth/me` |
| GET | `/api/admin/dashboard/stats` |
| GET | `/api/admin/users` |
| GET | `/api/admin/users/:id` |
| PATCH | `/api/admin/users/:id` |
| DELETE | `/api/admin/users/:id` |
| POST | `/api/admin/users/:id/listing-fee-enforcement` |
| GET | `/api/admin/listing-fee-compliance` |
| GET | `/api/admin/posts` |
| PATCH | `/api/admin/posts/:id` |
| DELETE | `/api/admin/posts/:id` |
| GET | `/api/admin/listings` |
| PATCH | `/api/admin/listings/:id` |
| DELETE | `/api/admin/listings/:id` |
| POST | `/api/admin/listings/managed` |
| PATCH | `/api/admin/listings/:id/managed` |
| GET | `/api/admin/reports` |
| GET | `/api/admin/reports/:id` |
| PATCH | `/api/admin/reports/:id` |
| DELETE | `/api/admin/reports/:id` |
| GET | `/api/admin/livestreams` |
| POST | `/api/admin/livestreams/:id` |
| DELETE | `/api/admin/livestreams/:id` |
| GET | `/api/admin/butchers` |
| GET | `/api/admin/butchers/:id` |
| PATCH | `/api/admin/butchers/:id` |
| DELETE | `/api/admin/butchers/:id` |
| GET | `/api/admin/orders` |
| GET | `/api/admin/orders/:id` |
| GET/PUT | `/api/admin/settings` |
| GET/POST | `/api/admin/sections` |
| PATCH/DELETE | `/api/admin/sections/:id` |
| POST | `/api/admin/sections/:id/publish` |
| POST | `/api/admin/sections/:id/unpublish` |
| GET | `/api/admin/sections/:id/versions` |
| POST | `/api/admin/sections/:id/restore/:versionId` |
| POST | `/api/admin/cleanup` |

متحكمات admin إضافية (نفس البادئة `/api`):

- `/api/admin/explore-sarh-banners` · `/api/admin/feed-suppliers` · `/api/admin/feed-products`
- `/api/admin/ministry` · `/api/admin/services` · `/api/admin/support`
- `/api/admin/knowledge` · `/api/admin/plans` · `/api/admin/categories`
- `/api/admin/editorial-stories` · `/api/admin/butcher-banners` · `/api/admin/home-explore`
- `/api/admin/integrations` · `/api/admin/butchers/:id/daftra` (ملف `admin-daftra.controller.ts`)

---

## Butcher

`butchers.controller.ts` `@Controller('butchers')`

| Method | Path |
|--------|------|
| GET | `/api/butchers` |
| POST | `/api/butchers` |
| GET | `/api/butchers/stats` |
| GET | `/api/butchers/dashboard` |
| GET | `/api/butchers/products` |
| GET | `/api/butchers/products/mine` |
| POST | `/api/butchers/products` |
| PUT | `/api/butchers/products/:id` |
| DELETE | `/api/butchers/products/:id` |
| GET | `/api/butchers/customers` |
| GET | `/api/butchers/reports` |
| GET/POST | `/api/butchers/offers` |
| PUT/DELETE | `/api/butchers/offers/:id` |
| GET/POST | `/api/butchers/orders` |
| GET/PUT | `/api/butchers/orders/:id` |
| POST | `/api/butchers/checkout` |
| POST | `/api/butchers/checkout/:id/abandon` |
| GET/POST | `/api/butchers/stories` |
| DELETE | `/api/butchers/stories/:id` |
| GET | `/api/butchers/:id` |
| PUT | `/api/butchers/:id` |
| POST/DELETE/GET | `/api/butchers/:id/favorite` |
| GET | `/api/butchers/:id/chat-access` |
| GET/POST | `/api/butchers/:id/reviews` |

تطبيقات الانضمام: `@Controller('butcher-applications')`

| Method | Path |
|--------|------|
| POST | `/api/butcher-applications/join` |
| GET/POST | `/api/butcher-applications` |
| GET/PATCH | `/api/butcher-applications/:id` |
| POST | `/api/butcher-applications/:id/documents` |
| PATCH/DELETE | `/api/butcher-applications/:id/documents/:documentId` |
| POST | `/api/butcher-applications/:id/submit` |
| POST | `/api/butcher-applications/:id/withdraw` |

صفحات HTML بلا `/api`: `GET /join` · `GET /join/success`.

Daftra (جزار): `@Controller('butchers/daftra')` — `status`, `test-connection`, `oauth/*`, `products`, `inventory`, `product-links`.  
قصص الجزار البديلة: `@Controller('butchers/stories')`.  
لافتات: `GET /api/butcher-banners`.

---

## Notifications / messages / stories / live

| Method | Path |
|--------|------|
| GET | `/api/notifications` |
| PATCH | `/api/notifications` |
| GET | `/api/notifications/unread-count` |
| GET/POST | `/api/messages` |
| GET/DELETE | `/api/messages/:threadId` |
| PATCH | `/api/messages/:threadId/pin` |
| GET | `/api/stories` · `/api/stories/feed` · `/api/stories/me` · `/api/stories/user/:userId` |
| POST | `/api/stories` |
| DELETE | `/api/stories/:id` |
| POST | `/api/stories/:id/view` · `/api/stories/:id/reactions` · `/api/stories/:id/reply` |
| GET | `/api/stories/:id/viewers` |
| DELETE | `/api/stories/:id/reactions` |
| GET/POST | `/api/livestreams` |
| GET | `/api/livestreams/eligibility` · `/api/livestreams/:id` |
| POST | `/api/livestreams/:id` |

---

## Uploads / content / plans / other

| Method | Path |
|--------|------|
| POST | `/api/upload/presign` |
| POST | `/api/upload/direct` |
| GET | `/api/content/sections` |
| GET | `/api/content/sections/:slug` |
| POST | `/api/content/seed-policies` |
| GET | `/privacy` (بلا `/api`) |
| GET | `/api/plans` |
| GET | `/api/subscriptions` |
| POST | `/api/subscriptions/cancel` |
| GET | `/api/services` · `/api/services/account` · `/api/services/:id` |
| POST | `/api/reports` |
| GET | `/api/support/meta` · `faqs` · `help-orders` · `tickets` · `tickets/:id` · `verification` |
| POST/PATCH | تذاكر ودعم كما في `support.controller.ts` |

لم تُدرج هنا مسارات لم يظهر لها `@Get/@Post/...` صريح في نتيجة المسح.
