import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';

const APP_SCHEME = (process.env.APP_DEEP_LINK_SCHEME ?? 'sarh').replace(
  /:\/\/$/,
  '',
);
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? 'com.sarh.app';

function buildDeepLink(
  path: string,
  query: Record<string, string | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return `${APP_SCHEME}://${path}${qs ? `?${qs}` : ''}`;
}

function bridgeHtml(opts: {
  title: string;
  message: string;
  deepLink: string;
  intentLink: string;
}) {
  const { title, message, deepLink, intentLink } = opts;
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · سرح</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
      background: linear-gradient(160deg, #0B2B21 0%, #163526 55%, #0A1F18 100%);
      color: #fff; padding: 24px;
    }
    .card {
      width: min(420px, 100%); background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12); border-radius: 20px;
      padding: 28px 22px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    .mark {
      width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 16px;
      background: #284E39; display: grid; place-items: center; font-size: 28px;
    }
    h1 { font-size: 1.35rem; margin: 0 0 8px; }
    p { margin: 0 0 22px; color: rgba(255,255,255,.75); line-height: 1.6; font-size: .95rem; }
    a.btn {
      display: inline-block; text-decoration: none; background: #3CB371; color: #052015;
      font-weight: 800; padding: 14px 22px; border-radius: 999px; min-width: 200px;
    }
    .hint { margin-top: 18px; font-size: .8rem; color: rgba(255,255,255,.45); }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">س</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a class="btn" id="open" href="${deepLink}">فتح تطبيق سرح</a>
    <p class="hint">إذا لم يفتح التطبيق تلقائياً، اضغط الزر أعلاه.</p>
  </div>
  <script>
    (function () {
      var deep = ${JSON.stringify(deepLink)};
      var intent = ${JSON.stringify(intentLink)};
      var ua = navigator.userAgent || '';
      var isAndroid = /Android/i.test(ua);
      try {
        window.location.href = isAndroid ? intent : deep;
      } catch (e) {}
      setTimeout(function () {
        try { window.location.href = deep; } catch (e) {}
      }, 700);
    })();
  </script>
</body>
</html>`;
}

function verificationMessage(context?: string): string {
  if (
    context === 'butcher_order' ||
    context === 'butcher_checkout' ||
    context === 'butcher'
  ) {
    return 'تمت إعادتك من بوابة الدفع. جارٍ التحقق من حالة الدفع، ولن يُرسل الطلب للملحمة قبل تأكيد N-Genius.';
  }
  if (
    context === 'boost' ||
    context === 'promotion' ||
    context === 'promoted_ad'
  ) {
    return 'تمت إعادتك من بوابة الدفع. جارٍ التحقق من حالة العملية في N-Genius — لا تُفعَّل الترقية قبل التأكيد.';
  }
  if (
    context === 'listing_fee' ||
    context === 'fee' ||
    context === 'commission'
  ) {
    return 'تمت إعادتك من بوابة الدفع. جارٍ التحقق من حالة العملية في N-Genius — لا تُسجَّل الرسوم قبل التأكيد.';
  }
  return 'تمت إعادتك من بوابة الدفع. جارٍ التحقق من حالة العملية في N-Genius — لا يُفعَّل الاشتراك قبل التأكيد.';
}

/**
 * NI hosted checkout redirects to HTTPS APP_URL (the public site).
 * Native apps intercept /payment/result in the in-app WebView.
 * Expo web handles the same path for verification/sync.
 * These pages remain as a native deep-link bridge when the API host is hit directly.
 */
@Controller('payment')
export class PaymentRedirectController {
  @Public()
  @Get('result')
  @Header('Cache-Control', 'no-store')
  result(
    @Query('paymentId') paymentId: string | undefined,
    @Query('ref') ref: string | undefined,
    @Query('type') type: string | undefined,
    @Query('context') context: string | undefined,
    @Query('orderId') orderId: string | undefined,
    @Query('checkoutId') checkoutId: string | undefined,
    @Res() res: Response,
  ) {
    const resolvedContext = context || type;
    const deepLink = buildDeepLink('payment/result', {
      paymentId,
      ref,
      type,
      context: resolvedContext,
      orderId,
      checkoutId,
    });
    const intentLink = `intent://payment/result?${new URLSearchParams({
      ...(paymentId ? { paymentId } : {}),
      ...(ref ? { ref } : {}),
      ...(type ? { type } : {}),
      ...(resolvedContext ? { context: resolvedContext } : {}),
      ...(orderId ? { orderId } : {}),
      ...(checkoutId ? { checkoutId } : {}),
    }).toString()}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`;

    res
      .status(200)
      .type('html')
      .send(
        bridgeHtml({
          title: 'التحقق من الدفع',
          message: verificationMessage(resolvedContext),
          deepLink,
          intentLink,
        }),
      );
  }

  @Public()
  @Get('cancel')
  @Header('Cache-Control', 'no-store')
  cancel(
    @Query('context') context: string | undefined,
    @Query('orderId') orderId: string | undefined,
    @Query('checkoutId') checkoutId: string | undefined,
    @Query('paymentId') paymentId: string | undefined,
    @Res() res: Response,
  ) {
    const deepLink = buildDeepLink('payment/cancel', {
      context,
      orderId,
      checkoutId,
      paymentId,
    });
    const intentQs = new URLSearchParams({
      ...(context ? { context } : {}),
      ...(orderId ? { orderId } : {}),
      ...(checkoutId ? { checkoutId } : {}),
      ...(paymentId ? { paymentId } : {}),
    }).toString();
    const intentLink = `intent://payment/cancel${intentQs ? `?${intentQs}` : ''}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};end`;
    const isButcher =
      context === 'butcher_order' || context === 'butcher_checkout';

    res
      .status(200)
      .type('html')
      .send(
        bridgeHtml({
          title: 'تم إلغاء الدفع',
          message: isButcher
            ? 'لم تُخصم أي مبالغ ولم يُنشأ طلب للملحمة. يمكنك المحاولة مرة أخرى.'
            : 'لم تُخصم أي مبالغ. اضغط لفتح التطبيق والعودة.',
          deepLink,
          intentLink,
        }),
      );
  }
}
