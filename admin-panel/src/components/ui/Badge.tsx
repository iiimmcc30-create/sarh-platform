import clsx from 'clsx';

export function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'default' && 'bg-slate-700 text-slate-200',
        tone === 'success' && 'bg-emerald-900/60 text-emerald-300',
        tone === 'warning' && 'bg-amber-900/60 text-amber-300',
        tone === 'danger' && 'bg-rose-900/60 text-rose-300',
        tone === 'info' && 'bg-blue-900/60 text-blue-300',
      )}
    >
      {children}
    </span>
  );
}
