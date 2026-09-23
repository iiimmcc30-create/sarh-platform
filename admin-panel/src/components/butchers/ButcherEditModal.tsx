"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fetchButcher, updateButcher } from "@/services/admin.service";
import { getApiErrorMessage } from "@/services/api.client";
import { uploadImageToFolder } from "@/services/upload.service";

const COUNTRIES = ["SA", "AE", "KW", "QA", "BH", "OM", "EG"] as const;

type FormState = {
  nameAr: string;
  nameEn: string;
  phone: string;
  commercialReg: string;
  country: string;
  city: string;
  cityAr: string;
  address: string;
  addressAr: string;
  bioAr: string;
  bioEn: string;
  specialties: string;
  openTime: string;
  closeTime: string;
  closedDays: string;
  logo: string;
  cover: string;
  lat: string;
  lng: string;
  type: "regular" | "verified";
  isOpen: boolean;
};

const EMPTY: FormState = {
  nameAr: "",
  nameEn: "",
  phone: "",
  commercialReg: "",
  country: "SA",
  city: "",
  cityAr: "",
  address: "",
  addressAr: "",
  bioAr: "",
  bioEn: "",
  specialties: "",
  openTime: "06:00",
  closeTime: "22:00",
  closedDays: "",
  logo: "",
  cover: "",
  lat: "",
  lng: "",
  type: "regular",
  isOpen: true,
};

function str(v: unknown) {
  return v == null ? "" : String(v);
}

type Props = {
  butcherId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function ButcherEditModal({ butcherId, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !butcherId) {
      setForm(EMPTY);
      setError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await fetchButcher(butcherId);
        if (cancelled) return;
        const b = data.butcher;
        const specs = Array.isArray(b.specialties)
          ? (b.specialties as string[]).join(", ")
          : "";
        const days = Array.isArray(b.closedDays)
          ? (b.closedDays as string[]).join(", ")
          : "";
        setForm({
          nameAr: str(b.nameAr),
          nameEn: str(b.nameEn),
          phone: str(b.phone),
          commercialReg: str(b.commercialReg),
          country: str(b.country) || "SA",
          city: str(b.city),
          cityAr: str(b.cityAr),
          address: str(b.address),
          addressAr: str(b.addressAr),
          bioAr: str(b.bioAr),
          bioEn: str(b.bioEn),
          specialties: specs,
          openTime: str(b.openTime) || "06:00",
          closeTime: str(b.closeTime) || "22:00",
          closedDays: days,
          logo: str(b.logo),
          cover: str(b.cover),
          lat: b.lat == null ? "" : String(b.lat),
          lng: b.lng == null ? "" : String(b.lng),
          type: b.type === "verified" ? "verified" : "regular",
          isOpen: Boolean(b.isOpen),
        });
      } catch (e: unknown) {
        if (!cancelled)
          setError(getApiErrorMessage(e, "تعذّر تحميل بيانات الملحمة"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, butcherId]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onUpload(kind: "logo" | "cover", file: File | null) {
    if (!file) return;
    setUploading(kind);
    setError("");
    try {
      const url = await uploadImageToFolder(file, "posts");
      setField(kind, url);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "تعذّر رفع الصورة"));
    } finally {
      setUploading(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!butcherId) return;
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim(),
        phone: form.phone.trim(),
        country: form.country,
        city: form.city.trim(),
        cityAr: form.cityAr.trim(),
        address: form.address.trim(),
        addressAr: form.addressAr.trim(),
        openTime: form.openTime.trim(),
        closeTime: form.closeTime.trim(),
        type: form.type,
        isOpen: form.isOpen,
        logo: form.logo.trim() || null,
        cover: form.cover.trim() || null,
        bioAr: form.bioAr.trim() || null,
        bioEn: form.bioEn.trim() || null,
        commercialReg: form.commercialReg.trim() || null,
        specialties: form.specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        closedDays: form.closedDays
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (form.lat.trim() !== "") {
        const n = Number(form.lat);
        if (!Number.isFinite(n)) throw new Error("خط العرض غير صالح");
        payload.lat = n;
      } else {
        payload.lat = null;
      }
      if (form.lng.trim() !== "") {
        const n = Number(form.lng);
        if (!Number.isFinite(n)) throw new Error("خط الطول غير صالح");
        payload.lng = n;
      } else {
        payload.lng = null;
      }
      await updateButcher(butcherId, payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, "تعذّر حفظ التعديلات"));
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500";
  const labelClass = "mb-1 block text-xs text-slate-400";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تعديل الملحمة"
      description="تحديث بيانات الملحمة الظاهرة في المنصة"
      size="xl"
    >
      {loading ? (
        <p className="text-slate-400">جارٍ التحميل...</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>الاسم (عربي)</label>
              <input
                className={inputClass}
                value={form.nameAr}
                onChange={(e) => setField("nameAr", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>الاسم (إنجليزي)</label>
              <input
                className={inputClass}
                value={form.nameEn}
                onChange={(e) => setField("nameEn", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>الهاتف</label>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>السجل التجاري</label>
              <input
                className={inputClass}
                value={form.commercialReg}
                onChange={(e) => setField("commercialReg", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>الدولة</label>
              <select
                className={inputClass}
                value={form.country}
                onChange={(e) => setField("country", e.target.value)}
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>المدينة (عربي)</label>
              <input
                className={inputClass}
                value={form.cityAr}
                onChange={(e) => setField("cityAr", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>المدينة (إنجليزي)</label>
              <input
                className={inputClass}
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>ساعات العمل</label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={form.openTime}
                  onChange={(e) => setField("openTime", e.target.value)}
                  placeholder="06:00"
                  required
                />
                <input
                  className={inputClass}
                  value={form.closeTime}
                  onChange={(e) => setField("closeTime", e.target.value)}
                  placeholder="22:00"
                  required
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>العنوان (عربي)</label>
              <input
                className={inputClass}
                value={form.addressAr}
                onChange={(e) => setField("addressAr", e.target.value)}
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>العنوان (إنجليزي)</label>
              <input
                className={inputClass}
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelClass}>خط العرض</label>
              <input
                className={inputClass}
                value={form.lat}
                onChange={(e) => setField("lat", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>خط الطول</label>
              <input
                className={inputClass}
                value={form.lng}
                onChange={(e) => setField("lng", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>نبذة (عربي)</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.bioAr}
                onChange={(e) => setField("bioAr", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>نبذة (إنجليزي)</label>
              <textarea
                className={inputClass}
                rows={2}
                value={form.bioEn}
                onChange={(e) => setField("bioEn", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>التخصصات (مفصولة بفاصلة)</label>
              <input
                className={inputClass}
                value={form.specialties}
                onChange={(e) => setField("specialties", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>أيام الإغلاق (مفصولة بفاصلة)</label>
              <input
                className={inputClass}
                value={form.closedDays}
                onChange={(e) => setField("closedDays", e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>الشعار (URL)</label>
              <input
                className={inputClass}
                value={form.logo}
                onChange={(e) => setField("logo", e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-xs text-slate-400"
                disabled={uploading === "logo"}
                onChange={(e) =>
                  void onUpload("logo", e.target.files?.[0] ?? null)
                }
              />
            </div>
            <div>
              <label className={labelClass}>الغلاف (URL)</label>
              <input
                className={inputClass}
                value={form.cover}
                onChange={(e) => setField("cover", e.target.value)}
              />
              <input
                type="file"
                accept="image/*"
                className="mt-2 block w-full text-xs text-slate-400"
                disabled={uploading === "cover"}
                onChange={(e) =>
                  void onUpload("cover", e.target.files?.[0] ?? null)
                }
              />
            </div>
            <div>
              <label className={labelClass}>النوع</label>
              <select
                className={inputClass}
                value={form.type}
                onChange={(e) =>
                  setField(
                    "type",
                    e.target.value === "verified" ? "verified" : "regular",
                  )
                }
              >
                <option value="regular">regular</option>
                <option value="verified">verified</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isOpen}
                  onChange={(e) => setField("isOpen", e.target.checked)}
                />
                مفتوحة الآن
              </label>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || Boolean(uploading)}
            >
              {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
