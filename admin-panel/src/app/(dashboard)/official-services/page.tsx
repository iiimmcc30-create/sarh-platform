'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OfficialServicesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ministry');
  }, [router]);
  return <p className="text-slate-400">جاري فتح إدارة الوزارة...</p>;
}
