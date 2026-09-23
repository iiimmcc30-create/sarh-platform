import crypto from 'crypto';

export function webhookEventKey(
  provider: string,
  eventName: string,
  payload: Record<string, unknown>,
): string {
  const order = (payload.order ?? payload) as Record<string, unknown>;
  const eventId = String(
    payload.eventId ?? payload.id ?? order.reference ?? order._id ?? '',
  );
  const raw = `${provider}:${eventName}:${eventId}:${JSON.stringify({
    state: order.state,
    reference: order.reference,
  })}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
