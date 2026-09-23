# Story Viewer (User Stories)

## 1. Business Purpose

Users publish 24-hour **ephemeral stories** with views, emoji reactions, and private replies. Viewers see grouped feeds with seen/unseen state.

**Distinct from butcher stories** — see `butcher-stories.md`.

---

## 2. Frontend Flow

### Mobile

| Screen | Path |
|--------|------|
| Create story | `app/create/story.tsx` |
| User story viewer | Integrated in feed / tabs (not `butchers/story-viewer.tsx`) |

**Constants:** `app/constants/stories.ts`, `app/services/stories.ts`

**Viewer UX:** Tap story ring → advance slides → reactions/reply call API.

`butchers/story-viewer.tsx` is for **butcher** stories only.

---

## 3. API Flow

Base: `/api/stories` — `stories.controller.ts`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| GET | `/stories/feed` | Optional | Grouped feed |
| GET | `/stories` | Optional | Flat list (legacy) |
| GET | `/stories/me` | JWT | Own stories |
| GET | `/stories/user/:userId` | Optional | User’s active stories |
| POST | `/stories` | JWT | Create |
| DELETE | `/stories/:id` | JWT | Delete own (admin override) |
| POST | `/stories/:id/view` | JWT | Record unique view |
| GET | `/stories/:id/viewers` | JWT | Owner/admin viewer list |
| POST | `/stories/:id/reactions` | JWT | Set reaction `{ type }` |
| DELETE | `/stories/:id/reactions` | JWT | Remove reaction |
| POST | `/stories/:id/reply` | JWT | DM reply `{ text }` |

---

## 4. Backend Flow

```
StoriesService
  getFeed → buildFeed (group by user, seen/unseen)
  recordView → StoryViewRepository (unique per viewer)
  setReaction → StoryReactionRepository upsert + count sync
  replyToStory → MessagesService.sendMessage + notification
```

**Active filter:** `expiresAt > now` AND `deletedAt IS NULL` (`stories.repository.ts`).

**Owner view:** Self-views do not increment `viewsCount`.

**Reaction notify:** `story_reaction` to owner if new/changed reaction.

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `Story` | Media, caption, `expiresAt`, counters |
| `StoryView` | Unique `(storyId, viewerId)` |
| `StoryReaction` | Unique `(storyId, userId)`, `type` string |

---

## 6. Socket

Not used for story views/reactions (REST only).

---

## 7. Notifications

| Type | Trigger |
|------|---------|
| `story_reaction` | Someone reacts to your story |
| `story_reply` | DM reply to your story |

---

## 8. Redis

| Key | TTL |
|-----|-----|
| `stories:feed:{viewerId\|anon}` | 20s |
| `stories:feed:*` | Invalidated on create/view/reaction |

---

## 9. BullMQ

Notifications via standard queue on reaction/reply.

---

## 10. Security

- View/reply require auth for mutations
- Viewers list: owner or `ADMIN` only
- Cannot reply to own story
- Expired stories return 404 on view/react/reply

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Reaction type not enum-validated | Free string in DTO |
| Feed cache may show stale seen state | 20s TTL |
| No socket realtime for new stories | Poll/refresh only |

---

## 12. Production Readiness: **88%**

Full view/reaction/reply pipeline implemented. Gaps: realtime updates, reaction type catalog.

**Main files:** `backend-nest/src/stories/stories.service.ts`, `stories.controller.ts`
