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
      undefined,
      undefined,
      cap.res as never,
    );
    expect(cap.html()).toContain('لا يُفعَّل الاشتراك قبل التأكيد');
  });

  it('does not mention subscription for butcher checkout returns', () => {
    const cap = captureHtml();
    controller.result(
      'pay-1',
      undefined,
      'butcher_checkout',
      'butcher_checkout',
      undefined,
      'chk-1',
      cap.res as never,
    );
    expect(cap.html()).not.toContain('اشتراك');
    expect(cap.html()).toContain('لن يُرسل الطلب للملحمة');
    expect(cap.html()).toContain('context=butcher_checkout');
  });

  it('cancel copy for butcher checkout does not imply an unpaid order exists', () => {
    const cap = captureHtml();
    controller.cancel(
      'butcher_checkout',
      undefined,
      'chk-1',
      'pay-1',
      cap.res as never,
    );
    expect(cap.html()).toContain('ولم يُنشأ طلب للملحمة');
  });
});
