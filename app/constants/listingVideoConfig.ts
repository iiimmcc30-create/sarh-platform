/**
 * Listing video limits — kept in one place so they're easy to adjust.
 */
export const LISTING_VIDEO_CONFIG = {
  /** Max allowed duration in seconds. */
  MAX_DURATION_S: 45,
  /** Max allowed file size in megabytes. */
  MAX_FILE_MB: 200,
  /** Max allowed file size in bytes (derived). */
  get MAX_FILE_BYTES(): number {
    return this.MAX_FILE_MB * 1024 * 1024;
  },
} as const;
