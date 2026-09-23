import { Button } from './Button';

export function Pagination({
  page,
  total,
  limit,
  onPage,
  noun = 'نتيجة',
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-ink-muted">
        صفحة {page} من {pages} — {total} {noun}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          السابق
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          التالي
        </Button>
      </div>
    </div>
  );
}
