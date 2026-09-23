'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { fetchSettings, updateSetting } from '@/services/admin.service';
import { getStoredUser } from '@/services/auth.service';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const user = getStoredUser();
  const isAdmin = user?.role === 'ADMIN';

  const load = () => fetchSettings().then((r) => setSettings(r.settings));

  useEffect(() => {
    load();
  }, []);

  if (!isAdmin) {
    return <p className="text-amber-400">الإعدادات للمسؤول (ADMIN) فقط</p>;
  }

  const saveNumber = async (key: string, labelAr: string, category: string) => {
    const raw = editing[key];
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      alert('يرجى إدخال رقم صحيح');
      return;
    }
    await updateSetting({ key, value: n, labelAr, category });
    setEditing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    load();
  };

  const groupedSettings = settings.reduce<Record<string, typeof settings>>((acc, s) => {
    const cat = String(s.category ?? 'general');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  const categoryLabel: Record<string, string> = {
    paid_services: 'الخدمات المدفوعة للإعلانات',
    system: 'النظام',
    auth: 'المصادقة',
    features: 'الميزات',
    pricing: 'التسعير والأسعار',
    general: 'عام',
  };

  const categoryOrder = ['paid_services', 'features', 'pricing', 'auth', 'system', 'general'];
  const orderedCategories = [
    ...categoryOrder.filter((cat) => groupedSettings[cat]?.length),
    ...Object.keys(groupedSettings).filter((cat) => !categoryOrder.includes(cat)),
  ];

  return (
    <div>
      <PageHeader
        title="إعدادات النظام"
        description="تشغيل وإخفاء الخدمات المدفوعة، وFeature Flags، والتسعير"
      />
      <div className="space-y-8">
        {orderedCategories.map((cat) => {
          const items = groupedSettings[cat] ?? [];
          return (
          <div key={cat} className="space-y-3">
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">
              {categoryLabel[cat] ?? cat}
            </h2>
            {cat === 'paid_services' ? (
              <p className="text-sm text-slate-500 -mt-1">
                عند التعطيل تختفي الخدمة من التطبيق ويمنع الدفع عليها. التعطيل لا يحذف الكود أو البيانات.
              </p>
            ) : null}
            {items.map((s) => {
              const key = String(s.key);
              const val = s.value;
              const isBool = typeof val === 'boolean';
              const isNumber = typeof val === 'number';
              const isEditing = key in editing;

              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 p-4 gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white">{String(s.labelAr ?? key)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{key}</p>
                  </div>

                  {isBool ? (
                    <Button
                      variant={val ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={async () => {
                        await updateSetting({
                          key,
                          value: !val,
                          labelAr: String(s.labelAr ?? ''),
                          category: String(s.category ?? 'general'),
                        });
                        load();
                      }}
                    >
                      {val ? 'مفعّل' : 'معطّل'}
                    </Button>
                  ) : isNumber ? (
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <input
                            type="number"
                            value={editing[key]}
                            onChange={(e) => setEditing((prev) => ({ ...prev, [key]: e.target.value }))}
                            className="w-24 rounded-xl border border-slate-700 bg-slate-950 p-2 text-sm text-white text-center"
                            min={0}
                            step={1}
                          />
                          <Button
                            size="sm"
                            onClick={() => saveNumber(key, String(s.labelAr ?? key), String(s.category ?? 'general'))}
                          >
                            حفظ
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[key]; return n; })}
                          >
                            إلغاء
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-white font-semibold">{val}</span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing((prev) => ({ ...prev, [key]: String(val) }))}
                          >
                            تعديل
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">{JSON.stringify(val)}</span>
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    </div>
  );
}
