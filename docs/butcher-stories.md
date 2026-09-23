# Butcher Stories

## 1. Business Purpose

Butcher shops publish promotional **stories** (daily slaughter, offers, stock updates) separate from user social stories. Simpler model: no views/reactions API, public list endpoint.

---

## 2. Frontend Flow

### Mobile

| Screen | Path |
|--------|------|
| Butcher story viewer | `app/butchers/story-viewer.tsx` |
| Create (butcher mode) | Butcher profile / manage flows |

**Data:** `GET /api/butchers/stories` — filters by `butcherId` client-side.

**Viewer features:** Local like UI (client state only — **not** synced to server), reply text field (local; no butcher-story reply API).

**Types:** `daily_slaughter`, `offer`, `new_stock`, `update` (`StoryType` enum).

---

## 3. API Flow

Base: `/api/butchers/stories` — `butcher-stories.controller.ts`

| Method | URL | Auth |
|--------|-----|------|
| GET | `/butchers/stories` | **Public** |
| POST | `/butchers/stories` | JWT (must own active butcher) |
| DELETE | `/butchers/stories/:id` | JWT (butcher owner or ADMIN) |

**Create body:** `thumbnail`, optional `mediaUrl`, captions, `type`, optional `duration`.

---

## 4. Backend Flow

```
StoriesService.getActiveButcherStories()
  → findActiveButcherStories (expiresAt > now, not deleted)
  → cache butchers:stories:active (30s)

StoriesService.createButcherStory()
  → findButcherByUserId — 403 if no butcher
  → createButcherStory, invalidate cache
```

**No** `recordView`, reactions, or reply endpoints for butcher stories.

---

## 5. Database

| Model | Notes |
|-------|-------|
| `ButcherStory` | `butcherId`, `type` (`StoryType`), `seen` boolean (default false — **not updated by API**) |
| `Story` | User stories — different table |

`ButcherStory.seen` field exists but **no endpoint sets it** — effectively unused.

---

## 6. Socket

Not used.

---

## 7. Notifications

No notifications on butcher story publish in current code.

---

## 8. Redis

| Key | TTL |
|-----|-----|
| `butchers:stories:active` | 30s |

Also invalidated on `butchers.service` when loading butcher detail active stories.

---

## 9. BullMQ

Not used.

---

## 10. Security

- Create/delete require butcher profile linked to user
- Public read of active stories only
- Admin can delete any butcher story

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Viewer “like” is client-only | `story-viewer.tsx` local state |
| `seen` column never updated | Schema vs API gap |
| No view analytics for butcher stories | Unlike user `Story` |
| Confusion with user `/stories` | Separate controllers |

---

## 12. Production Readiness: **72%**

CRUD and public listing work. Gaps: view tracking, server-side engagement, notifications.

**Main files:** `backend-nest/src/stories/butcher-stories.controller.ts`, `stories.service.ts`, `app/butchers/story-viewer.tsx`
