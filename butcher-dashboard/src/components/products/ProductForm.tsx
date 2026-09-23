'use client';

import { useEffect, useState } from 'react';
import { ProductImagesField } from '@/components/ui/ImageUploadField';
import { Button } from '@/components/ui/Button';
import {
  CUT_OPTIONS,
  CATEGORY_LABELS,
  MEAT_CATEGORIES,
  type ButcherProduct,
  type MeatCategory,
  type ProductWritePayload,
} from '@/services/products.service';

const emptyForm = {
  nameAr: '',
  nameEn: '',
  category: 'lamb' as MeatCategory,
  images: [] as string[],
  pricePerKg: '',
  priceFixed: '',
  availableCuts: ['whole'] as string[],
  weightMin: '',
  weightMax: '',
  availableQuantity: '',
  inStock: true,
  freshness: 'fresh',
  descriptionAr: '',
  descriptionEn: '',
  country: 'SA',
};

export function ProductForm({
  product,
  busy,
  onClose,
  onSubmit,
}: {
  product: ButcherProduct | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: ProductWritePayload | Partial<ProductWritePayload>) => void;
}) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!product) {
      setForm(emptyForm);
      return;
    }
    setForm({
      nameAr: product.nameAr,
      nameEn: product.nameEn,
      category: product.category,
      images: product.images ?? [],
      pricePerKg: product.pricePerKg?.toString() ?? '',
      priceFixed: product.priceFixed?.toString() ?? '',
      availableCuts: product.availableCuts.length ? product.availableCuts : ['whole'],
      weightMin: product.weightMin?.toString() ?? '',
      weightMax: product.weightMax?.toString() ?? '',
      availableQuantity: product.availableQuantity?.toString() ?? '',
      inStock: product.inStock,
      freshness: product.freshness || 'fresh',
      descriptionAr: product.descriptionAr,
      descriptionEn: product.descriptionEn,
      country: product.country || 'SA',
    });
  }, [product]);

  const toggleCut = (cut: string) => {
    setForm((prev) => ({
      ...prev,
      availableCuts: prev.availableCuts.includes(cut)
        ? prev.availableCuts.filter((item) => item !== cut)
        : [...prev.availableCuts, cut],
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ProductWritePayload = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim() || form.nameAr.trim(),
      category: form.category,
      images: form.images,
      pricePerKg: form.pricePerKg ? Number(form.pricePerKg) : null,
      priceFixed: form.priceFixed ? Number(form.priceFixed) : null,
      availableCuts: form.availableCuts,
      weightMin: form.weightMin ? Number(form.weightMin) : null,
      weightMax: form.weightMax ? Number(form.weightMax) : null,
      availableQuantity: form.availableQuantity ? Number(form.availableQuantity) : null,
      inStock: form.inStock,
      freshness: form.freshness,
      descriptionAr: form.descriptionAr.trim() || form.nameAr.trim(),
      descriptionEn: form.descriptionEn.trim() || form.nameEn.trim() || form.nameAr.trim(),
      country: form.country,
    };
    onSubmit(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0B1622]/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center">
      <form
        onSubmit={submit}
        className="max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6"
      >
        <h2 className="text-lg font-semibold text-ink">{product ? 'تعديل المنتج' : 'إضافة منتج'}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-sm text-ink-muted">
            الاسم
            <input
              required
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            Name
            <input
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            التصنيف
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as MeatCategory })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            >
              {MEAT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-muted">
            سعر الكيلو
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.pricePerKg}
              onChange={(e) => setForm({ ...form, pricePerKg: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            سعر ثابت
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.priceFixed}
              onChange={(e) => setForm({ ...form, priceFixed: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            الكمية الإجمالية (كجم)
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.availableQuantity}
              onChange={(e) => setForm({ ...form, availableQuantity: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            وزن أدنى
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.weightMin}
              onChange={(e) => setForm({ ...form, weightMin: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
          <label className="text-sm text-ink-muted">
            وزن أقصى
            <input
              type="number"
              min="0"
              step="0.1"
              value={form.weightMax}
              onChange={(e) => setForm({ ...form, weightMax: e.target.value })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            />
          </label>
        </div>
        <p className="mt-3 text-sm text-ink-muted">القطع المتاحة</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CUT_OPTIONS.map((cut) => (
            <button
              key={cut}
              type="button"
              onClick={() => toggleCut(cut)}
              className={
                form.availableCuts.includes(cut)
                  ? 'rounded-full bg-brand/20 px-3 py-1 text-sm text-brand'
                  : 'rounded-full bg-surface-raised px-3 py-1 text-sm text-ink-muted'
              }
            >
              {cut}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm text-ink-muted">
          الوصف
          <textarea
            value={form.descriptionAr}
            onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
            className="mt-1 w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-ink"
            rows={2}
          />
        </label>
        <ProductImagesField
          values={form.images}
          disabled={busy}
          onChange={(images) => setForm({ ...form, images })}
        />
        <label className="mt-3 flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={form.inStock}
            onChange={(e) => setForm({ ...form, inStock: e.target.checked })}
          />
          ظاهر للبيع
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ'}
          </Button>
        </div>
      </form>
    </div>
  );
}
