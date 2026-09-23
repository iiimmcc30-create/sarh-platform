'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  createSupportFaq,
  deleteSupportFaq,
  fetchSupportFaqs,
  reorderSupportFaqs,
  updateSupportFaq,
} from '@/services/support.service';

const CATEGORIES = [
  'ACCOUNT', 'ADS', 'MARKET', 'BUY_SELL', 'PAYMENT', 'VERIFICATION', 'BUTCHERS', 'TECHNICAL', 'GENERAL',
];

export default function SupportFaqsPage() {
  const [faqs, setFaqs] = useState<Record<string, unknown>[]>([]);
  const [questionAr, setQuestionAr] = useState('');
  const [answerAr, setAnswerAr] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const res = await fetchSupportFaqs();
    setFaqs(res.faqs);
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setQuestionAr('');
    setAnswerAr('');
    setCategory('GENERAL');
  };

  const save = async () => {
    if (!questionAr.trim() || !answerAr.trim()) return;
    if (editingId) {
      await updateSupportFaq(editingId, { questionAr, answerAr, category });
    } else {
      await createSupportFaq({ questionAr, answerAr, category, isActive: true, sortOrder: faqs.length });
    }
    resetForm();
    await load();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= faqs.length) return;
    const items = faqs.map((f, i) => ({
      id: String(f.id),
      sortOrder: i === index ? target : i === target ? index : i,
    }));
    await reorderSupportFaqs(items);
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader title="الأسئلة الشائعة" description="إدارة الأسئلة والأجوبة المعروضة للمستخدمين" />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
        <h2 className="text-white font-medium">{editingId ? 'تعديل سؤال' : 'إضافة سؤال'}</h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={questionAr}
          onChange={(e) => setQuestionAr(e.target.value)}
          placeholder="السؤال"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        />
        <textarea
          value={answerAr}
          onChange={(e) => setAnswerAr(e.target.value)}
          placeholder="الإجابة"
          rows={4}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        />
        <div className="flex gap-2">
          <Button onClick={() => void save()}>{editingId ? 'تحديث' : 'إضافة'}</Button>
          {editingId ? <Button variant="ghost" onClick={resetForm}>إلغاء</Button> : null}
        </div>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, index) => (
          <div key={String(faq.id)} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <Badge>{String(faq.category)}</Badge>
                {!faq.isActive ? <Badge tone="danger">معطّل</Badge> : null}
                <p className="text-white font-medium">{String(faq.questionAr)}</p>
                <p className="text-slate-400 text-sm whitespace-pre-wrap">{String(faq.answerAr)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => void move(index, -1)}>↑</Button>
                <Button variant="ghost" size="sm" onClick={() => void move(index, 1)}>↓</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingId(String(faq.id));
                    setQuestionAr(String(faq.questionAr));
                    setAnswerAr(String(faq.answerAr));
                    setCategory(String(faq.category));
                  }}
                >
                  تعديل
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await updateSupportFaq(String(faq.id), { isActive: !faq.isActive });
                    await load();
                  }}
                >
                  {faq.isActive ? 'تعطيل' : 'تفعيل'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await deleteSupportFaq(String(faq.id));
                    await load();
                  }}
                >
                  حذف
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
