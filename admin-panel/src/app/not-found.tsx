import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '4rem', fontWeight: 700, color: '#34d399', margin: 0 }}>404</p>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>الصفحة غير موجودة</p>
        <Link href="/" style={{ display: 'inline-block', marginTop: '1.5rem', padding: '0.5rem 1.25rem', background: '#059669', color: '#fff', borderRadius: '0.5rem', textDecoration: 'none' }}>
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
