import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import {
  SHARE_DEFAULT_DESCRIPTION,
  SHARE_SITE,
  clip,
  formatPriceAr,
  renderSharePreview,
  type SharePreview,
} from './share-preview.html';

/** Ids are uuids / cuid-like; usernames are [a-z0-9_]. Anything else is a 404 card. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const USERNAME_RE = /^[A-Za-z0-9_.]{1,40}$/;

/**
 * Link-preview pages for crawlers only. nginx routes known preview bots on
 * /l/:id, /post/:id and /u/:username here (see nginx/web-location.conf);
 * people always get the web app. Read-only, public data only.
 */
@Controller('og')
export class SharePreviewController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @RateLimit('api')
  @Get('l/:id')
  async listing(@Param('id') id: string, @Res() res: Response) {
    const url = `${SHARE_SITE}/l/${encodeURIComponent(id)}`;
    const listing = ID_RE.test(id)
      ? await this.prisma.listing.findFirst({
          where: { id, deletedAt: null, status: { in: ['active', 'sold'] } },
          select: {
            title: true,
            arabicTitle: true,
            description: true,
            price: true,
            currency: true,
            location: true,
            images: true,
          },
        })
      : null;
    if (!listing) return this.send(res, this.fallback(url), 404);
    const price = formatPriceAr(listing.price, listing.currency);
    const name = listing.arabicTitle || listing.title;
    return this.send(res, {
      url,
      type: 'product',
      title: price ? `${name} — ${price}` : name,
      description: [listing.location, clip(listing.description, 160)].filter(Boolean).join(' · '),
      image: listing.images?.[0] ?? null,
    });
  }

  @Public()
  @RateLimit('api')
  @Get('post/:id')
  async post(@Param('id') id: string, @Res() res: Response) {
    const url = `${SHARE_SITE}/post/${encodeURIComponent(id)}`;
    const post = ID_RE.test(id)
      ? await this.prisma.post.findFirst({
          where: { id, deletedAt: null },
          select: {
            content: true,
            images: true,
            media: { select: { url: true, type: true }, orderBy: { sortOrder: 'asc' }, take: 4 },
            author: { select: { arabicName: true, displayName: true, username: true, avatar: true, isActive: true } },
          },
        })
      : null;
    if (!post || post.author?.isActive === false) return this.send(res, this.fallback(url), 404);
    const author = post.author?.arabicName || post.author?.displayName || post.author?.username || 'سرح';
    const mediaImage = post.media?.find((m) => String(m.type).toUpperCase() === 'IMAGE')?.url;
    return this.send(res, {
      url,
      type: 'article',
      title: `${author} على سرح`,
      description: clip(post.content, 200) || SHARE_DEFAULT_DESCRIPTION,
      image: mediaImage ?? post.images?.[0] ?? post.author?.avatar ?? null,
    });
  }

  @Public()
  @RateLimit('api')
  @Get('u/:username')
  async profile(@Param('username') username: string, @Res() res: Response) {
    const url = `${SHARE_SITE}/u/${encodeURIComponent(username)}`;
    const user = USERNAME_RE.test(username)
      ? await this.prisma.user.findFirst({
          where: { username: { equals: username, mode: 'insensitive' }, isActive: true, deletedAt: null },
          select: { arabicName: true, displayName: true, username: true, bio: true, avatar: true },
        })
      : null;
    if (!user) return this.send(res, this.fallback(url), 404);
    const name = user.arabicName || user.displayName || user.username;
    return this.send(res, {
      url,
      type: 'profile',
      title: `${name} (@${user.username}) على سرح`,
      description: clip(user.bio, 200) || SHARE_DEFAULT_DESCRIPTION,
      image: user.avatar ?? null,
    });
  }

  private fallback(url: string): SharePreview {
    return { url, title: 'سرح', description: SHARE_DEFAULT_DESCRIPTION, image: null };
  }

  private send(res: Response, preview: SharePreview, status = 200) {
    res
      .status(status)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .setHeader('Cache-Control', status === 200 ? 'public, max-age=600' : 'public, max-age=60')
      .send(renderSharePreview(preview));
  }
}
