'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EditorialStoryImagePicker } from '@/components/editorial-stories/EditorialStoryImagePicker';
import { getApiErrorMessage } from '@/services/api.client';
import {
  fetchButcherBannersAdmin,
  updateButcherBanner,
  type ButcherBannerRecord,
} from '@/services/butcher-banners.service';
import { uploadEditorialStoryImage } from '@/services/upload.service';

type Draft = {
  titleAr: string;
  subtitleAr: string;
  captionAr: string;
  imageUrl: string;
  isActive: boolean;
};

function toDraft(b: ButcherBannerRecord): Draft {
  return {
    titleAr: b.titleAr,
    subtitleAr: b.subtitleAr,
    captionAr: b.captionAr ?? '',
    imageUrl: b.imageUrl,
    isActive: b.isActive,
  };
}

export default function ButcherBannersAdminPage() {
  const [banners, setBanners] = useState<ButcherBannerRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchButcherBannersAdmin();
      setBanners(rows);
      const next: Record<string, Draft> = {};
      for (const row of rows) next[row.id] = toDraft(row);
      setDrafts(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل البنرات'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function onPickImage(id: string, file: File) {
    setUploadingId(id);
    setError(null);
    try {
      const url = await uploadEditorialStoryImage(file);
      patchDraft(id, { imageUrl: url });
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر رفع الصورة'));
    } finally {
      setUploadingId(null);
    }
  }

  async function onSave(id: string, e: FormEvent) {
    e.preventDefault();
    const draft = drafts[id];
    if (!draft?.imageUrl) {
      setError('أدخل صورة البنر');
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      await updateButcherBanner(id, {
        titleAr: draft.titleAr.trim(),
        subtitleAr: draft.subtitleAr.trim(),
        captionAr: draft.captionAr.trim(),
        imageUrl: draft.imageUrl,
        isActive: draft.isActive,
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ البنر'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="بنرات سوق الملاحم"
        description="ثلاثة بنرات ترويجية تظهر كسلايدر تحت البحث في سوق الملاحم — الصورة مطلوبة، والعنوان والنص اختياريان"
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

      {loading ? (
        <p className="text-sm text-slate-500">جاري التحميل…</p>
      ) : (
        <div className="space-y-5">
          {banners.map((banner) => {
            const draft = drafts[banner.id] ?? toDraft(banner);
            const busy = savingId === banner.id || uploadingId === banner.id;
            return (
              <form
                key={banner.id}
                onSubmit={(e) => void onSave(banner.id, e)}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-white">بنر {banner.slot}</h3>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => patchDraft(banner.id, { isActive: e.target.checked })}
                    />
                    ظاهر في التطبيق
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <EditorialStoryImagePicker
                    imageUrl={draft.imageUrl}
                    uploading={uploadingId === banner.id}
                    onPick={(file) => void onPickImage(banner.id, file)}
                    onClear={() => patchDraft(banner.id, { imageUrl: '' })}
                  />
                  <div className="space-y-3">
                    <input
                      placeholder="العنوان الرئيسي (اختياري)"
                      value={draft.titleAr}
                      onChange={(e) => patchDraft(banner.id, { titleAr: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <input
                      placeholder="النص العريض (اختياري)"
                      value={draft.subtitleAr}
                      onChange={(e) => patchDraft(banner.id, { subtitleAr: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <input
                      placeholder="سطر إضافي (اختياري)"
                      value={draft.captionAr}
                      onChange={(e) => patchDraft(banner.id, { captionAr: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button type="submit" disabled={busy}>
                    <Save className="h-4 w-4" />
                    حفظ البنر {banner.slot}
                  </Button>
                </div>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
