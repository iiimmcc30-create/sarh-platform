import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { LoggerService } from '../../common/services/logger.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Parser = require('rss-parser') as new (
  options?: Record<string, unknown>,
) => {
  parseURL: (url: string) => Promise<{ items?: RssItem[] }>;
};

export type FetchedNewsItem = {
  title: string;
  url: string;
  publishedAt: Date | null;
  contentSnippet: string;
};

type RssItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  summary?: string;
};

@Injectable()
export class NewsFetcherService {
  private readonly parser = new Parser({
    timeout: 15000,
    headers: {
      'User-Agent': 'SarhKnowledgeCenter/1.0 (+https://sarh.app)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  constructor(private readonly logger: LoggerService) {}

  async fetchFromRss(feedUrl: string): Promise<FetchedNewsItem[]> {
    try {
      const feed = await this.parser.parseURL(feedUrl);
      return (feed.items ?? [])
        .map((item) => {
          const url = (item.link || item.guid || '').trim();
          const title = (item.title || '').trim();
          if (!url || !title) return null;
          const publishedAt = item.isoDate
            ? new Date(item.isoDate)
            : item.pubDate
              ? new Date(item.pubDate)
              : null;
          return {
            title,
            url,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            contentSnippet: (
              item.contentSnippet ||
              item.content ||
              item.summary ||
              title
            )
              .toString()
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 4000),
          } satisfies FetchedNewsItem;
        })
        .filter((item): item is FetchedNewsItem => item !== null);
    } catch (err) {
      this.logger.error({ err, feedUrl }, 'RSS fetch failed');
      throw err;
    }
  }

  async fetchFromApi(endpoint: string): Promise<FetchedNewsItem[]> {
    try {
      const res = await axios.get(endpoint, {
        timeout: 15000,
        headers: { Accept: 'application/json' },
      });
      const payload = res.data;
      const rows: unknown[] = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.articles)
            ? payload.articles
            : Array.isArray(payload?.data)
              ? payload.data
              : [];

      return rows
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const item = row as Record<string, unknown>;
          const title = String(
            item.title ?? item.originalTitle ?? item.headline ?? '',
          ).trim();
          const url = String(
            item.url ?? item.link ?? item.originalUrl ?? item.sourceUrl ?? '',
          ).trim();
          if (!title || !url) return null;
          const rawDate = item.publishedAt ?? item.pubDate ?? item.date;
          const publishedAt =
            typeof rawDate === 'string' || typeof rawDate === 'number'
              ? new Date(rawDate)
              : null;
          const snippet = String(
            item.summary ?? item.description ?? item.content ?? title,
          )
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 4000);
          return {
            title,
            url,
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime())
                ? publishedAt
                : null,
            contentSnippet: snippet,
          } satisfies FetchedNewsItem;
        })
        .filter((item): item is FetchedNewsItem => item !== null);
    } catch (err) {
      this.logger.error({ err, endpoint }, 'API news fetch failed');
      throw err;
    }
  }
}
