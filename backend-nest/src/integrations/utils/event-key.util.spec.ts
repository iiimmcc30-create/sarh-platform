import { webhookEventKey } from './event-key.util';

describe('webhookEventKey', () => {
  it('is stable for the same payload', () => {
    const payload = {
      eventName: 'ORDER.PAID',
      order: {
        reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc',
        state: 'PURCHASED',
      },
    };
    expect(webhookEventKey('ni', 'ORDER.PAID', payload)).toBe(
      webhookEventKey('ni', 'ORDER.PAID', payload),
    );
  });

  it('changes when event identity changes', () => {
    const a = webhookEventKey('ni', 'ORDER.PAID', {
      order: { reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc' },
    });
    const b = webhookEventKey('ni', 'ORDER.FAILED', {
      order: { reference: 'a13f81f3-27b4-48b6-88de-22b9ddc1e1dc' },
    });
    expect(a).not.toBe(b);
  });
});
