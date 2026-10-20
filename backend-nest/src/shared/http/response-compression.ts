import { constants, brotliCompressSync, gzipSync } from 'zlib';
import type { NextFunction, Request, Response } from 'express';

export const COMPRESSION_MIN_BYTES = 1024;
export const COMPRESSION_MAX_BYTES = 2 * 1024 * 1024;

export type ContentEncoding = 'br' | 'gzip';

/** Prefer Brotli when the client asks for it, otherwise gzip. */
export function negotiateEncoding(
  acceptEncoding: string | undefined,
): ContentEncoding | null {
  const header = acceptEncoding ?? '';
  if (/\bbr\b/i.test(header)) return 'br';
  if (/\bgzip\b/i.test(header)) return 'gzip';
  return null;
}

export function isCompressibleType(contentType: string | undefined): boolean {
  const type = (contentType ?? '').toLowerCase();
  if (!type) return false;
  if (/image\/|video\/|audio\/|octet-stream|pdf|zip|gzip|wasm/.test(type)) {
    return false;
  }
  return /json|text|javascript|xml|svg|wasm-text/.test(type);
}

export function shouldCompressBody(
  contentType: string | undefined,
  byteLength: number,
): boolean {
  if (byteLength < COMPRESSION_MIN_BYTES || byteLength > COMPRESSION_MAX_BYTES) {
    return false;
  }
  return isCompressibleType(contentType);
}

export function compressBody(
  body: Buffer,
  encoding: ContentEncoding,
): Buffer {
  if (encoding === 'br') {
    return brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
    });
  }
  return gzipSync(body, { level: 5 });
}

function appendVary(current: unknown, token: string): string {
  const value = Array.isArray(current) ? current.join(', ') : String(current ?? '');
  if (!value) return token;
  if (value.toLowerCase().split(',').some((part) => part.trim() === token.toLowerCase())) {
    return value;
  }
  return `${value}, ${token}`;
}

/**
 * Compress JSON/text API responses. Nginx still gzips static files; it does
 * not recompress a body that already has Content-Encoding.
 * The stock nginx:1.27-alpine image has gzip and not ngx_brotli, so Brotli
 * is applied here when the client sends Accept-Encoding: br.
 */
type LooseResponse = Response & {
  write: (chunk: unknown, enc?: unknown, cb?: unknown) => boolean;
  end: (chunk?: unknown, enc?: unknown, cb?: unknown) => Response;
};

export function responseCompression(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const path = req.path || '';
  if (path.startsWith('/uploads') || path.startsWith('/api/upload')) return next();
  const accept = req.headers['accept-encoding'];
  const encoding = negotiateEncoding(Array.isArray(accept) ? accept.join(',') : accept);
  if (!encoding) return next();

  const chunks: Buffer[] = [];
  const loose = res as LooseResponse;
  const originalWrite = loose.write.bind(res);
  const originalEnd = loose.end.bind(res);
  let captured = true;

  loose.write = (chunk: unknown, enc?: unknown, cb?: unknown) => {
    if (!captured) return originalWrite(chunk, enc, cb);
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    if (typeof enc === 'function') (enc as () => void)();
    if (typeof cb === 'function') (cb as () => void)();
    return true;
  };

  loose.end = (chunk?: unknown, enc?: unknown, cb?: unknown) => {
    let payload = chunk;
    let encodingArg = enc;
    let done = cb;
    if (typeof payload === 'function') {
      done = payload;
      payload = undefined;
      encodingArg = undefined;
    } else if (typeof encodingArg === 'function') {
      done = encodingArg;
      encodingArg = undefined;
    }
    if (!captured || res.headersSent) {
      loose.write = originalWrite;
      loose.end = originalEnd;
      return originalEnd(payload, encodingArg, done);
    }
    if (payload) {
      chunks.push(
        Buffer.isBuffer(payload)
          ? payload
          : Buffer.from(String(payload), typeof encodingArg === 'string' ? encodingArg : 'utf8'),
      );
    }
    const body = Buffer.concat(chunks);
    const type = String(res.getHeader('Content-Type') ?? '');
    const already = res.getHeader('Content-Encoding');
    loose.write = originalWrite;
    loose.end = originalEnd;
    captured = false;
    if (already || !shouldCompressBody(type, body.length)) {
      return originalEnd(body, done);
    }
    const compressed = compressBody(body, encoding);
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Vary', appendVary(res.getHeader('Vary'), 'Accept-Encoding'));
    res.removeHeader('Content-Length');
    return originalEnd(compressed, done);
  };

  next();
}
