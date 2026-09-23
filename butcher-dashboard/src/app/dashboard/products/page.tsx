'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useToast } from '@/components/ui/Toast';
import { ProductForm } from '@/components/products/ProductForm';
import { DaftraCatalogPanel } from '@/components/products/DaftraCatalogPanel';
import { subscribeLiveRefresh, notifyAllLiveRefresh } from '@/lib/live-refresh';
import { getApiErrorMessage } from '@/services/api.client';
import {
  CATEGORY_LABELS,
  MEAT_CATEGORIES,
  createMyProduct,
  deleteMyProduct,
  fetchMyProducts,
  pricingLabel,
  stockLabel,
  updateMyProduct,
  type ButcherProduct,
  type MeatCategory,
  type ProductWritePayload,
} from '@/services/products.service';

export default function ProductsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ButcherProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<MeatCategory | ''>('');
  const [editing, setEditing] = useState<ButcherProduct | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<ButcherProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await fetchMyProducts());
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل المنتجات'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('products', () => {
      void load();
    });
  }, [load]);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!q.trim()) return true;
      return `${item.nameAr} ${item.nameEn}`.includes(q.trim());
    });
  }, [items, q, category]);

  const save = async (body: ProductWritePayload | Partial<ProductWritePayload>) => {
    setBusy(true);
    try {
      if (editing && editing.id) {
        await updateMyProduct(editing.id, body as ProductWritePayload);
        toast.show('تم تحديث المنتج');
      } else {
        await createMyProduct(body as ProductWritePayload);
        toast.show('تم إضافة المنتج');
      }
      setEditing(undefined);
      notifyAllLiveRefresh();
      await load();
    } catch (err) {
      toast.show(getApiErrorMessage(err, 'تعذر حفظ المنتج'));
    } finally {
      setBusy(false);
    }
  };

  const toggleStock = async (product: ButcherProduct) => {
    try {
      await updateMyProduct(product.id, { inStock: !product.inStock });
      toast.show(product.inStock ? 'تم إخفاء المنتج' : 'تم إظهار المنتج');
      notifyAllLiveRefresh();
      await load();
    } catch (err) {
      toast.show(getApiErrorMessage(err, 'تعذر تحديث التوفر'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteMyProduct(deleting.id);
      toast.show('تم حذف المنتج');
      setDeleting(null);
      notifyAllLiveRefresh();
      await load();
    } catch (err) {
      toast.show(getApiErrorMessage(err, 'تعذر حذف المنتج'));
    } finally {
      setBusy(false);
    }
  };

  if (loading && items.length === 0) return <LoadingState label="جارٍ تحميل المنتجات..." />;
  if (error && items.length === 0) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">المنتجات</h1>
          <p className="mt-1 text-sm text-ink-muted">منتجات ملحمتك فقط عبر الحساب المرتبط، بدون butcherId من المتصفح.</p>
        </div>
        <Button type="button" onClick={() => setEditing(null)}>
          إضافة منتج
        </Button>
      </div>

      <DaftraCatalogPanel />

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث بالاسم"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-brand"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as MeatCategory | '')}
          className="rounded-xl border border-white/10 bg-surface px-3 py-2.5 text-sm text-ink"
        >
          <option value="">كل التصنيفات</option>
          {MEAT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={Package} title="لا توجد منتجات" description="أضف منتجًا أو غيّر فلتر البحث." />
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {visible.map((product) => (
              <div key={product.id} className="rounded-2xl border border-white/5 bg-surface p-4">
                <div className="flex items-center gap-3">
                  {product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt="" className="h-14 w-14 rounded-lg object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{product.nameAr}</p>
                    <p className="text-xs text-ink-muted">{CATEGORY_LABELS[product.category]}</p>
                    <p className="mt-1 text-sm text-ink-secondary">{pricingLabel(product)}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-ink-muted">
                  إجمالي {product.availableQuantity} · محجوز {product.reservedQuantity}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(product)}>
                    تعديل
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void toggleStock(product)}>
                    {product.inStock ? 'إخفاء' : 'إظهار'}
                  </Button>
                  <Button type="button" size="sm" variant="danger" onClick={() => setDeleting(product)}>
                    حذف
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-white/5 bg-surface md:block">
          <table className="min-w-full text-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-start font-medium">المنتج</th>
                <th className="px-4 py-3 text-start font-medium">السعر / الوحدة</th>
                <th className="px-4 py-3 text-start font-medium">الوزن</th>
                <th className="px-4 py-3 text-start font-medium">المخزون</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
                <th className="px-4 py-3 text-start font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => (
                <tr key={product.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0]}
                          alt=""
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : null}
                      <div>
                        <p className="font-medium text-ink">{product.nameAr}</p>
                        <p className="text-xs text-ink-muted">{CATEGORY_LABELS[product.category]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{pricingLabel(product)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {product.weightMin ?? '—'}–{product.weightMax ?? '—'} كجم
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">
                    إجمالي {product.availableQuantity} · محجوز {product.reservedQuantity} · متاح{' '}
                    {product.sellableQuantity ?? product.availableQuantity - product.reservedQuantity}
                  </td>
                  <td className="px-4 py-3">
                    {stockLabel(product.stock)}
                    {!product.inStock ? ' · مخفي' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(product)}>
                        تعديل
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => void toggleStock(product)}>
                        {product.inStock ? 'إخفاء' : 'إظهار'}
                      </Button>
                      <Button type="button" size="sm" variant="danger" onClick={() => setDeleting(product)}>
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {editing !== undefined ? (
        <ProductForm
          product={editing}
          busy={busy}
          onClose={() => setEditing(undefined)}
          onSubmit={(body) => void save(body)}
        />
      ) : null}

      <ConfirmDialog
        open={deleting != null}
        title="حذف المنتج"
        description="سيتم إخفاء المنتج (حذف ناعم) وفق النظام الحالي."
        confirmLabel="حذف"
        danger
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
