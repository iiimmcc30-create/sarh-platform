'use client';

import { useCallback, useEffect, useState } from 'react';
import { Warehouse } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { subscribeLiveRefresh } from '@/lib/live-refresh';
import { getApiErrorMessage } from '@/services/api.client';
import {
  fetchMyProducts,
  stockLabel,
  type ButcherProduct,
} from '@/services/products.service';

export default function InventoryPage() {
  const [items, setItems] = useState<ButcherProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await fetchMyProducts());
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل المخزون'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
    return subscribeLiveRefresh('inventory', () => {
      void load();
    });
  }, [load]);

  if (loading && items.length === 0) return <LoadingState label="جارٍ تحميل المخزون..." />;
  if (error && items.length === 0) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">المخزون</h1>
        <p className="mt-1 text-sm text-ink-muted">
          عرض فقط من ButcherProduct: الإجمالي = availableQuantity، المحجوز = reservedQuantity، المتاح =
          الفرق بينهما. لا تعديل يدوي للكمية هنا حتى لا يُكسر منطق الحجز/الخصم.
        </p>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Warehouse} title="لا توجد منتجات في المخزون" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-surface">
          <table className="min-w-full text-sm">
            <thead className="text-ink-muted">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-start font-medium">المنتج</th>
                <th className="px-4 py-3 text-start font-medium">الإجمالي</th>
                <th className="px-4 py-3 text-start font-medium">المحجوز</th>
                <th className="px-4 py-3 text-start font-medium">المتاح للبيع</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {items.map((product) => {
                const sellable =
                  product.sellableQuantity ??
                  product.availableQuantity - product.reservedQuantity;
                return (
                  <tr key={product.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-ink">{product.nameAr}</td>
                    <td className="px-4 py-3 text-ink-secondary">{product.availableQuantity} كجم</td>
                    <td className="px-4 py-3 text-ink-secondary">{product.reservedQuantity} كجم</td>
                    <td className="px-4 py-3 font-medium text-ink">{sellable} كجم</td>
                    <td className="px-4 py-3">{stockLabel(product.stock)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
