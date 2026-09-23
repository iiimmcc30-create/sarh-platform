import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'سرح | Sarh — لوحة الإدارة',
  description:
    'لوحة إدارة المنصة الوطنية الرائدة في خدمات الثروة الحيوانية — سرح Sarh',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
