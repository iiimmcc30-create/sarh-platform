import { LucideIcon } from 'lucide-react';

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = 'emerald',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  accent?: 'emerald' | 'blue' | 'amber' | 'rose' | 'violet';
}) {
  const colors = {
    emerald: 'from-emerald-600/20 to-emerald-900/10 text-emerald-400',
    blue: 'from-blue-600/20 to-blue-900/10 text-blue-400',
    amber: 'from-amber-600/20 to-amber-900/10 text-amber-400',
    rose: 'from-rose-600/20 to-rose-900/10 text-rose-400',
    violet: 'from-violet-600/20 to-violet-900/10 text-violet-400',
  };

  return (
    <div className={`rounded-2xl border border-slate-800 bg-gradient-to-br ${colors[accent]} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        <div className="rounded-xl bg-slate-900/80 p-3">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
