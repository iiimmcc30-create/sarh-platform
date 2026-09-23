'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import {
  fetchSections,
  createSection,
  updateSection,
  deleteSection,
  publishSection,
  unpublishSection,
  fetchSectionVersions,
  restoreSectionVersion,
  seedPolicies,
} from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';

type Section = {
  id: string;
  slug: string;
  titleAr: string;
  bodyAr: string;
  isActive: boolean;
  sortOrder: number;
  publishedAt?: string | null;
  updatedAt?: string;
  updatedByName?: string | null;
  versions?: Array<{
    id: string;
    version: number;
    isPublished: boolean;
    createdByName?: string | null;
    createdAt: string;
    titleAr: string;
  }>;
};

const POLICY_SLUGS = [
  'terms',
  'privacy',
  'intellectual-property',
  'content-ads',
  'payment-refund',
];

export default function ContentPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [titleAr, setTitleAr] = useState('');
  const [bodyAr, setBodyAr] = useState('');
  const [slug, setSlug] = useState('');
  const [versions, setVersions] = useState<Section['versions']>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => sections.find((s) => s.id === selectedId) ?? null,
    [sections, selectedId],
  );

  const load = async () => {
    const r = await fetchSections();
    setSections(r.sections as unknown as Section[]);
  };

  useEffect(() => {
    load().catch((err) => setError(getApiErrorMessage(err, 'فشل تحميل المحتوى')));
  }, []);

  useEffect(() => {
    if (!selected) {
      setTitleAr('');
      setBodyAr('');
      setSlug('');
      setVersions([]);
      return;
    }
    setTitleAr(selected.titleAr);
    setBodyAr(selected.bodyAr);
    setSlug(selected.slug);
    setVersions(selected.versions ?? []);
  }, [selected]);

  const refreshVersions = async (id: string) => {
    const r = await fetchSectionVersions(id);
    setVersions((r.versions as Section['versions']) ?? []);
  };

  return (
    <div>
      <PageHeader
        title="إدارة السياسات والمحتوى"
        description="تحرير ونشر سياسات سرح مع حفظ النسخ السابقة. يجب المراجعة القانونية قبل النشر النهائي."
      />

      <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        تنبيه داخلي: هذه السياسات يجب مراجعتها واعتمادها قانونيًا قبل النشر النهائي للمستخدمين.
        استبدل العناصر النائبة مثل [اسم الكيان القانوني] و[البريد الإلكتروني الرسمي] قبل الاعتماد.
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await seedPolicies();
              await load();
            } catch (err) {
              setError(getApiErrorMessage(err, 'فشل تهيئة السياسات'));
            } finally {
              setBusy(false);
            }
          }}
        >
          تهيئة سياسات سرح الخمس
        </Button>
      </div>

      {error ? <p className="mb-3 text-sm text-rose-400">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`w-full rounded-xl border px-3 py-3 text-right transition ${
                selectedId === s.id
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
              }`}
            >
              <p className="font-medium text-white">{s.titleAr}</p>
              <p className="text-xs text-slate-500">{s.slug}</p>
              <p className="mt-1 text-xs text-slate-400">
                {s.isActive ? 'منشور' : 'غير منشور'}
                {s.publishedAt ? ` · ${new Date(s.publishedAt).toLocaleDateString('ar-SA')}` : ''}
              </p>
            </button>
          ))}
          {!sections.length ? (
            <p className="p-3 text-sm text-slate-500">لا توجد أقسام بعد. اضغط «تهيئة سياسات سرح الخمس».</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
          {!selected ? (
            <p className="text-sm text-slate-500">اختر سياسة للتحرير أو أنشئ قسمًا جديدًا بالأسفل.</p>
          ) : (
            <>
              <div className="mb-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-slate-300">
                  المعرّف (slug)
                  <input
                    value={slug}
                    disabled={POLICY_SLUGS.includes(selected.slug)}
                    onChange={(e) => setSlug(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <label className="text-sm text-slate-300">
                  العنوان
                  <input
                    value={titleAr}
                    onChange={(e) => setTitleAr(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
              <label className="mb-4 block text-sm text-slate-300">
                المحتوى (استخدم ## للعناوين)
                <textarea
                  value={bodyAr}
                  onChange={(e) => setBodyAr(e.target.value)}
                  rows={16}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-7 text-white"
                  dir="rtl"
                />
              </label>

              <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>آخر تعديل: {selected.updatedAt ? new Date(selected.updatedAt).toLocaleString('ar-SA') : '—'}</span>
                <span>· بواسطة: {selected.updatedByName || '—'}</span>
                <span>· الحالة: {selected.isActive ? 'منشور' : 'مسودة / غير منشور'}</span>
              </div>

              <div className="mb-6 flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await updateSection(selected.id, { titleAr, bodyAr, slug });
                      await load();
                      await refreshVersions(selected.id);
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'فشل الحفظ'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  حفظ التعديلات
                </Button>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      // Persist the in-editor fields atomically with publish so the
                      // latest edits are never dropped when skipping «حفظ التعديلات».
                      await publishSection(selected.id, { titleAr, bodyAr, slug });
                      await load();
                      await refreshVersions(selected.id);
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'فشل النشر'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  نشر التحديث
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await unpublishSection(selected.id);
                      await load();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'فشل إلغاء النشر'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  إلغاء النشر
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    if (!confirm('أرشفة هذه السياسة؟')) return;
                    setBusy(true);
                    try {
                      await deleteSection(selected.id);
                      setSelectedId(null);
                      await load();
                    } catch (err) {
                      setError(getApiErrorMessage(err, 'فشل الأرشفة'));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  أرشفة
                </Button>
              </div>

              <h3 className="mb-2 font-semibold text-white">النسخ السابقة</h3>
              <div className="space-y-2">
                {(versions ?? []).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2"
                  >
                    <div className="text-right text-sm">
                      <p className="text-slate-200">
                        نسخة {v.version} {v.isPublished ? '· نُشرت' : '· مسودة'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(v.createdAt).toLocaleString('ar-SA')} · {v.createdByName || '—'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (!confirm(`استعادة النسخة ${v.version}؟ سيتم حفظ الوضع الحالي كمسودة.`)) return;
                        setBusy(true);
                        try {
                          await restoreSectionVersion(selected.id, v.id);
                          await load();
                          await refreshVersions(selected.id);
                        } catch (err) {
                          setError(getApiErrorMessage(err, 'فشل الاستعادة'));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      استعادة
                    </Button>
                  </div>
                ))}
                {!versions?.length ? (
                  <p className="text-xs text-slate-500">لا توجد نسخ محفوظة بعد.</p>
                ) : null}
              </div>
            </>
          )}

          <div className="mt-8 border-t border-slate-800 pt-5">
            <h3 className="mb-3 font-semibold text-white">قسم محتوى إضافي</h3>
            <NewSectionForm
              onCreated={async () => {
                await load();
              }}
              onError={setError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NewSectionForm({
  onCreated,
  onError,
}: {
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({ slug: '', titleAr: '', bodyAr: '' });
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <input
        placeholder="slug"
        value={form.slug}
        onChange={(e) => setForm({ ...form, slug: e.target.value })}
        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
      />
      <input
        placeholder="العنوان"
        value={form.titleAr}
        onChange={(e) => setForm({ ...form, titleAr: e.target.value })}
        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
      />
      <input
        placeholder="المحتوى"
        value={form.bodyAr}
        onChange={(e) => setForm({ ...form, bodyAr: e.target.value })}
        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
      />
      <Button
        className="md:col-span-3"
        onClick={async () => {
          try {
            await createSection(form);
            setForm({ slug: '', titleAr: '', bodyAr: '' });
            await onCreated();
          } catch (err) {
            onError(getApiErrorMessage(err, 'فشل إنشاء القسم'));
          }
        }}
      >
        إضافة قسم
      </Button>
    </div>
  );
}
