import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-ink">
      <div className="text-center">
        <p className="text-5xl font-bold text-brand">404</p>
        <p className="mt-3 text-ink-muted">الصفحة غير موجودة</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-xl bg-brand px-4 py-2 text-sm text-ink hover:bg-brand-hover"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
