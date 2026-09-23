# Push Notifications (FCM)

## 1. Business Purpose

Push notifications deliver Arabic alerts to the user’s device when in-app notifications are created, using **Firebase Cloud Messaging** with native device tokens from Expo.

**Who uses it:** Mobile users on **development/production builds** (not Expo Go). Web push is **not implemented**.

---

## 2. Frontend Flow

### Mobile (`app/lib/notifications.ts`)

| Function | Purpose |
|----------|---------|
| `registerForPushNotifications()` | Permission + `Notifications.getDevicePushTokenAsync()` |
| `syncPushToken(userId)` | `PUT /api/users/:id` with `{ fcmToken }` if changed |
| `clearPushTokenOnLogout()` | Clears server token + AsyncStorage |
| `listenForegroundNotifications()` | Expo foreground handler |
| `listenNotificationResponses()` | Tap handler → `handleNotificationNavigation()` |
| `getInitialNotificationData()` | Cold-start from notification |

**Storage keys:** `safat_push_token`, `safat_push_token_synced`.

**Android channel:** `default` — “إشعارات صفاة”, HIGH importance.

**Skipped when:** `Platform.OS === 'web'`, simulator, or Expo Go (`storeClient`).

**Integration:** Typically called from `AuthContext` after login (`syncPushToken`).

---

## 3. API Flow

Push is **not** sent via a dedicated REST endpoint from the client.

| Method | URL | Purpose |
|--------|-----|---------|
| PUT | `/api/users/:id` | Body `{ fcmToken: string \| null }` — stores token on `User.fcmToken` |

Token is read server-side when enqueueing push after notification persist.

---

## 4. Backend Flow

```
NotificationPersistService.enqueuePushAfterPersist()
  → NotificationRepository.findUserFcmToken(userId)
  → PushQueueService.addPush({ fcmToken, titleAr, bodyAr, data })
    → PushProcessor (job name: 'send')
      → firebase-admin.messaging().send()
```

**Invalid token:** On `messaging/registration-token-not-registered`, clears `User.fcmToken` in DB.

**Firebase init:** Only in `PushProcessor` constructor when `FIREBASE_PROJECT_ID` is set.

---

## 5. Database

| Field | Model | Purpose |
|-------|-------|---------|
| `fcmToken` | `User` | Latest FCM/APNs device token; nulled on invalid token or logout |

---

## 6. Socket

Not used for push delivery.

---

## 7. Notifications

Push payload `data` includes stringified fields from the in-app notification plus `notificationId` and `type`. Client navigation uses `handleNotificationNavigation()` in `lib/notifications.ts` (supports `event` field for butcher-application flows).

---

## 8. Redis

BullMQ queue `push-notifications` uses Redis **DB 1** (see `bullmq.md`). No separate FCM token cache in Redis.

---

## 9. BullMQ

| Queue | Job | Concurrency | Processor |
|-------|-----|-------------|-----------|
| `push-notifications` | `send` | 5 | `PushProcessor` |

Skipped when Redis disabled or queue unavailable (`PushQueueService` returns null).

---

## 10. Security

- FCM credentials via env: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`.
- Users can only update their own `fcmToken` via authenticated `PUT /users/:id`.
- Push `data` is client-trusted for navigation only; sensitive actions still require API auth.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| No push if Firebase env missing | `PushProcessor` returns early when `!admin.apps.length` |
| Expo Go cannot test FCM | Explicit skip in `registerForPushNotifications` |
| iOS requires EAS build + credentials | `getExpoProjectId()` for EAS |
| Token sync race on fast logout | `clearPushTokenOnLogout` best-effort |

---

## 12. Production Readiness: **85%**

Pipeline is complete when Firebase + EAS build are configured. Gaps: no web push, no topic/broadcast API, no delivery receipts.

**Main files:** `backend-nest/src/queue/processors/push.processor.ts`, `app/lib/notifications.ts`
