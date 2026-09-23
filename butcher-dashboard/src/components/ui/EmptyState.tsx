import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-surface px-6 py-16 text-center">
      {Icon ? <Icon className="mb-4 h-8 w-8 text-ink-muted" aria-hidden /> : null}
      <p className="text-base font-medium text-ink">{title}</p>
      {description ? <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p> : null}
    </div>
  );
}
