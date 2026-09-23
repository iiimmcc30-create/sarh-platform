'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import {
  fetchMyDaftraInventory,
  fetchMyDaftraProducts,
  fetchMyDaftraStatus,
  testMyDaftraConnection,
  type DaftraCatalogProduct,
  type DaftraOwnerStatus,
} from '@/services/daftra.service';

export function DaftraCatalogPanel() {
  const [status, setStatus] = useState<DaftraOwnerStatus | null>(null);
  const [products, setProducts] = useState<DaftraCatalogProduct[]>([]);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const next = await fetchMyDaftraStatus();
      setStatus(next);
      if (next.status === 'CONNECTED') {
        const [catalog, inventory] = await Promise.all([
          fetchMyDaftraProducts(),
          fetchMyDaftraInventory(),
        ]);
        setProducts(catalog.items ?? []);
        setInventoryCount(inventory.totalResults ?? inventory.items?.length ?? 0);
      } else {
        setProducts([]);
        setInventoryCount(null);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل تكامل دفترة'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onTest = async () => {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await testMyDaftraConnection();
      setStatus(result.status);
      setMessage(result.messageAr);
      if (result.connected) {
        const [catalog, inventory] = await Promise.all([
          fetchMyDaftraProducts(),
          fetchMyDaftraInventory(),
        ]);
        setProducts(catalog.items ?? []);
        setInventoryCount(inventory.totalResults ?? inventory.items?.length ?? 0);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر الاتصال بحساب دفترة'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/5 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-ink">دفترة</h2>
          <p className="text-sm text-ink-muted">
            المخزون يُدار في دفترة. هذه نظرة قراءة فقط من حساب ملحمتك.
          </p>
        </div>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void onTest()}>
          اختبار الاتصال
        </Button>
      </div>
      <dl className="mb-3 grid gap-2 text-sm text-ink-muted sm:grid-cols-3">
        <div>
          <dt>Status</dt>
          <dd className="text-ink">
            {status?.status === 'CONNECTED' ? 'Connected' : 'Not Connected'}
          </dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className="font-mono text-ink" dir="ltr">
            {status?.accountIdentifier ?? '—'}
          </dd>
        </div>
        <div>
          <dt>API Key</dt>
          <dd className="font-mono text-ink" dir="ltr">
            {status?.apiKeyMasked ?? '••••'}
          </dd>
        </div>
      </dl>
      {message ? <p className="mb-2 text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="mb-2 text-sm text-rose-500">{error}</p> : null}
      <div className="mt-3 border-t border-white/5 pt-3">
        <p className="mb-2 text-sm text-ink">
          Products
          {inventoryCount != null ? ` · Inventory ${inventoryCount}` : ''}
        </p>
        {products.length === 0 ? (
          <p className="text-sm text-ink-muted">لا توجد منتجات معروضة من دفترة حالياً.</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink-secondary">
            {products.slice(0, 8).map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span>{item.name}</span>
                <span className="text-ink-muted">
                  {item.sku ?? `#${item.id}`}
                  {item.quantity != null ? ` · ${item.quantity}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
