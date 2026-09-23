'use client';

import Link from 'next/link';
import clsx from 'clsx';

export function Breadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-2">
          {i > 0 ? <span className="text-slate-700">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="hover:text-emerald-400">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-300">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageState({
  kind,
  message,
}: {
  kind: 'loading' | 'empty' | 'error';
  message: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-2xl border px-4 py-8 text-center text-sm',
        kind === 'error'
          ? 'border-rose-900/60 bg-rose-950/30 text-rose-300'
          : 'border-slate-800 bg-slate-900/40 text-slate-400',
      )}
    >
      {message}
    </div>
  );
}

export function DeltaBadge({
  today,
  yesterday,
}: {
  today: number;
  yesterday?: number;
}) {
  if (yesterday === undefined || yesterday === null) return null;
  if (yesterday === 0 && today === 0) {
    return <span className="text-xs text-slate-500">مقابل أمس: —</span>;
  }
  if (yesterday === 0) {
    return <span className="text-xs text-emerald-400">مقابل أمس: جديد</span>;
  }
  const pct = Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
  const up = pct > 0;
  const down = pct < 0;
  return (
    <span
      className={clsx(
        'text-xs',
        up && 'text-emerald-400',
        down && 'text-rose-400',
        !up && !down && 'text-slate-500',
      )}
    >
      مقابل أمس: {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}
