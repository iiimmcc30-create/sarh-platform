# Story Expiration & Cleanup

## 1. Business Purpose

User and butcher stories expire **24 hours** after creation (`Story.expiresAt` / `ButcherStory.expiresAt`). Expired stories are hidden from feeds immediately; physical deletion happens on a schedule.

---

## 2. Frontend Flow

- Stories not yet expired appear in feeds; expired ones disappear on next fetch.
- `storyTimeLeftLabel()` in `shared/lib/stories.ts` shows Arabic time remaining in UI.

---

## 3. API Flow

No dedicated “expire” endpoint. Expiration is **time-based** in queries:

```sql
WHERE expiresAt > NOW()
```

Create endpoints set `expiresAt = storyExpiresAt()` → `now + 24h`.

---

## 4. Backend Flow

### At read time

- `findActiveStories`, `findActiveButcherStories` filter `expiresAt > new Date()`
- `recordView`, `setReaction`, `replyToStory` reject if `expiresAt <= now`

### Scheduled cleanup

`WorkerCronService` (03:00 daily) → `POST /admin/cleanup` → `AdminRepository.runCleanup`:

| Action | Condition |
|--------|-----------|
| `story.deleteMany` | `expiresAt < 30 days ago` AND `deletedAt IS NULL` |
| `story.deleteMany` | Soft-deleted stories past retention archive date |

**Note:** Stories remain in DB up to ~30 days after expiry before hard delete (if not soft-deleted earlier).

### Manual delete

User `DELETE /stories/:id` → `softDeleteStory` (sets `deletedAt`).

---

## 5. Database

| Model | Field |
|-------|-------|
| `Story` | `expiresAt` indexed |
| `ButcherStory` | `expiresAt` indexed |

**Lifetime constant:** `STORY_LIFETIME_MS = 24 * 60 * 60 * 1000` (`shared/lib/stories.ts`).

---

## 6. Socket

Not used.

---

## 7. Notifications

No “story expired” notification.

---

## 8. Redis

Feed caches invalidated on create/delete; expired stories drop out when cache refreshes.

---

## 9. BullMQ

Cleanup triggered via HTTP from worker cron, not a BullMQ job.

---

## 10. Security

Expired content not returned by active queries; owner can still delete via API if row exists.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| 30-day lag before hard delete | `runCleanup` threshold |
| No cron for butcher story expiry-only rows | Same cleanup paths |
| Clock skew | Server `Date` dependent |

---

## 12. Production Readiness: **85%**

Expiration logic is correct for UX. Retention window is long; no immediate purge job.

**Main files:** `backend-nest/src/shared/lib/stories.ts`, `admin/repositories/admin.repository.ts` (`runCleanup`)
