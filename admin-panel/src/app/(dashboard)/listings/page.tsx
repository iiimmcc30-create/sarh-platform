'use client';

import { useState, type ReactNode } from 'react';
import { ResourcePage, Badge } from '@/components/ui/ResourcePage';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  createManagedListing,
  deleteListing,
  updateListing,
  updateManagedListing,
  fetchListings,
  type ManagedListingInput,
} from '@/services/admin.service';
import { getApiErrorMessage } from '@/services/api.client';
import { uploadListingMedia } from '@/services/upload.service';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'camels', label: 'إبل' },
  { id: 'sheep', label: 'غنم' },
  { id: 'goats', label: 'ماعز' },
  { id: 'cows', label: 'أبقار' },
  { id: 'horses', label: 'خيول' },
  { id: 'birds', label: 'طيور' },
  { id: 'feed', label: 'أعلاف' },
  { id: 'equipment', label: 'معدات' },
  { id: 'livestock', label: 'مواشي' },
  { id: 'transport', label: 'نقل' },
  { id: 'slaughter', label: 'ذبائح' },
];

type ListingRow = {
  id: string;
  arabicTitle: string;
  price: number;
  status: string;
  origin?: 'USER' | 'ADMIN_MANAGED';
  category?: string;
  arabicDescription?: string;
  displayUsername?: string | null;
  displaySellerName?: string | null;
  displayPhone?: string | null;
  displayRegion?: string | null;
  images?: string[];
  videoUrl?: string | null;
  seller?: { arabicName?: string } | null;
};

const emptyForm = (): ManagedListingInput => ({
  displayUsername: '',
  displaySellerName: '',
  displayPhone: '',
  displayRegion: '',
  category: 'camels',
  title: '',
  description: '',
  price: 0,
  images: [],
  videoUrl: null,
});

export default function ListingsPage() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ManagedListingInput>(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const setField = <K extends keyof ManagedListingInput>(
    key: K,
    value: ManagedListingInput[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setNotice('');
    setOpen(true);
  };

  const openEdit = (row: ListingRow) => {
    setEditingId(row.id);
    setForm({
      displayUsername: row.displayUsername ?? '',
      displaySellerName: row.displaySellerName ?? '',
      displayPhone: row.displayPhone ?? '',
      displayRegion: row.displayRegion ?? '',
      category: row.category ?? 'camels',
      title: row.arabicTitle,
      description: row.arabicDescription ?? '',
      price: row.price,
      images: row.images ?? [],
      videoUrl: row.videoUrl ?? null,
    });
    setFormError('');
    setNotice('');
    setOpen(true);
  };

  const onPickImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setFormError('');
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadListingMedia(file));
      }
      setForm((prev) => ({ ...prev, images: [...prev.images, ...urls].slice(0, 8) }));
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'فشل رفع الصورة'));
    } finally {
      setUploading(false);
    }
  };

  const onPickVideo = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      const url = await uploadListingMedia(file);
      setField('videoUrl', url);
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'فشل رفع الفيديو'));
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form, price: Number(form.price) };
      if (editingId) {
        await updateManagedListing(editingId, payload);
        setNotice('تم تحديث الإعلان');
      } else {
        await createManagedListing(payload);
        setNotice('تم نشر الإعلان بنجاح');
      }
      setOpen(false);
      setRefreshKey((n) => n + 1);
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'تعذّر حفظ الإعلان'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {notice ? (
        <p className="mb-3 rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}
      <ResourcePage<ListingRow>
        key={refreshKey}
        title="إدارة الإعلانات"
        description="عرض وتعديل وإخفاء الإعلانات، ونشر إعلان مُدار بدون حساب مستخدم"
        toolbar={
          <Button onClick={openCreate}>إضافة إعلان</Button>
        }
        fetchPage={({ page, search }) => fetchListings({ page, search })}
        columns={[
          { key: 'arabicTitle', label: 'العنوان' },
          {
            key: 'price',
            label: 'السعر',
            render: (r) => `${r.price} ر.س`,
          },
          {
            key: 'status',
            label: 'الحالة',
            render: (r) => (
              <Badge tone={r.status === 'active' ? 'success' : r.status === 'suspended' ? 'danger' : 'default'}>
                {r.status}
              </Badge>
            ),
          },
          {
            key: 'seller',
            label: 'البائع',
            render: (r) =>
              r.origin === 'ADMIN_MANAGED'
                ? r.displaySellerName || r.displayUsername || 'إعلان مُدار'
                : r.seller?.arabicName ?? '—',
          },
        ]}
        actions={(row, reload) => (
          <div className="flex gap-2">
            {row.origin === 'ADMIN_MANAGED' ? (
              <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>
                تعديل
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const next = row.status === 'active' ? 'suspended' : 'active';
                await updateListing(row.id, { status: next });
                reload();
              }}
            >
              {row.status === 'active' ? 'إخفاء' : 'تفعيل'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!confirm('أرشفة الإعلان؟ سيختفي من التطبيق ويمكن استرجاعه خلال 90 يوماً.')) return;
                try {
                  await deleteListing(row.id);
                  reload();
                } catch (err) {
                  alert(getApiErrorMessage(err, 'فشل أرشفة الإعلان'));
                }
              }}
            >
              أرشفة
            </Button>
          </div>
        )}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editingId ? 'تعديل إعلان مُدار' : 'إضافة إعلان'}
        description="هوية العرض فقط. لن يُنشأ حساب مستخدم."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="اسم المستخدم المعروض">
            <div className="flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                value={form.displayUsername}
                onChange={(e) => setField('displayUsername', e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setField(
                    'displayUsername',
                    `user${Math.floor(10000 + Math.random() * 90000)}`,
                  )
                }
              >
                توليد
              </Button>
            </div>
          </Field>
          <Field label="اسم المعلن">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.displaySellerName}
              onChange={(e) => setField('displaySellerName', e.target.value)}
            />
          </Field>
          <Field label="رقم الجوال">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.displayPhone}
              onChange={(e) => setField('displayPhone', e.target.value)}
            />
          </Field>
          <Field label="المنطقة">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.displayRegion}
              onChange={(e) => setField('displayRegion', e.target.value)}
            />
          </Field>
          <Field label="التصنيف">
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="السعر">
            <input
              type="number"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.price || ''}
              onChange={(e) => setField('price', Number(e.target.value))}
            />
          </Field>
          <Field label="عنوان الإعلان">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
            />
          </Field>
          <Field label="الوصف">
            <textarea
              className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm text-slate-400">الصور</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => void onPickImages(e.target.files)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {form.images.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-20 w-20 rounded object-cover" />
                  <button
                    type="button"
                    className="absolute left-0 top-0 rounded bg-black/70 px-1 text-xs"
                    onClick={() =>
                      setField(
                        'images',
                        form.images.filter((item) => item !== url),
                      )
                    }
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm text-slate-400">فيديو</label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => void onPickVideo(e.target.files?.[0] ?? null)}
            />
            {form.videoUrl ? (
              <div className="mt-2">
                <video src={form.videoUrl} className="max-h-40 rounded" controls />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setField('videoUrl', null)}
                >
                  حذف الفيديو
                </Button>
              </div>
            ) : null}
          </div>
          <div className="rounded-lg bg-slate-900 p-3 text-sm text-slate-300 md:col-span-2">
            <p className="mb-1 text-slate-400">معاينة قبل النشر</p>
            <p>{form.displayUsername || '—'} · {form.displaySellerName || '—'}</p>
            <p>{form.displayRegion || '—'} · {form.displayPhone || '—'}</p>
            <p>{form.title || 'بدون عنوان'} · {form.price || 0} ر.س</p>
            <p>{form.images.length} صور{form.videoUrl ? ' + فيديو' : ''}</p>
          </div>
          {formError ? <p className="text-sm text-rose-400 md:col-span-2">{formError}</p> : null}
          {uploading ? <p className="text-sm text-slate-400 md:col-span-2">جاري الرفع...</p> : null}
          <div className="md:col-span-2">
            <Button disabled={saving || uploading} onClick={() => void publish()}>
              {editingId ? 'حفظ التعديل' : 'نشر الإعلان'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mb-1 block text-slate-400">{label}</span>
      {children}
    </label>
  );
}
