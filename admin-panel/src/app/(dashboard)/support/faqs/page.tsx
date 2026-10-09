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

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'ACCOUNT', label: 'الحساب والدخول' },
  { value: 'ADS', label: 'الإعلانات' },
  { value: 'PROMOTION', label: 'التعزيز والترويج' },
  { value: 'SUBSCRIPTIONS', label: 'الاشتراكات' },
  { value: 'VERIFICATION', label: 'التوثيق' },
  { value: 'COUNCILS', label: 'المجالس' },
  { value: 'COMMUNITY', label: 'المجتمع والرسائل' },
  { value: 'MARKET', label: 'السوق والبحث' },
  { value: 'BUY_SELL', label: 'البيع والشراء' },
  { value: 'SAFETY', label: 'الأمان والبلاغات' },
  { value: 'PAYMENT', label: 'الدفع والاسترداد' },
  { value: 'TECHNICAL', label: 'المشاكل التقنية' },
  { value: 'GENERAL', label: 'عام' },
];

const categoryLabel = (value: unknown) =>
  CATEGORIES.find((c) => c.value === value)?.label ?? String(value);

/** Keywords are edited as one comma / new-line separated text field. */
const parseKeywords = (text: string) =>
  text
    .split(/[,،\n]/)
    .map((k) => k.trim())
    .filter(Boolean);

export default function SupportFaqsPage() {
  const [faqs, setFaqs] = useState<Record<string, unknown>[]>([]);
  const [questionAr, setQuestionAr] = useState('');
  const [answerAr, setAnswerAr] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [keywords, setKeywords] = useState('');
  const [actionRoute, setActionRoute] = useState('');
  const [actionLabel, setActionLabel] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
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
    setKeywords('');
    setActionRoute('');
    setActionLabel('');
    setError(null);
  };

  const save = async () => {
    if (!questionAr.trim() || !answerAr.trim()) return;
    const route = actionRoute.trim();
    if (route && !route.startsWith('/')) {
      setError('رابط الزر يجب أن يبدأ بـ / مثل /promote');
      return;
    }
    const payload = {
      questionAr,
      answerAr,
      category,
      keywords: parseKeywords(keywords),
      actionRoute: route || null,
      actionLabel: route ? actionLabel.trim() || null : null,
    };
    try {
      if (editingId) {
        await updateSupportFaq(editingId, payload);
      } else {
        await createSupportFaq({ ...payload, isActive: true, sortOrder: faqs.length });
      }
    } catch {
      setError('تعذّر الحفظ، تحقق من البيانات');
      return;
    }
    resetForm();
    await load();
  };

  const q = filter.trim();
  const visible = q
    ? faqs.filter((f) =>
        [f.questionAr, f.answerAr, ...((f.keywords as string[] | undefined) ?? [])]
          .join(' ')
          .includes(q),
      )
    : faqs;

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
      <PageHeader title="الأسئلة الشائعة" description="قاعدة معرفة مركز المساعدة — يعتمد عليها البحث ومساعد سرح" />

      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
        <h2 className="text-white font-medium">{editingId ? 'تعديل سؤال' : 'إضافة سؤال'}</h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
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
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="صيغ وكلمات بديلة يفهمها البحث ومساعد سرح (افصل بفاصلة)، مثل: ما جاني الكود، الرمز ما وصل"
          rows={2}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
        />
        <div className="grid gap-2 md:grid-cols-2">
          <input
            value={actionRoute}
            onChange={(e) => setActionRoute(e.target.value)}
            placeholder="رابط زر داخل التطبيق (اختياري) مثل /promote"
            dir="ltr"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
          />
          <input
            value={actionLabel}
            onChange={(e) => setActionLabel(e.target.value)}
            placeholder="نص الزر (اختياري) مثل: عزّز إعلانك"
            maxLength={40}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
          />
        </div>
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        <div className="flex gap-2">
          <Button onClick={() => void save()}>{editingId ? 'تحديث' : 'إضافة'}</Button>
          {editingId ? <Button variant="ghost" onClick={resetForm}>إلغاء</Button> : null}
        </div>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={`تصفية (${faqs.length} سؤال)`}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
      />

      <div className="space-y-3">
        {visible.map((faq) => {
          const index = faqs.indexOf(faq);
          const kw = (faq.keywords as string[] | undefined) ?? [];
          return (
          <div key={String(faq.id)} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2 flex-1">
                <Badge>{categoryLabel(faq.category)}</Badge>
                {!faq.isActive ? <Badge tone="danger">معطّل</Badge> : null}
                {faq.key ? <span className="text-xs text-slate-500" dir="ltr"> {String(faq.key)}</span> : null}
                <p className="text-white font-medium">{String(faq.questionAr)}</p>
                <p className="text-slate-400 text-sm whitespace-pre-wrap">{String(faq.answerAr)}</p>
                {kw.length ? (
                  <p className="text-xs text-slate-500">كلمات: {kw.join('، ')}</p>
                ) : null}
                {faq.actionRoute ? (
                  <p className="text-xs text-slate-400">
                    زر: {String(faq.actionLabel ?? '')} <span dir="ltr">({String(faq.actionRoute)})</span>
                  </p>
                ) : null}
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
                    setKeywords(kw.join('، '));
                    setActionRoute(String(faq.actionRoute ?? ''));
                    setActionLabel(String(faq.actionLabel ?? ''));
                    setError(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          );
        })}
      </div>
    </div>
  );
}
