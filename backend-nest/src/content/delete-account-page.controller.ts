import { Body, Controller, Get, Header, Post, Res } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { Public, RateLimit } from '../common/decorators/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../common/services/logger.service';
import { SARH_OFFICIAL_EMAIL } from './official-contact';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Saudi mobile: 05xxxxxxxx, 5xxxxxxxx, 9665xxxxxxxx, +9665xxxxxxxx. */
export function normalizeSaudiMobile(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '').replace(/^\+/, '');
  const local = digits.startsWith('966') ? `0${digits.slice(3)}` : digits;
  const withZero = local.startsWith('5') ? `0${local}` : local;
  if (!/^05\d{8}$/.test(withZero)) return null;
  return `+966${withZero.slice(1)}`;
}

export class DeleteAccountRequestDto {
  @IsString()
  @Matches(/^[\d+\s-]{9,16}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Honeypot — real users leave this empty. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}

const PAGE_CSS = `
  body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
    margin: 0; padding: 24px; line-height: 1.7; color: #0f172a; background: #f8fafc; }
  main { max-width: 720px; margin: 0 auto; background: #fff; padding: 28px 24px;
    border-radius: 16px; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
  h1 { font-size: 1.6rem; margin: 0 0 8px; }
  h2 { font-size: 1.15rem; margin: 1.4rem 0 .5rem; }
  .meta, .hint { color: #64748b; font-size: .95rem; }
  p, li { font-size: 1rem; color: #1e293b; }
  ul { padding-inline-start: 1.2rem; }
  a { color: #0f766e; }
  label { display: block; font-weight: 600; margin-top: 12px; }
  input, textarea { width: 100%; box-sizing: border-box; margin-top: 6px;
    padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font: inherit; }
  button { margin-top: 16px; background: #0f766e; color: #fff; border: 0;
    border-radius: 10px; padding: 12px 18px; font: inherit; cursor: pointer; }
  .hp { position: absolute; left: -9999px; height: 0; overflow: hidden; }
  .ok { background: #ecfdf5; border: 1px solid #6ee7b7; padding: 12px 14px; border-radius: 10px; }
  .err { background: #fef2f2; border: 1px solid #fecaca; padding: 12px 14px; border-radius: 10px; }
`;

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — سرح</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">منصة سرح · <a href="https://getsarh.com">getsarh.com</a> · <a href="/privacy">سياسة الخصوصية</a></p>
    ${body}
  </main>
</body>
</html>`;
}

function explainBody(banner = ''): string {
  return `${banner}
    <h2>الحذف من داخل التطبيق</h2>
    <p>افتح تطبيق سرح ← الإعدادات والخصوصية ← الحساب ← حذف الحساب، ثم أكّد الحذف. يُسجَّل خروجك فوراً ويُجهَّل الحساب.</p>
    <h2>طلب الحذف بدون تثبيت التطبيق</h2>
    <p>إذا لم يعد التطبيق مثبتاً، أرسل رقم الجوال المسجّل في الحساب. يصل الطلب إلى فريق الإدارة كتذكرة دعم ويُراجع يدوياً قبل تنفيذ الحذف. لن يُحذف الحساب بمجرد إرسال النموذج.</p>
    <form method="post" action="/delete-account">
      <label for="phone">رقم الجوال</label>
      <input id="phone" name="phone" inputmode="tel" autocomplete="tel" required placeholder="05xxxxxxxx" />
      <label for="note">ملاحظة (اختياري)</label>
      <textarea id="note" name="note" rows="3" maxlength="500" placeholder="اسم المستخدم إن تذكّرته"></textarea>
      <div class="hp" aria-hidden="true">
        <label for="website">الموقع</label>
        <input id="website" name="website" tabindex="-1" autocomplete="off" />
      </div>
      <button type="submit">إرسال طلب الحذف</button>
    </form>
    <p class="hint">أو راسلنا على <a href="mailto:${SARH_OFFICIAL_EMAIL}">${SARH_OFFICIAL_EMAIL}</a> من بريدك مع رقم الجوال.</p>
    <h2>ما يُحذف عند تنفيذ الطلب</h2>
    <ul>
      <li>بيانات الحساب الظاهرة: الاسم، اسم المستخدم، الجوال، البريد، الصورة، الغلاف، والنبذة — تُمسح من الصف فوراً.</li>
      <li>الجلسات ورموز الإشعارات — تُبطل فوراً.</li>
      <li>محتوى الإعلانات والمنشورات والقصص ووسائطها — يُمسح ويُجدول حذفه من التخزين السحابي خلال ساعات (مهمة دورية كل ساعة، حتى 5 محاولات).</li>
      <li>نص تعليقاتك ورسائلك — يُستبدل بـ«محتوى محذوف» وتُزال وسائط رسائلك.</li>
      <li>طلب التوثيق وصور الهوية — تُحذف من القاعدة وتُجدول ملفاتها للحذف.</li>
    </ul>
    <h2>ما يُحفظ ولماذا</h2>
    <ul>
      <li>سجلات المدفوعات والرسوم والاشتراكات — تبقى مرتبطة بصف مجهول الهوية لأغراض محاسبية ونظامية. المدة يحددها الالتزام النظامي (لا تقل عن المدة التي يفرضها النظام المحاسبي).</li>
      <li>تذاكر الدعم والبلاغات — تبقى لمعالجة النزاعات والاحتيال.</li>
      <li>سجل الموافقة على سياسة الخصوصية — يبقى كإثبات بعد مسح عنوان IP وبيانات الجهاز.</li>
      <li>النسخ الاحتياطية لقاعدة البيانات — تُدوَّر حسب جدول النسخ على الخادم ولا تُستخدم لإعادة تفعيل الحساب.</li>
    </ul>
    <p class="hint">الإعلان المحذوف يُخفى ثم يُحذف نهائياً خلال 90 يوماً. القصص تنتهي بعد 24 ساعة وتُحذف بعد 30 يوماً.</p>`;
}

/**
 * Public account-deletion page for Google Play.
 * GET explains the process. POST files a support ticket for staff — it does
 * not delete the account by itself.
 */
@Controller()
export class DeleteAccountPageController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @Public()
  @RateLimit('api')
  @Get('delete-account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  page(@Res() res: Response) {
    res.status(200).send(shell('حذف الحساب', explainBody()));
  }

  @Public()
  @RateLimit('auth')
  @Post('delete-account')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async submit(@Body() dto: DeleteAccountRequestDto, @Res() res: Response) {
    if (dto.website?.trim()) {
      res.status(200).send(shell('حذف الحساب', explainBody(
        '<p class="ok">تم استلام الطلب.</p>',
      )));
      return;
    }

    const phone = normalizeSaudiMobile(dto.phone ?? '');
    if (!phone) {
      res.status(400).send(shell('حذف الحساب', explainBody(
        '<p class="err">أدخل رقم جوال سعودي صحيح يبدأ بـ 05.</p>',
      )));
      return;
    }

    const note = (dto.note ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
    const year = new Date().getUTCFullYear();
    const ticketNumber = `SRH-${year}-W${Date.now().toString(36).toUpperCase()}`;

    try {
      await this.prisma.supportTicket.create({
        data: {
          ticketNumber,
          type: 'SUPPORT',
          category: 'ACCOUNT',
          priority: 'HIGH',
          handlerMode: 'HUMAN_ACTIVE',
          subject: 'طلب حذف حساب من الويب',
          description: [
            'طلب حذف حساب أُرسل من صفحة getsarh.com/delete-account.',
            `الجوال: ${phone}`,
            note ? `ملاحظة: ${note}` : 'بدون ملاحظة.',
            'لا يُنفَّذ الحذف تلقائياً — راجع الهوية ثم نفّذ الحذف من لوحة الإدارة.',
          ].join('\n'),
          metadata: {
            source: 'web_delete_account',
            phone,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Web account-deletion request failed',
      );
      res.status(500).send(shell('حذف الحساب', explainBody(
        `<p class="err">تعذّر إرسال الطلب الآن. راسل ${SARH_OFFICIAL_EMAIL}.</p>`,
      )));
      return;
    }

    this.logger.info({ ticketNumber }, 'Web account-deletion request filed');
    res.status(200).send(shell('حذف الحساب', explainBody(
      `<p class="ok">تم استلام طلب الحذف برقم ${escapeHtml(ticketNumber)}. سيراجعه فريق سرح ولن يُحذف الحساب قبل التحقق.</p>`,
    )));
  }
}
