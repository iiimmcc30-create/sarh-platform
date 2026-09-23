'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { getApiErrorMessage } from '@/services/api.client';
import {
  addHomeExploreSection,
  deleteHomeExploreSection,
  fetchHomeExploreAdmin,
  fetchHomeExploreCatalog,
  reorderHomeExploreSections,
  updateHomeExploreSection,
  type HomeExploreDestination,
  type HomeExploreSection,
} from '@/services/home-explore.service';

export default function HomeExploreAdminPage() {
  const [sections, setSections] = useState<HomeExploreSection[]>([]);
  const [catalog, setCatalog] = useState<HomeExploreDestination[]>([]);
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const used = useMemo(() => new Set(sections.map((s) => s.destination)), [sections]);
  const available = catalog.filter((item) => !used.has(item.key));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSections, nextCatalog] = await Promise.all([
        fetchHomeExploreAdmin(),
        fetchHomeExploreCatalog(),
      ]);
      setSections(nextSections);
      setCatalog(nextCatalog);
      setDestination((current) => {
        const still = nextCatalog.find((item) => item.key === current && !nextSections.some((s) => s.destination === current));
        return still?.key ?? nextCatalog.find((item) => !nextSections.some((s) => s.destination === item.key))?.key ?? '';
      });
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تحميل أقسام استكشف سرح'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!destination) return;
    setBusy(true);
    setError(null);
    try {
      setSections(await addHomeExploreSection(destination));
      setDestination('');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر إضافة القسم'));
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    const ids = sections.map((s) => s.id);
    const swap = ids[index];
    ids[index] = ids[next];
    ids[next] = swap;
    setBusy(true);
    try {
      setSections(await reorderHomeExploreSections(ids));
    } catch (err) {
      setError(getApiErrorMessage(err, 'تعذر تغيير الترتيب'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="استكشف سرح"
        description="أقسام الصفحة الرئيسية — اختر الوجهة دون كتابة المسار"
      />

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-sm">
          <span>إضافة قسم</span>
          <select
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">اختر قسماً من النظام</option>
            {available.map((item) => (
              <option key={item.key} value={item.key}>
                {item.titleAr}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy || !destination}>
          <Plus className="h-4 w-4" />
          إضافة قسم
        </Button>
        <Button type="button" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          تحديث
        </Button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {loading ? <p className="text-sm text-white/60">جاري التحميل...</p> : null}

      <div className="space-y-3">
        {sections.map((section, index) => (
          <div
            key={section.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div>
              <p className="font-semibold">{section.titleAr}</p>
              <p className="text-sm text-white/60">{section.descriptionAr}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" disabled={busy || index === 0} onClick={() => void move(index, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy || index === sections.length - 1}
                onClick={() => void move(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void updateHomeExploreSection(section.id, { isActive: !section.isActive })
                    .then(setSections)
                    .catch((err) => setError(getApiErrorMessage(err, 'تعذر تحديث القسم')));
                }}
              >
                <Power className={`h-4 w-4 ${section.isActive ? 'text-emerald-400' : 'text-white/40'}`} />
                {section.isActive ? 'ظاهر' : 'مخفي'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void deleteHomeExploreSection(section.id)
                    .then(setSections)
                    .catch((err) => setError(getApiErrorMessage(err, 'تعذر حذف القسم')));
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
