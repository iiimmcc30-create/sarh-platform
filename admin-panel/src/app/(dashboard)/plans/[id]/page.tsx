'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  createPlan,
  fetchPlan,
  fetchPlanFeatureCatalog,
  updatePlan,
  type AdminPlan,
  type PlanFeatureCatalogItem,
} from '@/services/admin.service';

type FeatureRow = {
  key: string;
  value: string;
  valueType: 'BOOLEAN' | 'NUMBER' | 'STRING' | 'JSON';
};

const emptyFeature = (): FeatureRow => ({
  key: '',
  value: '',
  valueType: 'BOOLEAN',
});

const VALUE_TYPE_LABEL: Record<FeatureRow['valueType'], string> = {
  BOOLEAN: 'نعم / لا',
  NUMBER: 'رقم',
  STRING: 'نص',
  JSON: 'JSON',
};

const CUSTOM_FEATURE_OPTION = '__custom__';
const EXTRA_FEATURE_LABELS_AR: Record<string, string> = {
  canUseStories: 'استخدام القصص',
  canCreatePosts: 'إنشاء منشورات',
  canUseChat: 'استخدام الرسائل',
  canPinStore: 'تثبيت المتجر',
};

export default function PlanEditPage() {
  const params = useParams<{ id: string }>()!;
  const router = useRouter();
  const isNew = params.id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [featureCatalog, setFeatureCatalog] = useState<PlanFeatureCatalogItem[]>([]);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    description: '',
    audience: 'USER' as 'USER' | 'BUTCHER',
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'SAR',
    yearlyDiscount: 0,
    isActive: true,
    sortOrder: 0,
    features: [emptyFeature()] as FeatureRow[],
  });

  useEffect(() => {
    if (isNew) return;
    fetchPlan(params.id)
      .then(({ plan }: { plan: AdminPlan }) => {
        setForm({
          slug: plan.slug,
          name: plan.name,
          description: plan.description,
          audience: plan.audience,
          monthlyPrice: plan.monthlyPrice,
          yearlyPrice: plan.yearlyPrice,
          currency: plan.currency,
          yearlyDiscount: plan.yearlyDiscount,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
          features:
            plan.features?.length > 0
              ? plan.features.map((f) => ({
                  key: f.key,
                  value: f.value,
                  valueType: f.valueType,
                }))
              : [emptyFeature()],
        });
      })
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  useEffect(() => {
    setCatalogLoading(true);
    fetchPlanFeatureCatalog(form.audience)
      .then(({ features }) => setFeatureCatalog(features))
      .finally(() => setCatalogLoading(false));
  }, [form.audience]);

  const updateFeature = (index: number, patch: Partial<FeatureRow>) => {
    setForm((prev) => {
      const features = [...prev.features];
      features[index] = { ...features[index], ...patch };
      return { ...prev, features };
    });
  };

  const removeFeature = (index: number) => {
    setForm((prev) => {
      if (prev.features.length <= 1) return prev;
      return {
        ...prev,
        features: prev.features.filter((_, i) => i !== index),
      };
    });
  };

  const resolveCatalogItem = (key: string) =>
    featureCatalog.find((item) => item.key === key);

  const isCatalogKey = (key: string) =>
    featureCatalog.some((item) => item.key === key);

  const dropdownOptions = [
    ...featureCatalog.map((item) => ({
      key: item.key,
      label: item.labelAr,
      isCustom: false,
    })),
    ...Array.from(
      new Set(
        form.features
          .map((f) => f.key.trim())
          .filter((key) => key && !isCatalogKey(key)),
      ),
    ).map((key) => ({
      key,
      label: EXTRA_FEATURE_LABELS_AR[key] ?? key,
      isCustom: true,
    })),
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        features: form.features.filter((f) => f.key.trim()),
      };
      if (isNew) {
        await createPlan(payload);
      } else {
        await updatePlan(params.id, payload);
      }
      router.push('/plans');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="p-6 text-slate-400">جاري التحميل...</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir="rtl">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {isNew ? 'إنشاء باقة' : 'تعديل الباقة'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">تحكم كامل في الأسعار والصلاحيات من مكان واحد</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push('/plans')}>
              رجوع
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <h2 className="text-lg font-semibold text-emerald-400">بيانات الباقة</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-400">
            الاسم
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-sm text-slate-400">
            المعرّف (slug)
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.slug}
              disabled={!isNew}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
          </label>
          <label className="block text-sm text-slate-400 md:col-span-2">
            الوصف
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="block text-sm text-slate-400">
            الجمهور
            <select
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.audience}
              onChange={(e) =>
                setForm({
                  ...form,
                  audience: e.target.value as 'USER' | 'BUTCHER',
                })
              }
            >
              <option value="USER">المستخدمون</option>
              <option value="BUTCHER">الملاحم</option>
            </select>
          </label>
          <label className="block text-sm text-slate-400">
            العملة
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </label>
          <label className="block text-sm text-slate-400">
            السعر الشهري
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.monthlyPrice}
              onChange={(e) =>
                setForm({ ...form, monthlyPrice: Number(e.target.value) })
              }
            />
          </label>
          <label className="block text-sm text-slate-400">
            السعر السنوي
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.yearlyPrice}
              onChange={(e) =>
                setForm({ ...form, yearlyPrice: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            نشط
          </label>
          <label className="block text-sm text-slate-400">
            ترتيب الظهور
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-emerald-400">الصلاحيات</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setForm({ ...form, features: [...form.features, emptyFeature()] })
            }
          >
            إضافة صلاحية
          </Button>
        </div>
        {form.features.map((f, i) => (
          <div
            key={i}
            className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/35 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-400">صلاحية #{i + 1}</p>
              <button
                type="button"
                onClick={() => removeFeature(i)}
                disabled={form.features.length <= 1}
                className="rounded-md border border-rose-700/50 px-2 py-1 text-xs text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                حذف
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <label className="block text-xs text-slate-400 md:col-span-5">
                الصلاحية
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  value={!f.key ? '' : isCatalogKey(f.key) ? f.key : CUSTOM_FEATURE_OPTION}
                  onChange={(e) => {
                    const key = e.target.value;
                    if (key === CUSTOM_FEATURE_OPTION) {
                      updateFeature(i, { key: '', valueType: 'STRING', value: '' });
                      return;
                    }
                    const item = resolveCatalogItem(key);
                    if (item) {
                      updateFeature(i, {
                        key,
                        valueType: item.valueType,
                        value:
                          f.value.trim() ||
                          item.suggestedValue ||
                          (item.valueType === 'BOOLEAN' ? 'false' : ''),
                      });
                      return;
                    }
                    updateFeature(i, { key });
                  }}
                >
                  <option value="">اختر الصلاحية</option>
                  {dropdownOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.isCustom ? `مخصصة: ${item.label}` : item.label}
                    </option>
                  ))}
                  <option value={CUSTOM_FEATURE_OPTION}>صلاحية مخصصة...</option>
                </select>
              </label>

              <label className="block text-xs text-slate-400 md:col-span-3">
                النوع
                <select
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  value={f.valueType}
                  onChange={(e) =>
                    updateFeature(i, {
                      valueType: e.target.value as FeatureRow['valueType'],
                    })
                  }
                >
                  <option value="BOOLEAN">نعم / لا</option>
                  <option value="NUMBER">رقم</option>
                  <option value="STRING">نص</option>
                  <option value="JSON">JSON</option>
                </select>
              </label>

              <label className="block text-xs text-slate-400 md:col-span-4">
                القيمة
                {f.valueType === 'BOOLEAN' ? (
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    value={f.value}
                    onChange={(e) => updateFeature(i, { value: e.target.value })}
                  >
                    <option value="true">مفعّل</option>
                    <option value="false">غير مفعّل</option>
                  </select>
                ) : (
                  <input
                    placeholder={`القيمة (${VALUE_TYPE_LABEL[f.valueType]})`}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                    value={f.value}
                    onChange={(e) => updateFeature(i, { value: e.target.value })}
                  />
                )}
              </label>
            </div>

            {!isCatalogKey(f.key) ? (
              <label className="block text-xs text-slate-500">
                مفتاح مخصص
                <input
                  placeholder="مثال: canUseStories"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  value={f.key}
                  onChange={(e) => updateFeature(i, { key: e.target.value })}
                />
              </label>
            ) : null}

            {f.key ? (
              <p className="rounded-md bg-slate-900/70 px-3 py-2 text-xs text-slate-400">
                {resolveCatalogItem(f.key)?.descriptionAr ?? 'صلاحية مخصصة يمكنك ربطها في الباك والفرونت.'}
              </p>
            ) : null}
          </div>
        ))}
        {catalogLoading ? (
          <p className="text-xs text-slate-500">جاري تحميل كتالوج الصلاحيات...</p>
        ) : (
          <p className="text-xs text-slate-500">
            يمكنك إدارة كل سلوك في التطبيق عبر الصلاحيات؛ أضف مفاتيح جديدة عند الحاجة من نفس الشاشة.
          </p>
        )}
      </section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
        </Button>
      </div>
    </div>
  );
}
