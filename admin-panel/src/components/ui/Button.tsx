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
        'inline-flex items-center justify-center rounded-lg font-medium transition disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-emerald-600 text-white hover:bg-emerald-500',
        variant === 'secondary' && 'bg-slate-700 text-slate-100 hover:bg-slate-600',
        variant === 'danger' && 'bg-rose-600 text-white hover:bg-rose-500',
        variant === 'ghost' && 'bg-transparent text-slate-300 hover:bg-slate-800',
        className,
      )}
      {...props}
    />
  );
}
