export function LoadingState({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-muted">
      <div className="h-8 w-8 animate-pulse rounded-full border-2 border-brand/30 border-t-brand" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
