import { useState } from 'react';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingsActionRow, SettingsGroup } from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import { alertMessage } from '@/lib/actionSheet';
import { exportFileName, saveJsonFile } from '@/lib/saveJsonFile';
import { showToast } from '@/lib/toast';
import { fetchDataExport, summarizeExport } from '@/services/userSettings';

/** «تحميل بياناتي»: build a JSON copy of the account's own data on demand and save it. */
export default function DataExportScreen() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  const prepare = async () => {
    setBusy(true);
    const result = await fetchDataExport();
    setBusy(false);
    if (!result) {
      await alertMessage('تعذّر تجهيز البيانات', 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setData(result);
  };

  const save = async () => {
    if (!data) return;
    try {
      const saved = await saveJsonFile(exportFileName(), data);
      if (saved) void showToast('تم حفظ ملف بياناتك', 'success');
    } catch {
      await alertMessage('تعذّر حفظ الملف', 'حاول مجدداً');
    }
  };

  const summary = summarizeExport(data);

  return (
    <SettingsScreen title="تحميل بياناتي" largeTitle>
      <SettingsGroup
        title={data ? 'محتوى الملف' : undefined}
        footer="الملف بصيغة JSON ويضم بيانات حسابك وإعلاناتك ومنشوراتك وتعليقاتك ومتابعاتك ومدفوعاتك. لا يشمل كلمة المرور. احفظه في مكان آمن."
      >
        {data ? (
          summary.map((row, i) => (
            <SarhSettingsRow
              key={row.label}
              title={row.label}
              value={String(row.count)}
              showDivider={i < summary.length - 1}
            />
          ))
        ) : (
          <SarhSettingsRow
            icon="download-outline"
            title="نسخة من بياناتك"
            subtitle="نجهّزها الآن من الخادم، وتأخذ ثوانٍ"
            showDivider={false}
          />
        )}
      </SettingsGroup>
      <SettingsGroup footer={data ? exportFileName() : undefined}>
        {data ? (
          <SettingsActionRow title="حفظ الملف" icon="download-outline" onPress={() => void save()} />
        ) : (
          <SettingsActionRow title="تجهيز بياناتي" loading={busy} onPress={() => void prepare()} />
        )}
      </SettingsGroup>
    </SettingsScreen>
  );
}
