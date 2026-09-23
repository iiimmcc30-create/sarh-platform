'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { useButcherSession } from '@/components/layout/ButcherSessionProvider';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { persistButcher } from '@/services/auth.service';
import { getApiErrorMessage } from '@/services/api.client';
import {
  updateMyButcher,
  type ButcherProfile,
  type ButcherSettingsPayload,
} from '@/services/butcher.service';

const CLOSED_DAYS = [
  { id: 'sunday', ar: 'الأحد' },
  { id: 'monday', ar: 'الاثنين' },
  { id: 'tuesday', ar: 'الثلاثاء' },
  { id: 'wednesday', ar: 'الأربعاء' },
  { id: 'thursday', ar: 'الخميس' },
  { id: 'friday', ar: 'الجمعة' },
  { id: 'saturday', ar: 'السبت' },
];

type FormState = {
  nameAr: string;
  nameEn: string;
  logo: string;
  cover: string;
  isOpen: boolean;
  phone: string;
  openTime: string;
  closeTime: string;
  closedDays: string[];
  address: string;
  addressAr: string;
  city: string;
  cityAr: string;
  bioAr: string;
  bioEn: string;
  specialties: string;
  commercialReg: string;
};

function fromProfile(butcher: ButcherProfile): FormState {
  return {
    nameAr: butcher.nameAr ?? '',
    nameEn: butcher.nameEn ?? '',
    logo: butcher.logo ?? '',
    cover: butcher.cover ?? '',
    isOpen: butcher.isOpen,
    phone: butcher.phone ?? '',
    openTime: butcher.openTime ?? '06:00',
    closeTime: butcher.closeTime ?? '22:00',
    closedDays: butcher.closedDays ?? [],
    address: butcher.address ?? '',
    addressAr: butcher.addressAr ?? '',
    city: butcher.city ?? '',
    cityAr: butcher.cityAr ?? '',
    bioAr: butcher.bioAr ?? '',
    bioEn: butcher.bioEn ?? '',
    specialties: (butcher.specialties ?? []).join('، '),
    commercialReg: butcher.commercialReg ?? '',
  };
}

function optionalUrl(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export default function SettingsPage() {
  const { butcher, refreshButcher } = useButcherSession();
  const [form, setForm] = useState<FormState | null>(butcher ? fromProfile(butcher) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    if (butcher && !form) setForm(fromProfile(butcher));
  }, [butcher, form]);

  if (!butcher || !form) {
    return <LoadingState label="جارٍ تحميل إعدادات الملحمة..." />;
  }

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const persistImageField = async (field: 'logo' | 'cover', url: string | null) => {
    setField(field, url ?? '');
    setError('');
    setSaved('');
    try {
      const updated = await updateMyButcher({ [field]: url });
      persistButcher(updated);
      await refreshButcher();
      setSaved(url ? 'تم حفظ الصورة' : 'تم حذف الصورة');
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ الصورة'));
    }
  };

  const toggleDay = (id: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const closedDays = prev.closedDays.includes(id)
        ? prev.closedDays.filter((day) => day !== id)
        : [...prev.closedDays, id];
      return { ...prev, closedDays };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    const body: ButcherSettingsPayload = {
      nameAr: form.nameAr.trim(),
      nameEn: form.nameEn.trim(),
      logo: optionalUrl(form.logo),
      cover: optionalUrl(form.cover),
      isOpen: form.isOpen,
      phone: form.phone.trim(),
      openTime: form.openTime,
      closeTime: form.closeTime,
      closedDays: form.closedDays,
      address: form.address.trim(),
      addressAr: form.addressAr.trim(),
      city: form.city.trim(),
      cityAr: form.cityAr.trim(),
      bioAr: form.bioAr.trim() || null,
      bioEn: form.bioEn.trim() || null,
      specialties: form.specialties
        .split(/[،,]/)
        .map((item) => item.trim())
        .filter(Boolean),
      commercialReg: form.commercialReg.trim() || null,
    };
    try {
      const updated = await updateMyButcher(body);
      persistButcher(updated);
      await refreshButcher();
      setForm(fromProfile({ ...butcher, ...updated }));
      setSaved('تم حفظ إعدادات الملحمة');
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ الإعدادات'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink">الإعدادات</h1>
        <p className="mt-1 text-sm text-ink-muted">
          تعديل ملف الملحمة الحالي عبر PUT /butchers/me. لا يوجد نموذج Settings منفصل، ولا إعدادات طلبات إضافية خارج حقول Butcher.
        </p>
      </div>

      {error ? <ErrorState message={error} /> : null}
      {saved ? <p className="text-sm text-brand">{saved}</p> : null}

      <form onSubmit={submit} className="space-y-6 rounded-2xl border border-white/5 bg-surface p-5">
        <section className="grid gap-4 md:grid-cols-2">
          <Field label="اسم الملحمة (عربي)">
            <input required value={form.nameAr} onChange={(e) => setField('nameAr', e.target.value)} className={inputClass} />
          </Field>
          <Field label="اسم الملحمة (إنجليزي)">
            <input required value={form.nameEn} onChange={(e) => setField('nameEn', e.target.value)} className={inputClass} />
          </Field>
          <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
            <ImageUploadField
              label="شعار الملحمة"
              value={form.logo || null}
              disabled={saving}
              onChange={(url) => void persistImageField('logo', url)}
            />
            <ImageUploadField
              label="صورة الغلاف"
              value={form.cover || null}
              disabled={saving}
              onChange={(url) => void persistImageField('cover', url)}
            />
          </div>
          <Field label="الهاتف">
            <input required value={form.phone} onChange={(e) => setField('phone', e.target.value)} className={inputClass} dir="ltr" />
          </Field>
          <label className="flex items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setField('isOpen', e.target.checked)}
            />
            الملحمة مفتوحة الآن
          </label>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Field label="وقت الفتح">
            <input value={form.openTime} onChange={(e) => setField('openTime', e.target.value)} className={inputClass} dir="ltr" />
          </Field>
          <Field label="وقت الإغلاق">
            <input value={form.closeTime} onChange={(e) => setField('closeTime', e.target.value)} className={inputClass} dir="ltr" />
          </Field>
        </section>

        <section>
          <p className="mb-2 text-sm text-ink-muted">أيام الإغلاق</p>
          <div className="flex flex-wrap gap-2">
            {CLOSED_DAYS.map((day) => (
              <button
                key={day.id}
                type="button"
                onClick={() => toggleDay(day.id)}
                className={`rounded-xl px-3 py-1.5 text-sm ${
                  form.closedDays.includes(day.id)
                    ? 'bg-brand text-ink'
                    : 'border border-white/10 text-ink-secondary'
                }`}
              >
                {day.ar}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Field label="المدينة (عربي)">
            <input required value={form.cityAr} onChange={(e) => setField('cityAr', e.target.value)} className={inputClass} />
          </Field>
          <Field label="المدينة (إنجليزي)">
            <input required value={form.city} onChange={(e) => setField('city', e.target.value)} className={inputClass} />
          </Field>
          <Field label="العنوان (عربي)">
            <input required value={form.addressAr} onChange={(e) => setField('addressAr', e.target.value)} className={inputClass} />
          </Field>
          <Field label="العنوان (إنجليزي)">
            <input required value={form.address} onChange={(e) => setField('address', e.target.value)} className={inputClass} />
          </Field>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <Field label="نبذة عربية">
            <textarea value={form.bioAr} onChange={(e) => setField('bioAr', e.target.value)} className={inputClass} rows={3} />
          </Field>
          <Field label="نبذة إنجليزية">
            <textarea value={form.bioEn} onChange={(e) => setField('bioEn', e.target.value)} className={inputClass} rows={3} />
          </Field>
          <Field label="التخصصات (افصل بفاصلة)">
            <input value={form.specialties} onChange={(e) => setField('specialties', e.target.value)} className={inputClass} />
          </Field>
          <Field label="السجل التجاري">
            <input value={form.commercialReg} onChange={(e) => setField('commercialReg', e.target.value)} className={inputClass} />
          </Field>
        </section>

        <Button type="submit" disabled={saving}>
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </Button>
      </form>
    </div>
  );
}

const inputClass =
  'mt-1 w-full rounded-xl border border-white/10 bg-canvas px-3 py-2.5 text-sm text-ink outline-none focus:border-brand';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm text-ink-muted">
      {label}
      {children}
    </label>
  );
}
