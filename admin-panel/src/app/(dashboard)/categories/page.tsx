'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/ResourcePage';
import {
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategories,
  reorderAdminCategories,
  updateAdminCategory,
  type MarketCategory,
} from '@/services/categories.service';
import { getApiErrorMessage } from '@/services/api.client';

type FormState = {
  nameAr: string;
  nameEn: string;
  slug: string;
  icon: string;
  emoji: string;
  parentId: string;
  sortOrder: string;
  isActive: boolean;
  requiresWeight: boolean;
  legacyCategory: string;
};

const emptyForm = (): FormState => ({
  nameAr: '',
  nameEn: '',
  slug: '',
  icon: '',
  emoji: '',
  parentId: '',
  sortOrder: '0',
  isActive: true,
  requiresWeight: false,
  legacyCategory: '',
});

export default function CategoriesAdminPage() {
  const [categories, setCategories] = useState<MarketCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const flat = useMemo(() => {
    const rows: Array<MarketCategory & { depth: number }> = [];
    for (const root of categories) {
      rows.push({ ...root, depth: 0 });
      for (const child of root.children ?? []) {
        rows.push({ ...child, depth: 1 });
      }
    }
    return rows;
  }, [categories]);

  const parents = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const selected = useMemo(
    () => flat.find((c) => c.id === selectedId) ?? null,
    [flat, selectedId],
  );

  const load = useCallback(async () => {
    const cats = await fetchAdminCategories();
    setCategories(cats);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(getApiErrorMessage(err, 'فشل تحميل التصنيفات')));
  }, [load]);

  useEffect(() => {
    if (!selected || creating) return;
    setForm({
      nameAr: selected.nameAr,
      nameEn: selected.nameEn ?? '',
      slug: selected.slug,
      icon: selected.icon ?? '',
      emoji: selected.emoji ?? '',
      parentId: selected.parentId ?? '',
      sortOrder: String(selected.sortOrder ?? 0),
      isActive: selected.isActive,
      requiresWeight: selected.requiresWeight,
      legacyCategory: selected.legacyCategory ?? '',
    });
  }, [selected, creating]);

  const startCreate = (parentId = '') => {
    setCreating(true);
    setSelectedId(null);
    setForm({
      ...emptyForm(),
      parentId,
      requiresWeight: parentId
        ? parents.find((p) => p.id === parentId)?.requiresWeight ?? false
        : false,
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = {
        nameAr: form.nameAr.trim(),
        nameEn: form.nameEn.trim() || undefined,
        slug: form.slug.trim().toLowerCase(),
        icon: form.icon.trim() || undefined,
        emoji: form.emoji.trim() || undefined,
        parentId: form.parentId || undefined,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        requiresWeight: form.requiresWeight,
        legacyCategory: form.legacyCategory.trim() || undefined,
      };

      if (creating) {
        const created = await createAdminCategory(body);
        await load();
        setCreating(false);
        setSelectedId(created.id);
      } else if (selectedId) {
        await updateAdminCategory(selectedId, body);
        await load();
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'فشل حفظ التصنيف'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (cat: MarketCategory) => {
    setBusy(true);
    setError(null);
    try {
      await updateAdminCategory(cat.id, { isActive: !cat.isActive });
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'فشل تحديث الحالة'));
    } finally {
      setBusy(false);
    }
  };

  const softDelete = async (cat: MarketCategory) => {
    if (!confirm(`تعطيل التصنيف «${cat.nameAr}»؟ لن يُحذف إن كان مرتبطاً بإعلانات.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdminCategory(cat.id);
      if (selectedId === cat.id) {
        setSelectedId(null);
        setCreating(false);
        setForm(emptyForm());
      }
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'فشل تعطيل التصنيف'));
    } finally {
      setBusy(false);
    }
  };

  const move = async (cat: MarketCategory, direction: -1 | 1) => {
    const siblings = (cat.parentId
      ? categories.find((p) => p.id === cat.parentId)?.children
      : categories) ?? [];
    const idx = siblings.findIndex((s) => s.id === cat.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;

    const items = siblings.map((s, i) => {
      if (i === idx) return { id: s.id, sortOrder: swapIdx };
      if (i === swapIdx) return { id: s.id, sortOrder: idx };
      return { id: s.id, sortOrder: s.sortOrder };
    });

    setBusy(true);
    try {
      await reorderAdminCategories(items);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'فشل إعادة الترتيب'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="تصنيفات السوق"
        description="إدارة التصنيفات الرئيسية والفرعية للسوق (هرمي قابل للتوسعة)."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => startCreate()}>
              + تصنيف رئيسي
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => startCreate(parents[0]?.id ?? '')}
              disabled={!parents.length}
            >
              + تصنيف فرعي
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">الشجرة</h2>
          <div className="space-y-2">
            {flat.map((cat) => (
              <div
                key={cat.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                  selectedId === cat.id
                    ? 'border-sky-400/50 bg-sky-500/10'
                    : 'border-white/10 bg-slate-950/40'
                }`}
                style={{ marginInlineStart: cat.depth * 16 }}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-right text-sm text-white"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(cat.id);
                  }}
                >
                  <span className="me-1">{cat.emoji || '•'}</span>
                  {cat.nameAr}
                  <span className="ms-2 text-xs text-slate-400">{cat.slug}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone={cat.isActive ? 'success' : 'default'}>
                    {cat.isActive ? 'نشط' : 'معطّل'}
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => void move(cat, -1)}>
                    ↑
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void move(cat, 1)}>
                    ↓
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void toggleActive(cat)}>
                    {cat.isActive ? 'تعطيل' : 'تفعيل'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void softDelete(cat)}>
                    حذف
                  </Button>
                </div>
              </div>
            ))}
            {!flat.length ? (
              <p className="text-sm text-slate-400">لا توجد تصنيفات بعد.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">
            {creating ? 'إضافة تصنيف' : selected ? 'تعديل التصنيف' : 'اختر تصنيفاً'}
          </h2>

          {(creating || selected) && (
            <div className="space-y-3">
              <Field
                label="الاسم بالعربية"
                value={form.nameAr}
                onChange={(v) => setForm((f) => ({ ...f, nameAr: v }))}
              />
              <Field
                label="الاسم بالإنجليزية"
                value={form.nameEn}
                onChange={(v) => setForm((f) => ({ ...f, nameEn: v }))}
              />
              <Field
                label="Slug"
                value={form.slug}
                onChange={(v) => setForm((f) => ({ ...f, slug: v }))}
              />
              <Field
                label="الأيقونة (outline key)"
                value={form.icon}
                onChange={(v) => setForm((f) => ({ ...f, icon: v }))}
              />
              <Field
                label="Emoji"
                value={form.emoji}
                onChange={(v) => setForm((f) => ({ ...f, emoji: v }))}
              />
              <label className="block text-xs text-slate-400">
                التصنيف الأب (فرعي فقط)
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  value={form.parentId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, parentId: e.target.value }))
                  }
                >
                  <option value="">— رئيسي —</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameAr}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="الترتيب"
                value={form.sortOrder}
                onChange={(v) => setForm((f) => ({ ...f, sortOrder: v }))}
              />
              <Field
                label="legacyCategory"
                value={form.legacyCategory}
                onChange={(v) => setForm((f) => ({ ...f, legacyCategory: v }))}
              />
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isActive: e.target.checked }))
                  }
                />
                نشط
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={form.requiresWeight}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, requiresWeight: e.target.checked }))
                  }
                />
                يتطلب الوزن (ذبائح)
              </label>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => void save()} disabled={busy || !form.nameAr || !form.slug}>
                  حفظ
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreating(false);
                    setSelectedId(null);
                    setForm(emptyForm());
                  }}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-slate-400">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
