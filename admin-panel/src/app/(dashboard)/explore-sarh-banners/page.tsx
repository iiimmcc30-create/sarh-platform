'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EditorialStoryImagePicker } from '@/components/editorial-stories/EditorialStoryImagePicker';
import { getApiErrorMessage } from '@/services/api.client';
import { uploadEditorialStoryImage } from '@/services/upload.service';
import {
  createExploreSarhBanner,
  deleteExploreSarhBanner,
  fetchExploreSarhBannersAdmin,
  reorderExploreSarhBanners,
  updateExploreSarhBanner,
  type ExploreSarhBannerRecord,
} from '@/services/explore-sarh-banners.service';

type Draft = {
  imageUrl: string;
  accessibilityLabel: string;
  href: string;
  isActive: boolean;
};

function toDraft(b: ExploreSarhBannerRecord): Draft {
  return {
    imageUrl: b.imageUrl,
    accessibilityLabel: b.accessibilityLabel,
    href: b.href,
    isActive: b.isActive,
  };
}

const EMPTY_DRAFT: Draft = {
  imageUrl: '',
  accessibilityLabel: '',
  href: '/',
  isActive: true,
};

export default function ExploreSarhBannersAdminPage() {
  const [banners, setBanners] = useState<ExploreSarhBannerRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [createDraft, setCreateDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchExploreSarhBannersAdmin();
      setBanners(rows);
      const next: Record<string, Draft> = {};
      for (const row of rows) next[row.id] = toDraft(row);
      setDrafts(next);
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل بنرات استكشف سرح'));
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

  async function onPickImage(id: string | 'new', file: File) {
    setUploadingId(id);
    setError(null);
    try {
      const url = await uploadEditorialStoryImage(file);
      if (id === 'new') {
        setCreateDraft((prev) => ({ ...prev, imageUrl: url }));
      } else {
        patchDraft(id, { imageUrl: url });
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر رفع الصورة'));
    } finally {
      setUploadingId(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!createDraft.imageUrl.trim()) {
      setError('أدخل صورة البنر');
      return;
    }
    if (!createDraft.accessibilityLabel.trim() || !createDraft.href.trim()) {
      setError('أدخل النص البديل والمسار');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createExploreSarhBanner({
        imageUrl: createDraft.imageUrl.trim(),
        accessibilityLabel: createDraft.accessibilityLabel.trim(),
        href: createDraft.href.trim(),
        isActive: createDraft.isActive,
      });
      setCreateDraft(EMPTY_DRAFT);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر إنشاء البنر'));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(id: string, e: FormEvent) {
    e.preventDefault();
    const draft = drafts[id];
    if (!draft?.imageUrl.trim()) {
      setError('أدخل صورة البنر');
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      await updateExploreSarhBanner(id, {
        imageUrl: draft.imageUrl.trim(),
        accessibilityLabel: draft.accessibilityLabel.trim(),
        href: draft.href.trim(),
        isActive: draft.isActive,
      });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر حفظ البنر'));
    } finally {
      setSavingId(null);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= banners.length) return;
    const ids = banners.map((b) => b.id);
    const swap = ids[index];
    ids[index] = ids[next];
    ids[next] = swap;
    setBusy(true);
    setError(null);
    try {
      setBanners(await reorderExploreSarhBanners(ids));
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تغيير الترتيب'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="بنرات استكشف سرح"
        description="سلايدر الصفحة الرئيسية تحت عنوان استكشف سرح — صورة + نص بديل + مسار داخل التطبيق"
        actions={
          <Button variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      {error ? (
        <p className="rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="font-semibold text-white">إضافة بنر جديد</h3>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={createDraft.isActive}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, isActive: e.target.checked }))
              }
            />
            ظاهر في التطبيق
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <EditorialStoryImagePicker
            imageUrl={createDraft.imageUrl}
            uploading={uploadingId === 'new'}
            onPick={(file) => void onPickImage('new', file)}
            onClear={() => setCreateDraft((prev) => ({ ...prev, imageUrl: '' }))}
          />
          <div className="space-y-3">
            <input
              placeholder="النص البديل (accessibility)"
              value={createDraft.accessibilityLabel}
              onChange={(e) =>
                setCreateDraft((prev) => ({
                  ...prev,
                  accessibilityLabel: e.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <input
              placeholder="المسار داخل التطبيق مثل /butchers"
              value={createDraft.href}
              onChange={(e) =>
                setCreateDraft((prev) => ({ ...prev, href: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              dir="ltr"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button type="submit" disabled={busy || uploadingId === 'new'}>
            <Plus className="h-4 w-4" />
            إضافة البنر
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">جاري التحميل…</p>
      ) : banners.length === 0 ? (
        <p className="text-sm text-slate-500">
          لا توجد بنرات بعد — التطبيق يعرض النسخ المحلية كاحتياطي حتى تضيف بنرًا هنا.
        </p>
      ) : (
        <div className="space-y-5">
          {banners.map((banner, index) => {
            const draft = drafts[banner.id] ?? toDraft(banner);
            const rowBusy =
              busy || savingId === banner.id || uploadingId === banner.id;
            return (
              <form
                key={banner.id}
                onSubmit={(e) => void onSave(banner.id, e)}
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-white">
                    بنر {index + 1}
                    <span className="ms-2 text-xs font-normal text-slate-500">
                      ترتيب {banner.sortOrder}
                    </span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={rowBusy || index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={rowBusy || index === banners.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={draft.isActive}
                        onChange={(e) =>
                          patchDraft(banner.id, { isActive: e.target.checked })
                        }
                      />
                      ظاهر في التطبيق
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={rowBusy}
                      onClick={() => {
                        void deleteExploreSarhBanner(banner.id)
                          .then(() => load())
                          .catch((err) =>
                            setError(getApiErrorMessage(err, 'تعذر حذف البنر')),
                          );
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rose-400" />
                      حذف
                    </Button>
                  </div>
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
                      placeholder="النص البديل (accessibility)"
                      value={draft.accessibilityLabel}
                      onChange={(e) =>
                        patchDraft(banner.id, {
                          accessibilityLabel: e.target.value,
                        })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                    <input
                      placeholder="المسار داخل التطبيق مثل /butchers"
                      value={draft.href}
                      onChange={(e) =>
                        patchDraft(banner.id, { href: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button type="submit" disabled={rowBusy}>
                    <Save className="h-4 w-4" />
                    حفظ البنر
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
