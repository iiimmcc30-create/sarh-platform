import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { ContentService } from './content.service';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownLiteToHtml(body: string): string {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      parts.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith('• ') || line.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`);
      continue;
    }
    closeList();
    parts.push(`<p>${escapeHtml(line.trim())}</p>`);
  }
  closeList();
  return parts.join('\n');
}

/**
 * Public HTML privacy policy for Google Play Console (hosted URL requirement).
 * Served at GET /privacy (outside /api prefix).
 */
@Controller()
export class PrivacyPageController {
  constructor(private readonly content: ContentService) {}

  @Public()
  @RateLimit('api')
  @Get('privacy')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async privacy(@Res() res: Response) {
    const section = await this.content.getPublicSection('privacy');
    const title = section?.titleAr?.trim() || 'سياسة الخصوصية';
    const bodyAr =
      section?.bodyAr?.trim() ||
      'توضح هذه الصفحة سياسة خصوصية منصة سرح. للتفاصيل داخل التطبيق: الإعدادات ← الخصوصية.';
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — سرح</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      margin: 0; padding: 24px; line-height: 1.7; color: #0f172a; background: #f8fafc; }
    main { max-width: 720px; margin: 0 auto; background: #fff; padding: 28px 24px;
      border-radius: 16px; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
    h1 { font-size: 1.6rem; margin: 0 0 8px; }
    .meta { color: #64748b; font-size: .95rem; margin-bottom: 24px; }
    h2 { font-size: 1.15rem; margin: 1.4rem 0 .5rem; }
    p, li { font-size: 1rem; color: #1e293b; }
    ul { padding-inline-start: 1.2rem; }
    a { color: #0f766e; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">منصة سرح · <a href="https://sarhsa.online">sarhsa.online</a> · للتواصل: sarh@sarhsa.online</p>
    ${markdownLiteToHtml(bodyAr)}
  </main>
</body>
</html>`;
    res.status(200).send(html);
  }
}
