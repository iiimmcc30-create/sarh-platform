# SAFAT Platform — Feature Index

> Evidence-based index. Main files and APIs are from actual codebase paths.  
> Production readiness scores reflect implementation completeness as of 2026-07-07.

---

## Core Platform

| Feature | Doc | Description | Main Backend Files | Main Frontend Files | DB Models | Production |
|---------|-----|-------------|-------------------|---------------------|-----------|------------|
| System Architecture | [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) | Full platform overview | `backend-nest/src/` | `app/`, `admin-panel/` | All | 90% |
| Authentication | [auth.md](./auth.md) | Login, OTP, JWT, refresh, Google | `auth/` | `contexts/AuthContext.tsx`, `app/auth/*` | `User`, `UserSession` | 92% |
| Users & Profile | [users.md](./users.md) | Profiles, update, delete | `users/` | `app/users/[id].tsx`, `profile/edit.tsx` | `User` | 88% |
| Follow System | [follow.md](./follow.md) | Follow/unfollow users | `users/services/users.service.ts` | `profile/connections.tsx` | `Follow` | 90% |
| Connections | [connections.md](./connections.md) | List followers/following | `users/` | `profile/connections.tsx` | `Follow` | 90% |
| Roles & Permissions | [roles-permissions.md](./roles-permissions.md) | USER, ADMIN, MODERATOR, plan gates | `auth/guards/`, `plans/` | `SubscriptionContext` | `User.role`, `PlanFeature` | 85% |

---

## Social & Content

| Feature | Doc | Description | Main APIs | DB Models | Production |
|---------|-----|-------------|-----------|-----------|------------|
| Posts | [posts.md](./posts.md) | Feed, likes, reposts, comments | `GET/POST /api/posts` | `Post`, `PostLike`, `PostRepost`, `PostComment` | 88% |
| Stories | [stories.md](./stories.md) | User ephemeral stories | `GET/POST /api/stories/*` | `Story`, `StoryView`, `StoryReaction` | 87% |
| Story Viewer | [story-viewer.md](./story-viewer.md) | View tracking, reactions, replies | `POST /api/stories/:id/view` | `StoryView` | 85% |
| Story Expiration | [story-expiration.md](./story-expiration.md) | TTL-based story expiry | Stories service | `Story.expiresAt` | 88% |
| Butcher Stories | [butcher-stories.md](./butcher-stories.md) | Butcher shop stories | `GET/POST /api/butchers/stories` | `ButcherStory` | 85% |

---

## Marketplace

| Feature | Doc | Description | Main APIs | DB Models | Production |
|---------|-----|-------------|-----------|-----------|------------|
| Listings | [listings.md](./listings.md) | Livestock marketplace ads | `GET/POST /api/listings` | `Listing` | 88% |
| Featured Listings | [featured-listings.md](./featured-listings.md) | Plan-gated featured ads | Listings + subscription entitlement | `Listing.featured` | 82% |
| Pinned Listings | [pinned-listings.md](./pinned-listings.md) | Plan-gated pinned ads | Listings + subscription entitlement | `Listing.pinned` | 82% |
| Search | [search.md](./search.md) | Client-side + trending API | `GET /api/search/trending`, `GET /api/users?search=` | — | 70% |
| Fees & Commissions | [fees.md](./fees.md), [commissions.md](./commissions.md) | Listing commission rules | `GET /api/fees/rules` | `ListingFee` | 78% |

---

## Butchers & Orders

| Feature | Doc | Description | Main APIs | DB Models | Production |
|---------|-----|-------------|-----------|-----------|------------|
| Butchers | [butchers.md](./butchers.md) | Shop profiles, discovery | `GET /api/butchers` | `Butcher` | 90% |
| Butcher Products | [butcher-products.md](./butcher-products.md) | Product catalog + inventory | `POST /api/butchers/products` | `ButcherProduct` | 91% |
| Butcher Offers | [butcher-offers.md](./butcher-offers.md) | Promotional offers | `POST /api/butchers/offers` | `ButcherOffer` | 85% |
| Orders | [orders.md](./orders.md) | Order lifecycle, inventory | `POST/PUT /api/butchers/orders` | `ButcherOrder`, `OrderTimeline`, `OrderStatusAudit` | 91% |
| Reviews | [reviews.md](./reviews.md) | Butcher reviews | `POST /api/butchers/:id/reviews` | `ButcherReview` | 85% |
| Butcher Applications | [butcher-applications.md](./butcher-applications.md) | Onboarding workflow | `POST /api/butcher-applications` | `ButcherApplication` | 88% |
| Analytics Dashboard | [analytics.md](./analytics.md) | Butcher stats (plan-gated) | `GET /api/butchers/stats` | Aggregations | 75% |

---

## Billing

| Feature | Doc | Description | Main APIs | DB Models | Production |
|---------|-----|-------------|-----------|-----------|------------|
| Plans | [plans.md](./plans.md) | Subscription plan catalog | `GET /api/plans`, `admin/plans` | `Plan`, `PlanFeature` | 90% |
| Subscriptions | [subscriptions.md](./subscriptions.md) | Entitlements, usage limits | `GET /api/subscriptions` | `Subscription` | 88% |
| Subscription Lifecycle | [subscription-lifecycle.md](./subscription-lifecycle.md) | Activate, expire, renew, downgrade | `subscriptions/services/subscription-lifecycle.service.ts` | `Subscription` | 87% |
| Payments | [payments.md](./payments.md) | NI checkout initiation | `POST /api/payments/initiate` | `Payment` | 88% |
| Payment Webhooks | [payment-webhooks.md](./payment-webhooks.md) | NI webhook fulfillment | `POST /api/payments/webhook` | `Payment` | 88% |
| Refunds | [refunds.md](./refunds.md) | Payment refund handling | `payments.repository.ts` | `Payment.status=refunded` | 75% |

---

## Realtime & Communication

| Feature | Doc | Description | Main APIs / Events | Production |
|---------|-----|-------------|-------------------|------------|
| Chat / Messages | [chat.md](./chat.md), [messages.md](./messages.md) | Direct messages REST + socket | `GET/POST /api/messages`, `chat:*` events | 85% |
| Livestreams | [livestreams.md](./livestreams.md) | Agora live broadcast | `GET/POST /api/livestreams` | 86% |
| Agora | [agora.md](./agora.md) | RTC token generation | `shared/lib/agora.ts` | 85% |
| Live Comments | [live-comments.md](./live-comments.md) | Stream chat | `live:comment` socket | 86% |
| Live Likes | [live-likes.md](./live-likes.md) | Stream likes | `live:like` socket | 86% |
| Socket.IO | [socket.md](./socket.md) | Realtime gateway | Port 3002 | 90% |
| Notifications | [notifications.md](./notifications.md) | In-app inbox | `GET /api/notifications` | 88% |
| Push Notifications | [push-notifications.md](./push-notifications.md) | FCM via Firebase | `PushProcessor` | 87% |

---

## Admin & Platform

| Feature | Doc | Description | Main APIs | Production |
|---------|-----|-------------|-----------|------------|
| Admin Dashboard | [admin.md](./admin.md) | Staff moderation panel | `GET /api/admin/*` | 90% |
| Reports | [reports.md](./reports.md) | Support tickets | `GET /api/admin/reports` | 85% |
| Settings | [settings.md](./settings.md) | App feature flags | `GET/PUT /api/admin/settings` | 85% |
| Content CMS | [content.md](./content.md) | Terms, privacy sections | `GET/POST /api/admin/sections` | 82% |
| Moderation | [moderation.md](./moderation.md) | Hide posts, suspend listings | Admin PATCH/DELETE | 85% |
| Uploads | [uploads.md](./uploads.md) | Image presign + direct upload | `POST /api/upload/*` | 85% |
| Health Checks | [health.md](./health.md) | Liveness / dependency checks | `GET /api/health` | 95% |

---

## Infrastructure

| Feature | Doc | Description | Main Files | Production |
|---------|-----|-------------|------------|------------|
| Redis | [redis.md](./redis.md) | Cache, sessions, rate limit, adapter | `redis/` | 92% |
| BullMQ | [bullmq.md](./bullmq.md) | Background job queues | `queue/` | 88% |
| Cron Jobs | [cron.md](./cron.md) | Scheduled maintenance | `worker-cron.service.ts` | 85% |
| Firebase | [firebase.md](./firebase.md) | FCM push only | `push.processor.ts` | 87% |
| Image Processing | [image-processing.md](./image-processing.md) | Queue stub | `image-processing.processor.ts` | 20% |

---

## Dependency Graph (simplified)

```
Auth ──► all protected APIs
Plans ──► Subscriptions ──► Listings/Live/Featured limits
Payments ──► Subscriptions (activate)
Payments ──► ListingFee (fee payment)
Butchers ──► Orders ──► OrderLifecycle ──► Notifications + Sockets + Inventory
ButcherApplications ──► Butcher profile creation
Upload ──► Posts, Listings, Stories, Applications
Redis ──► Cache, RateLimit, BullMQ, Socket adapter, Blacklist
BullMQ ──► Notifications, Push, Email, Fees, Subscriptions
```

---

## Documentation Conventions

Each `docs/*.md` file follows this structure:

1. Business purpose  
2. Frontend flow  
3. API flow  
4. Backend flow (Controller → Service → Repository → Prisma)  
5. Database  
6. Socket  
7. Notifications  
8. Redis  
9. BullMQ  
10. Security  
11. Possible bugs / risks  
12. Production readiness score  

**State management note:** Mobile app uses React Context, not Redux or React Query (verified absent from `app/package.json`).
