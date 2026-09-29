/**
 * Per-kind upload limits (MB) — single source for the upload endpoints and
 * the message send check (REST + socket). Mirrored by the app's
 * `CHAT_UPLOAD_MAX_MB`.
 */
export const UPLOAD_MAX_MB = {
  image: 20,
  video: 50,
  audio: 10,
  support: 25,
} as const;

export const BYTES_PER_MB = 1024 * 1024;
