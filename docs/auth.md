# Authentication

## 1. Business Purpose

Authentication lets users and staff securely access the platform. It supports:

- **Customers / butchers (mobile):** Phone OTP, password login, Google OAuth, registration, password reset.
- **Admin / moderators (web):** Separate admin login (`POST /admin/auth/login`).

**Who uses it:** All authenticated users (`User` role `USER`, `ADMIN`, `MODERATOR`). Guests can access `@Public` endpoints only.

---

## 2. Frontend Flow

### Mobile (`app/`)

| Screen | Path | Trigger |
|--------|------|---------|
| Phone entry | `app/auth/phone.tsx` | User enters phone |
| OTP | `app/auth/otp.tsx` | After send-otp |
| Register | `app/auth/register.tsx` | New user after OTP |
| Forgot password | `app/auth/forgot-password.tsx` | Reset flow |

**State:** `contexts/AuthContext.tsx` — no Redux, no React Query.

**Flow:**
1. `sendOtp(phone)` → `POST /api/auth/send-otp`
2. `verifyOtp(code)` → `POST /api/auth/verify-otp` → returns `phone_token` or full tokens
3. Register: `register()` with `phone_token` → `POST /api/auth/register`
4. Login: `login(username, password)` → `POST /api/auth/login`
5. Tokens stored in AsyncStorage; `authFetch` (`services/authFetch.ts`) attaches Bearer + auto-refresh on 401

**Sockets:** Not used for auth.

**Errors:** Alert dialogs in auth screens; 401 triggers refresh or logout.

### Admin (`admin-panel/`)

| Screen | Path |
|--------|------|
| Login | `src/app/login/page.tsx` |

Flow: `adminLogin()` → persist `admin_access_token` + cookie → redirect `/`.

---

## 3. API Flow

Base: `/api/auth/*` — `auth.controller.ts`

| Method | URL | Auth | Rate limit |
|--------|-----|------|------------|
| POST | `/auth/login` | Public | `auth` (5/15min) |
| POST | `/auth/register` | Public | `auth` |
| POST | `/auth/refresh` | Public | `auth` |
| POST | `/auth/logout` | JWT | — |
| POST | `/auth/change-password` | JWT | `auth` |
| POST | `/auth/send-otp` | Public | `auth` |
| POST | `/auth/verify-otp` | Public | `auth` |
| POST | `/auth/google` | Public | `auth` |
| POST | `/auth/reset-password` | Public | `auth` |
| POST | `/auth/verify-email` | JWT | `auth` |
| POST | `/auth/resend-verification` | JWT | `auth` |

**Admin:** `POST /api/admin/auth/login` — `admin.controller.ts`

**Response envelope:** `{ success: true, data: { accessToken, refreshToken, user } }`

**Error codes:** `ApiException` — 400 validation, 401 unauthorized, 409 conflict, 429 rate limit.

---

## 4. Backend Flow

```
AuthController
  → AuthService
    → AuthRepository (User, UserSession CRUD)
    → JwtTokenService (sign/verify)
    → RedisSessionService (blacklist)
    → Twilio (OTP) when configured
```

**Login:** Validate credentials → `passwordVersion` in JWT → create `UserSession` → enforce max 5 sessions.

**Refresh:** Verify refresh JWT → rotate session → detect reuse → invalidate all sessions on theft.

**Logout:** Blacklist access token (Redis 15min TTL) → delete refresh session → `SocketDisconnectService.disconnectUser()`.

**OTP:** Twilio Verify API; dev fallback `123456` when Twilio env missing.

---

## 5. Database

| Model | Purpose |
|-------|---------|
| `User` | Credentials, `passwordHash`, `passwordVersion`, `role`, `fcmToken` |
| `UserSession` | `refreshToken`, `expiresAt`, `deviceInfo` |

Indexes: `User.username`, `User.email`, `User.phone` unique; `UserSession.userId`, `expiresAt`.

---

## 6. Socket

Auth does not use sockets directly. On logout/password change, `SocketDisconnectService` publishes `socket:disconnect` on Redis to force disconnect.

---

## 7. Notifications

- Welcome email via `EmailQueueService` on registration (if configured).
- Email verification codes in Redis (`email_verify:{userId}`).

No push on login.

---

## 8. Redis

| Key | DB | Purpose |
|-----|-----|---------|
| `blacklist:{token}` | 2 | Revoked access tokens |
| `email_verify:{userId}` | 2 | Email verification code |
| `email_verify_cooldown:{userId}` | 2 | Resend cooldown |

---

## 9. BullMQ

Auth does not enqueue jobs directly. Email verification/welcome may use `emails` queue indirectly.

---

## 10. Security

- Global `JwtAuthGuard` except `@Public`, `@OptionalAuth`
- `passwordVersion` invalidates tokens after password change
- Refresh token rotation + reuse detection
- Rate limit on auth endpoints (5/15min)
- OTP via Twilio (or dev static code)
- Admin login separate endpoint; backend validates staff role

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Dev OTP `123456` when Twilio unset | `auth.service.ts` — must disable in production |
| Admin middleware only checks cookie presence | `admin-panel/src/middleware.ts` |
| `activeMode` USER/BUTCHER is client-only | Not enforced server-side as separate role |
| Session limit race on concurrent logins | Possible duplicate 6th session briefly |

---

## 12. Production Readiness: **92%**

Core JWT + OTP + refresh is production-grade. Gaps: admin edge middleware validation, ensure Twilio enabled in prod.

**Main files:** `backend-nest/src/auth/`, `app/contexts/AuthContext.tsx`, `admin-panel/src/services/auth.service.ts`
