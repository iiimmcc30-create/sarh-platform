'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <div className="text-center">
          <p className="text-7xl font-bold text-rose-500">500</p>
          <p className="mt-4 text-lg text-slate-400">حدث خطأ غير متوقع</p>
          <button
            onClick={reset}
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2 text-sm text-white hover:bg-emerald-500"
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
