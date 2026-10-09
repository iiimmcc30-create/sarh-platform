/**
 * Worker side of MediaDeletionJob: deletes queued files from OUR storage only.
 * Cloudinary: our cloud + a public_id under CLOUDINARY_FOLDER; S3: our bucket.
 * Anything else (seed / external URLs) is marked done as skipped, never
 * fetched. Failures are retried on the next run up to MAX_ATTEMPTS.
 */
import { parseCloudinaryUrl } from '../../messages/lib/message-media';
import {
  deleteS3Object,
  destroyCloudinaryAsset,
  getCloudinaryBaseFolder,
  getCloudinaryCloudName,
  getStorageProvider,
  s3KeyFromUrl,
  type CloudinaryAssetRef,
} from './storage';

export const MEDIA_DELETION_MAX_ATTEMPTS = 5;
export const MEDIA_DELETION_BATCH = 100;

export type MediaDeletionTarget =
  | { kind: 'cloudinary'; ref: CloudinaryAssetRef }
  | { kind: 's3'; key: string }
  | { kind: 'skip'; reason: string };

export function resolveMediaDeletionTarget(url: string): MediaDeletionTarget {
  const ref = parseCloudinaryUrl(url);
  if (ref) {
    const cloud = getCloudinaryCloudName();
    if (!cloud || ref.cloudName !== cloud) {
      return { kind: 'skip', reason: 'foreign_cloud' };
    }
    const base = getCloudinaryBaseFolder();
    const segs = ref.publicId.split('/');
    const at = segs.indexOf(base);
    if (at < 0 || at === segs.length - 1) {
      return { kind: 'skip', reason: 'outside_base_folder' };
    }
    return {
      kind: 'cloudinary',
      ref: {
        resourceType: ref.resourceType,
        deliveryType: ref.deliveryType,
        publicId: segs.slice(at).join('/'),
        version: ref.version,
        format: ref.format,
      },
    };
  }
  if (getStorageProvider() === 's3') {
    const key = s3KeyFromUrl(url);
    if (key) return { kind: 's3', key };
  }
  return { kind: 'skip', reason: 'not_our_storage' };
}

export type MediaDeletionJobRow = { id: string; url: string; attempts: number };

export type MediaDeletionStore = {
  findPending(take: number): Promise<MediaDeletionJobRow[]>;
  markDone(id: string, note?: string): Promise<unknown>;
  markFailed(id: string, error: string): Promise<unknown>;
};

export async function processMediaDeletionBatch(
  store: MediaDeletionStore,
  take = MEDIA_DELETION_BATCH,
): Promise<{ deleted: number; skipped: number; failed: number }> {
  const jobs = await store.findPending(take);
  let deleted = 0;
  let skipped = 0;
  let failed = 0;
  for (const job of jobs) {
    const target = resolveMediaDeletionTarget(job.url);
    try {
      if (target.kind === 'skip') {
        await store.markDone(job.id, `skipped:${target.reason}`);
        skipped++;
        continue;
      }
      if (target.kind === 'cloudinary') {
        await destroyCloudinaryAsset(target.ref);
      } else {
        await deleteS3Object(target.key);
      }
      await store.markDone(job.id);
      deleted++;
    } catch (err) {
      failed++;
      await store.markFailed(
        job.id,
        (err instanceof Error ? err.message : String(err)).slice(0, 300),
      );
    }
  }
  return { deleted, skipped, failed };
}
