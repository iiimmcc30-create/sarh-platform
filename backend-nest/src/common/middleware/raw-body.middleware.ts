import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const MAX_RAW_BODY_BYTES = 256 * 1024; // 256 KiB — enough for NI webhooks

@Injectable()
export class RawBodyMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'POST') return next();

    let data = '';
    let size = 0;
    let aborted = false;

    req.on('data', (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_RAW_BODY_BYTES) {
        aborted = true;
        res.status(413).json({ error: 'payload_too_large' });
        req.destroy();
        return;
      }
      data += chunk.toString();
    });
    req.on('end', () => {
      if (aborted) return;
      (req as Request & { rawBody?: string }).rawBody = data;
      try {
        req.body = data ? JSON.parse(data) : {};
      } catch {
        req.body = data;
      }
      next();
    });
    req.on('error', next);
  }
}
