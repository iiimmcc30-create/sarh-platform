# Firebase (Push Only)

## 1. Business Purpose

Firebase Admin SDK is used **only** for sending FCM push messages in `PushProcessor`. There is **no** Firebase Analytics, Crashlytics, or Remote Config in the codebase.

---

## 2. Frontend Flow

Mobile obtains native FCM token via Expo Notifications (`app/lib/notifications.ts`), not Firebase JS SDK directly.

---

## 3. API Flow

No Firebase REST from clients. Server sends push after notification queue processing.

---

## 4. Backend Flow

**Single integration point:** `backend-nest/src/queue/processors/push.processor.ts`

```text
PushProcessor constructor:
  if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID)
    admin.initializeApp({ credential: cert(...) })

PushProcessor.process (job name 'send'):
  admin.messaging().send({
    token: fcmToken,
    notification: { title: titleAr, body: bodyAr },
    data,
    android: { priority: 'high', notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  })
```

**Error handling:** `messaging/registration-token-not-registered` → clear `User.fcmToken`.

**Early exit:** If Firebase not initialized, job completes without sending.

---

## 5. Database

Reads `User.fcmToken`; may null it on invalid token.

---

## 6. Socket

Not used.

---

## 7. Notifications

Firebase is the transport layer after `NotificationPersistService` enqueues push job.

---

## 8. Redis

Push jobs stored in BullMQ (Redis DB 1).

---

## 9. BullMQ

Queue: `push-notifications`, job: `send`, processor: `PushProcessor`.

---

## 10. Security

**Required env vars:**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_PRIVATE_KEY` (escaped `\n` normalized in code)
- `FIREBASE_CLIENT_EMAIL`

Service account must have FCM send permission. Keys must not be committed to git.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Silent no-op without env | No startup warning beyond missing sends |
| No Firebase Analytics | Confirmed — not in code |
| Badge always 1 on iOS | Static in APNS payload |
| No topic/multicast | Single `token` only |

---

## 12. Production Readiness: **80%**

Adequate for token-based push. Missing: analytics, batch send, rich media, failure metrics.

**Main file:** `backend-nest/src/queue/processors/push.processor.ts`
