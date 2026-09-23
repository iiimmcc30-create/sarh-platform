'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { LifeBuoy, Ticket, BadgeCheck, HelpCircle } from 'lucide-react';

const sections = [
  {
    href: '/support/tickets',
    title: 'البلاغات',
    description: 'بلاغات العملاء ومحادثة سرحان وخدمة العملاء',
    icon: Ticket,
  },
  {
    href: '/support/verification',
    title: 'طلبات التوثيق',
    description: 'مراجعة طلبات توثيق الحساب',
    icon: BadgeCheck,
  },
  {
    href: '/support/faqs',
    title: 'الأسئلة الشائعة',
    description: 'تعديل وترتيب الأسئلة الشائعة',
    icon: HelpCircle,
  },
];

export default function SupportHubPage() {
  return (
    <div>
      <PageHeader
        title="خدمة العملاء"
        description="البلاغات والتوثيق والأسئلة الشائعة — بدون تواصل مباشر مع الملحمة"
      />
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 hover:border-emerald-500/40 transition-colors"
          >
            <section.icon className="h-8 w-8 text-emerald-400 mb-4" />
            <h2 className="text-lg font-semibold text-white">{section.title}</h2>
            <p className="text-sm text-slate-400 mt-2">{section.description}</p>
          </Link>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/30 p-5 flex items-center gap-3 text-slate-400">
        <LifeBuoy className="h-5 w-5 text-emerald-400" />
        <p className="text-sm">بلاغات المحتوى (REPORT) ما زالت متاحة من قسم «البلاغات».</p>
      </div>
    </div>
  );
}
