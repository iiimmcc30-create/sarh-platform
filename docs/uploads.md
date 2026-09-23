# File Uploads

## 1. Business Purpose

Authenticated users upload images/videos/documents via **S3/Cloudinary presigned URLs** (production) or **local direct upload** (dev).

**Who uses it:** Mobile app for avatars, listings, posts, stories, butcher media, messages, butcher-application documents.

---

## 2. Frontend Flow

Typical flow:
1. `POST /api/upload/presign` with `{ folder, mimetype, count? }`
2. Client PUTs file to returned presigned URL
3. Uses public URL in subsequent API calls (listing images, story media, etc.)

Local dev may use `POST /api/upload/direct?folder=` multipart (when storage provider is `local`).

---

## 3. API Flow

Base: `/api/upload` — `upload.controller.ts`

| Method | URL | Auth | Purpose |
|--------|-----|------|---------|
| POST | `/upload/presign` | JWT | Generate presigned upload slot(s) |
| POST | `/upload/direct` | JWT | Local multer upload (dev only) |

**Presign body (`PresignUploadDto`):** `folder`, `mimetype`, optional `count` (default 1).

**Rate limit:** Max **30 uploads/hour/user** (`upload_count:{userId}` on Redis session DB).

---

## 4. Backend Flow

```
UploadController → UploadService
  presign → getPresignedUploadUrl() from lib/storage
  direct → multer disk → public/uploads/{folder}/
```

**Folders (`UploadFolder`):** `avatars`, `listings`, `stories`, `butchers`, `posts`, `temp`, `messages`, `butcher-applications`

**MIME rules:**
- Images: jpeg, png, webp, gif
- Stories/messages: images + story video types (`STORY_VIDEO_MIME_TYPES`)
- Butcher applications: `ALLOWED_DOCUMENT_MIME_TYPES` + size cap

**Size limits:** 20MB images, 50MB video/media folders; butcher docs per `MAX_SHOP_PHOTO_FILE_BYTES`.

**Storage provider:** `getStorageProvider()` — `local` | `s3` | `cloudinary` from env.

---

## 5. Database

Upload URLs stored as strings on entities (`User.avatar`, `Listing.images`, etc.). No separate `Upload` model.

---

## 6. Socket

Chat may send `imageUrl` / `videoUrl` from prior presign — not uploaded via socket.

---

## 7. Notifications

None on upload.

---

## 8. Redis

| Key | DB | TTL | Purpose |
|-----|-----|-----|---------|
| `upload_count:{userId}` | 2 | 3600s | Hourly upload quota |

---

## 9. BullMQ

`ImageQueueService.addImageProcessing` exists but **is never called** from upload flow (see `image-processing.md`).

---

## 10. Security

- JWT required
- Folder whitelist
- MIME validation per folder
- `IsOurUploadUrl` validator on some DTOs ensures URLs match configured storage
- Direct upload returns 404 when provider ≠ `local`

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| Rate limit skipped if Redis off | `enforceUploadRateLimit` returns early |
| No virus scanning | Not implemented |
| Presign TTL 300s | Large slow uploads may expire |
| Cloudinary misconfig opaque error | 503 `storage_error` |

---

## 12. Production Readiness: **88%**

Presign + validation is solid for production S3/Cloudinary. Image post-processing not wired.

**Main files:** `backend-nest/src/upload/`, `backend-nest/src/lib/storage` (via `@/lib/storage`)
