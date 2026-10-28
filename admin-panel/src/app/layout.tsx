import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'سرح للمواشي — لوحة الإدارة',
  description:
    'لوحة إدارة سرح للمواشي — المنصة الوطنية لخدمات الثروة الحيوانية',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
