import clsx from 'clsx';
import { orderStatusLabel } from '@/constants/orders';

const TONE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-200',
  confirmed: 'bg-brand/15 text-brand',
  preparing: 'bg-sky-500/15 text-sky-200',
  ready: 'bg-brand/15 text-brand',
  delivered: 'bg-ink-muted/15 text-ink-secondary',
  cancelled: 'bg-rose-500/15 text-rose-300',
};

export function StatusBadge({
  status,
  deliveryType,
}: {
  status: string;
  deliveryType?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
        TONE[status] ?? 'bg-surface-overlay text-ink-secondary',
      )}
    >
      {orderStatusLabel(status, deliveryType)}
    </span>
  );
}
