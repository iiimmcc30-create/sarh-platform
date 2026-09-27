import { PaymentRedirectController } from './payment-redirect.controller';

function captureHtml() {
  let html = '';
  const res = {
    status: () => res,
    type: () => res,
    send: (body: string) => {
      html = body;
      return res;
    },
  };
  return { res, html: () => html };
}

describe('PaymentRedirectController context-aware copy', () => {
  const controller = new PaymentRedirectController();

  it('keeps subscription wording for subscription returns', () => {
    const cap = captureHtml();
    controller.result(
      'pay-1',
      undefined,
      'subscription',
      'subscription',
      cap.res as never,
    );
    expect(cap.html()).toContain('لا يُفعَّل الاشتراك قبل التأكيد');
  });

  it('keeps the promotion context in the deep link without order params', () => {
    const cap = captureHtml();
    controller.result(
      'pay-1',
      undefined,
      'promoted_ad',
      'promoted_ad',
      cap.res as never,
    );
    expect(cap.html()).toContain('context=promoted_ad');
    expect(cap.html()).not.toContain('orderId');
    expect(cap.html()).not.toContain('checkoutId');
  });

  it('cancel bridge only forwards context and paymentId', () => {
    const cap = captureHtml();
    controller.cancel('promoted_ad', 'pay-1', cap.res as never);
    expect(cap.html()).toContain('payment/cancel');
    expect(cap.html()).toContain('paymentId=pay-1');
    expect(cap.html()).not.toContain('checkoutId');
  });
});
