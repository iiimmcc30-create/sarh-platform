import { Button } from './Button';

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-rose-500/20 bg-surface px-6 py-16 text-center">
      <p className="text-sm text-rose-300">{message}</p>
      {onRetry ? (
        <Button type="button" className="mt-4" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}
