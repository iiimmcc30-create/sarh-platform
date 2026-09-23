# Image Processing (Queue Stub)

## 1. Business Purpose

Planned async image transforms (resize, watermark, format conversion) after upload. **Currently a no-op stub** — jobs can be enqueued only via `ImageQueueService`, which has **no callers** in the codebase.

---

## 2. Frontend Flow

Not used. Clients upload final images via presign/direct upload without post-processing.

---

## 3. API Flow

No REST endpoint for image processing.

---

## 4. Backend Flow

```
ImageQueueService.addImageProcessing(job)
  → queue 'image-processing', job name 'process'
    → ImageProcessingProcessor.process()
      → logs debug "no-op stub" and returns
```

**Job type (`ImageJob`):** `fileKey`, `bucket`, `operations` (defined in `queue.types`).

**Processor concurrency:** 2

---

## 5. Database

No persistence of processing jobs beyond BullMQ Redis metadata.

---

## 6. Socket

Not used.

---

## 7. Notifications

Not used.

---

## 8. Redis

Queue on DB 1. `removeOnComplete: 20`, `removeOnFail: 50`.

---

## 9. BullMQ

| Queue | Job | Processor | Status |
|-------|-----|-----------|--------|
| `image-processing` | `process` | `ImageProcessingProcessor` | **Stub only** |

---

## 10. Security

If implemented, must validate `fileKey` ownership and sandbox operations.

---

## 11. Possible Bugs / Risks

| Risk | Evidence |
|------|----------|
| **Not implemented** | Processor only logs |
| Dead code path | `addImageProcessing` never imported elsewhere |
| False expectation of auto thumbnails | Upload URLs used as-is |

---

## 12. Production Readiness: **5%**

Infrastructure registered; zero functional processing. Safe to ignore in ops until implemented.

**Main files:** `backend-nest/src/queue/processors/image-processing.processor.ts`, `services/image-queue.service.ts`
