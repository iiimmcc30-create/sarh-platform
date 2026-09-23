import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
};

export function Button({ className, variant = 'primary', size = 'md', ...props }: Props) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'min-h-11 px-3 py-2 text-sm' : 'min-h-11 px-4 py-2.5 text-sm',
        variant === 'primary' && 'bg-brand text-ink hover:bg-brand-hover',
        variant === 'secondary' &&
          'border border-white/10 bg-surface-raised text-ink-secondary hover:bg-surface-overlay',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-500',
        variant === 'ghost' && 'bg-transparent text-ink-secondary hover:bg-surface-overlay',
        className,
      )}
      {...props}
    />
  );
}
