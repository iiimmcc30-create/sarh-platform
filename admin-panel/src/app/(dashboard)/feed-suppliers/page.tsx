'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EditorialStoryImagePicker } from '@/components/editorial-stories/EditorialStoryImagePicker';
import { getApiErrorMessage } from '@/services/api.client';
import { uploadEditorialStoryImage } from '@/services/upload.service';
import {
  FEED_PRODUCT_CATEGORIES,
  createFeedProduct,
  createFeedSupplier,
  deleteFeedProduct,
  deleteFeedSupplier,
  fetchFeedSupplierAdmin,
  fetchFeedSuppliersAdmin,
  updateFeedProduct,
  updateFeedSupplier,
  type FeedProductCategory,
  type FeedProductRecord,
  type FeedSupplierRecord,
} from '@/services/feed-suppliers.service';

const EMPTY_SUPPLIER = {
  nameAr: '',
  cityAr: '',
  districtAr: '',
  addressAr: '',
  description: '',
  hoursAr: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  logo: '',
  cover: '',
  lat: '',
  lng: '',
  verified: false,
  published: false,
};

const EMPTY_PRODUCT = {
  nameAr: '',
  category: 'livestock' as FeedProductCategory,
  description: '',
  imageUrl: '',
  weightLabel: '',
  available: true,
  published: true,
};

export default function FeedSuppliersAdminPage() {
  const [suppliers, setSuppliers] = useState<FeedSupplierRecord[]>([]);
  const [selected, setSelected] = useState<FeedSupplierRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_SUPPLIER);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'cover' | 'product' | null>(null);

  const load = useCallback(async (q = search) => {
    setLoading(true);
    setError(null);
    try {
      setSuppliers(await fetchFeedSuppliersAdmin(q.trim() || undefined));
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل الموردين'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load('');
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetSupplierForm() {
    setForm(EMPTY_SUPPLIER);
    setEditingId(null);
  }

  function resetProductForm() {
    setProductForm(EMPTY_PRODUCT);
    setEditingProductId(null);
  }

  function startEdit(row: FeedSupplierRecord) {
    setEditingId(row.id);
    setForm({
      nameAr: row.nameAr,
      cityAr: row.cityAr,
      districtAr: row.districtAr ?? '',
      addressAr: row.addressAr ?? '',
      description: row.description ?? '',
      hoursAr: row.hoursAr ?? '',
      phone: row.phone ?? '',
      whatsapp: row.whatsapp ?? '',
      email: row.email ?? '',
      website: row.website ?? '',
      logo: row.logo ?? '',
      cover: row.cover ?? '',
      lat: row.lat != null ? String(row.lat) : '',
      lng: row.lng != null ? String(row.lng) : '',
      verified: row.verified,
      published: row.published,
    });
  }

  async function openSupplier(id: string) {
    setError(null);
    try {
      const row = await fetchFeedSupplierAdmin(id);
      setSelected(row);
      resetProductForm();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل المورد'));
    }
  }

  async function onPickImage(slot: 'logo' | 'cover' | 'product', file: File) {
    setUploading(slot);
    setError(null);
    try {
      const url = await uploadEditorialStoryImage(file);
      if (slot === 'product') setProductForm((prev) => ({ ...prev, imageUrl: url }));
      else setForm((prev) => ({ ...prev, [slot]: url }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر رفع الصورة'));
    } finally {
      setUploading(null);
    }
  }

  async function onSubmitSupplier(e: FormEvent) {
    e.preventDefault();
    if (!form.nameAr.trim() || !form.cityAr.trim()) {
      setError('أدخل اسم المورد والمدينة');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = editingId;
      const payload = {
        nameAr: form.nameAr.trim(),
        cityAr: form.cityAr.trim(),
        districtAr: form.districtAr.trim() || undefined,
        addressAr: form.addressAr.trim() || undefined,
        description: form.description.trim() || undefined,
        hoursAr: form.hoursAr.trim() || undefined,
        phone: form.phone.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        email: form.email.trim() || undefined,
        website: form.website.trim() || undefined,
        logo: form.logo || (id ? null : undefined),
        cover: form.cover || (id ? null : undefined),
        lat: form.lat.trim() ? Number(form.lat) : id ? null : undefined,
        lng: form.lng.trim() ? Number(form.lng) : id ? null : undefined,
        verified: form.verified,
        published: form.published,
      };
      if (id) await updateFeedSupplier(id, payload);
      else await createFeedSupplier(payload);
      resetSupplierForm();
      await load();
      if (id) await openSupplier(id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ المورد'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSupplier(row: FeedSupplierRecord, field: 'published' | 'verified') {
    setBusy(true);
    setError(null);
    try {
      await updateFeedSupplier(row.id, { [field]: !row[field] });
      await load();
      if (selected?.id === row.id) await openSupplier(row.id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحديث المورد'));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteSupplier(id: string) {
    if (!window.confirm('حذف هذا المورد ومنتجاته؟')) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFeedSupplier(id);
      if (editingId === id) resetSupplierForm();
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حذف المورد'));
    } finally {
      setBusy(false);
    }
  }

  function startEditProduct(product: FeedProductRecord) {
    setEditingProductId(product.id);
    setProductForm({
      nameAr: product.nameAr,
      category: product.category,
      description: product.description ?? '',
      imageUrl: product.imageUrl ?? '',
      weightLabel: product.weightLabel ?? '',
      available: product.available,
      published: product.published,
    });
  }

  async function onSubmitProduct(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!productForm.nameAr.trim()) {
      setError('أدخل اسم المنتج');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        nameAr: productForm.nameAr.trim(),
        category: productForm.category,
        description: productForm.description.trim() || undefined,
        imageUrl: productForm.imageUrl || (editingProductId ? null : undefined),
        weightLabel: productForm.weightLabel.trim() || undefined,
        available: productForm.available,
        published: productForm.published,
      };
      if (editingProductId) await updateFeedProduct(editingProductId, payload);
      else await createFeedProduct(selected.id, payload);
      resetProductForm();
      await openSupplier(selected.id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ المنتج'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleProduct(product: FeedProductRecord, field: 'published' | 'available') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await updateFeedProduct(product.id, { [field]: !product[field] });
      await openSupplier(selected.id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحديث المنتج'));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteProduct(id: string) {
    if (!selected || !window.confirm('حذف هذا المنتج؟')) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFeedProduct(id);
      if (editingProductId === id) resetProductForm();
      await openSupplier(selected.id);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حذف المنتج'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="موردو الأعلاف"
        description="دليل موردي الأعلاف — إدارة بيانات المورد ووسائل التواصل من لوحة التحكم"
        actions={
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <input
        placeholder="ابحث عن مورد..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void load();
          }
        }}
        className="mb-6 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
      />

      <form
        onSubmit={(e) => void onSubmitSupplier(e)}
        className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
      >
        <h3 className="mb-3 font-semibold text-white">
          {editingId ? 'تعديل مورد' : 'إضافة مورد'}
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-slate-400">الشعار</p>
            <EditorialStoryImagePicker
              imageUrl={form.logo}
              uploading={uploading === 'logo'}
              onPick={(file) => void onPickImage('logo', file)}
              onClear={() => setForm((prev) => ({ ...prev, logo: '' }))}
            />
          </div>
          <div>
            <p className="mb-2 text-xs text-slate-400">صورة الغلاف</p>
            <EditorialStoryImagePicker
              imageUrl={form.cover}
              uploading={uploading === 'cover'}
              onPick={(file) => void onPickImage('cover', file)}
              onClear={() => setForm((prev) => ({ ...prev, cover: '' }))}
            />
          </div>
          <input
            placeholder="اسم المورد"
            value={form.nameAr}
            onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            required
          />
          <input
            placeholder="المدينة"
            value={form.cityAr}
            onChange={(e) => setForm({ ...form, cityAr: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            required
          />
          <input
            placeholder="الحي"
            value={form.districtAr}
            onChange={(e) => setForm({ ...form, districtAr: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            placeholder="الموقع / العنوان"
            value={form.addressAr}
            onChange={(e) => setForm({ ...form, addressAr: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            placeholder="خط العرض"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="خط الطول"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="رقم الهاتف"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="رقم واتساب"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="البريد الإلكتروني"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="رابط الموقع الإلكتروني"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            dir="ltr"
          />
          <input
            placeholder="ساعات العمل"
            value={form.hoursAr}
            onChange={(e) => setForm({ ...form, hoursAr: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2"
          />
          <textarea
            placeholder="الوصف"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-[100px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.verified}
              onChange={(e) => setForm({ ...form, verified: e.target.checked })}
            />
            موثّق
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            منشور
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={busy || uploading !== null}>
            <Plus className="h-4 w-4" />
            {editingId ? 'حفظ التعديل' : 'إضافة'}
          </Button>
          {editingId ? (
            <Button type="button" variant="ghost" onClick={resetSupplierForm} disabled={busy}>
              إلغاء
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mb-8 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-500">جاري التحميل…</p>
        ) : suppliers.length === 0 ? (
          <p className="text-sm text-slate-500">لا يوجد موردون بعد</p>
        ) : (
          suppliers.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => void openSupplier(row.id)}
                  className="text-start"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-white">{row.nameAr}</h4>
                    <span className="text-xs text-slate-500">{row.cityAr}</span>
                    <span className={row.published ? 'text-xs text-emerald-300' : 'text-xs text-slate-500'}>
                      {row.published ? 'منشور' : 'مخفي'}
                    </span>
                    {row.verified ? <span className="text-xs text-sky-300">موثّق</span> : null}
                    <span className="text-xs text-slate-500">{row._count?.products ?? 0} منتجات</span>
                  </div>
                </button>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" onClick={() => startEdit(row)} disabled={busy} aria-label="تعديل">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void toggleSupplier(row, 'verified')}
                  disabled={busy}
                  aria-label="توثيق"
                >
                  <BadgeCheck className={`h-4 w-4 ${row.verified ? 'text-sky-300' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void toggleSupplier(row, 'published')}
                  disabled={busy}
                  aria-label="نشر/إخفاء"
                >
                  <Power className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void onDeleteSupplier(row.id)}
                  disabled={busy}
                  aria-label="حذف"
                >
                  <Trash2 className="h-4 w-4 text-rose-400" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {selected ? (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="mb-3 font-semibold text-white">منتجات {selected.nameAr}</h3>
          <form onSubmit={(e) => void onSubmitProduct(e)} className="mb-5 grid gap-3 md:grid-cols-2">
            <EditorialStoryImagePicker
              imageUrl={productForm.imageUrl}
              uploading={uploading === 'product'}
              onPick={(file) => void onPickImage('product', file)}
              onClear={() => setProductForm((prev) => ({ ...prev, imageUrl: '' }))}
            />
            <input
              placeholder="اسم المنتج"
              value={productForm.nameAr}
              onChange={(e) => setProductForm({ ...productForm, nameAr: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              required
            />
            <select
              value={productForm.category}
              onChange={(e) =>
                setProductForm({
                  ...productForm,
                  category: e.target.value as FeedProductCategory,
                })
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {FEED_PRODUCT_CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              placeholder="الوزن / الحجم"
              value={productForm.weightLabel}
              onChange={(e) => setProductForm({ ...productForm, weightLabel: e.target.value })}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <textarea
              placeholder="وصف المنتج"
              value={productForm.description}
              onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              className="min-h-[80px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={productForm.available}
                onChange={(e) => setProductForm({ ...productForm, available: e.target.checked })}
              />
              متوفر
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={productForm.published}
                onChange={(e) => setProductForm({ ...productForm, published: e.target.checked })}
              />
              منشور
            </label>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={busy || uploading !== null}>
                <Plus className="h-4 w-4" />
                {editingProductId ? 'حفظ المنتج' : 'إضافة منتج'}
              </Button>
              {editingProductId ? (
                <Button type="button" variant="ghost" onClick={resetProductForm} disabled={busy}>
                  إلغاء
                </Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-3">
            {(selected.products ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">لا توجد منتجات بعد</p>
            ) : (
              (selected.products ?? []).map((product) => (
                <div
                  key={product.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white">{product.nameAr}</p>
                    <p className="text-xs text-slate-500">
                      {FEED_PRODUCT_CATEGORIES.find((c) => c.value === product.category)?.label}
                      {product.weightLabel ? ` · ${product.weightLabel}` : ''}
                      {` · ${product.available ? 'متوفر' : 'غير متوفر'}`}
                      {` · ${product.published ? 'منشور' : 'مخفي'}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => void toggleProduct(product, 'available')}
                      disabled={busy}
                      aria-label="التوفر"
                    >
                      {product.available ? 'متوفر' : 'غير متوفر'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void toggleProduct(product, 'published')}
                      disabled={busy}
                      aria-label="نشر المنتج"
                    >
                      {product.published ? 'منشور' : 'مخفي'}
                    </Button>
                    <Button variant="ghost" onClick={() => startEditProduct(product)} disabled={busy}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void onDeleteProduct(product.id)}
                      disabled={busy}
                    >
                      <Trash2 className="h-4 w-4 text-rose-400" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
