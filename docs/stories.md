# Stories (24h Ephemeral Content)

## 1. Business Purpose

Instagram-style stories: image or video slides expiring after 24 hours. Users publish from the home feed; viewers see grouped rings (seen/unseen), can react, reply privately (creates chat message), and owners see viewer lists. Optional link to own `Listing`. Separate butcher story flow exists under `/api/butchers/stories` (documented briefly here as related).

**Key files:** `backend-nest/src/stories/stories.controller.ts`, `backend-nest/src/stories/stories.service.ts`, `app/components/feature/StoriesBar.tsx`, `app/app/create/story.tsx`, `backend-nest/src/shared/lib/stories.ts`.

---

## 2. Frontend Flow

| Component / Screen | Path | Behavior |
|--------------------|------|----------|
| Stories bar | `app/components/feature/StoriesBar.tsx` | Horizontal rings; opens full-screen `StoryViewer` modal |
| Home tab | `app/app/(tabs)/index.tsx` | `fetchStoriesFeed` → passes `feed`, `myStories` to `StoriesBar` |
| Create story | `app/app/create/story.tsx` | Pick image/video, trim video, upload, `POST /api/stories` or `/api/butchers/stories` in butcher mode |
| Story service | `app/services/stories.ts` | `fetchStoriesFeed`, `recordStoryView`, reactions, reply, delete |

**StoriesBar viewer actions:**

- Auto `recordStoryView` when viewing others' stories
- Reactions: `setStoryReaction` / `removeStoryReaction`
- Reply: `replyToStory` → navigates to `/butchers/chat` with `threadId`
- Owner: viewer list (`fetchStoryViewers`), delete story
- Listing CTA if `story.listing` present

**Expiration UI:** playback duration from `story.duration`; no countdown label in bar (helper `storyTimeLeftLabel` exists server-side).

---

## 3. API Flow

Controller: `StoriesController` — prefix `/api/stories`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/stories/feed` | OptionalAuth | Grouped feed `{ items, myStories }` |
| GET | `/stories` | OptionalAuth | Flat legacy list |
| GET | `/stories/me` | JWT | Current user's active stories |
| GET | `/stories/user/:userId` | OptionalAuth | User's active stories |
| POST | `/stories` | JWT | Create (`CreateStoryDto`) |
| DELETE | `/stories/:id` | JWT | Soft-delete own story |
| POST | `/stories/:id/view` | JWT | Record unique view |
| GET | `/stories/:id/viewers` | JWT | Owner-only viewer list |
| POST | `/stories/:id/reactions` | JWT | Upsert reaction |
| DELETE | `/stories/:id/reactions` | JWT | Remove reaction |
| POST | `/stories/:id/reply` | JWT | Private reply → `MessagesService` |

**CreateStoryDto fields:** `thumbnail`, `mediaUrl?`, `caption`, `captionAr`, `location`, `duration`, `isLive`, `liveStreamId`, `listingId`.

---

## 4. Backend Flow

**Expiration:** `storyExpiresAt()` = now + `STORY_LIFETIME_MS` (24h) from `shared/lib/stories.ts`. Active queries use `expiresAt: { gt: new Date() }`.

**getFeed:**

1. `findActiveStories()` — non-expired, not soft-deleted
2. Batch load views + reactions for viewer
3. Group by `userId`, compute `hasUnseen`, sort unseen first
4. Cache `stories:feed:{viewerId|anon}` TTL **20s**

**createStory:** validate optional `listingId` ownership → set `expiresAt`, `clampStoryDuration` → create → `invalidateFeedCache`

**recordView:** skip self-views; unique per `(storyId, viewerId)`; increment `viewsCount`

**replyToStory:** prefix message with story caption → `MessagesService.sendMessage` + notification `story_reply`

---

## 5. Database

| Model | Notes |
|-------|-------|
| `Story` | `thumbnail`, `mediaUrl`, `duration`, `expiresAt`, `viewsCount`, `reactionsCount`, optional `listingId`, soft delete |
| `StoryView` | `@@unique([storyId, viewerId])` |
| `StoryReaction` | `@@unique([storyId, userId])`, `type` string |
| `ButcherStory` | Separate table for butcher channel stories |

**Indexes:** `expiresAt`, `[userId, expiresAt, createdAt]` on `Story`.

**Repository:** `backend-nest/src/stories/repositories/stories.repository.ts` — `findActiveStories` filters `expiresAt > now`.

**Background expiry job:** **missing** — expired stories excluded by query only; rows remain until manual cleanup.

---

## 6. Socket

**missing** — no real-time story publish or view events. Feed refresh is pull-based (`onRefresh` callback).

---

## 7. Notifications

| Event | Type | Recipient |
|-------|------|-----------|
| Story reaction | `story_reaction` | Story owner (not self) |
| Story reply | `story_reply` | Story owner |

Via `AppNotificationsService`. **missing** notification when someone views a story.

---

## 8. Redis

`RedisCacheService` (`stories.service.ts`):

| Key | TTL |
|-----|-----|
| `stories:feed:{viewerId}` / `stories:feed:anon` | 20s |
| `butchers:stories:active` | 30s (butcher stories) |

Invalidation: `delPattern('stories:feed:*')` on create/delete/view/reaction; also `stories:active` key.

---

## 9. BullMQ

**missing** for stories lifecycle (no expiry sweeper queue, no transcode queue).

Notifications for reactions/replies use the general notification queue.

---

## 10. Security

| Control | Implementation |
|---------|----------------|
| Create / view / react | JWT required |
| Feed read | OptionalAuth (seen state anonymous = all unseen) |
| Delete | Owner or `ADMIN` |
| Viewers list | Owner or `ADMIN` only |
| Listing attach | Must own listing (`findListingOwnedByUser`) |
| Rate limiting | `@RateLimit('api')` |
| Expired content | `recordView` / react reject if `expiresAt <= now` |

---

## 11. Possible Bugs

1. **20s feed cache** — new stories may lag for other users up to TTL.
2. **No expiry cleanup** — DB grows with expired `Story` rows.
3. **Reply routes to butcher chat** — `StoriesBar` always opens `/butchers/chat` even for non-butcher story owners.
4. **Legacy GET `/stories`** — flat list may duplicate user grouping client-side.
5. **Video ready timeout** — viewer forces `mediaReady` after 3.5s even if video not loaded.
6. **Butcher vs user story split** — two APIs; `create/story.tsx` picks endpoint by mode but home `StoriesBar` only uses user feed.

---

## 12. Production Readiness (with %)

**74%**

| Ready | Gap |
|-------|-----|
| Full CRUD + feed grouping + views/reactions | No expiry cron / archival |
| 24h expiration enforced in queries | No socket live updates |
| Redis feed cache | Reply navigation path hardcoded to butcher chat |
| Owner analytics (viewers count) | Short cache can feel stale |
