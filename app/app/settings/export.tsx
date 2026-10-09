import { useState } from 'react';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsHero,
  SettingsPill,
} from '@/components/settings/SettingsRows';
import { SarhSettingsRow } from '@/design-system/components';
import { alertMessage } from '@/lib/actionSheet';
import { exportFileName, saveJsonFile } from '@/lib/saveJsonFile';
import { EXPORT_INCLUDED } from '@/lib/settingsCopy';
import { showToast } from '@/lib/toast';
import { fetchDataExport, summarizeExport } from '@/services/userSettings';

type ExportState = 'idle' | 'preparing' | 'ready' | 'saved';

const STATUS_COPY: Record<ExportState, { label: string; hint: string; tone: 'neutral' | 'warning' | 'success' }> = {
  idle: { label: 'لم يُطلب', hint: 'اضغط «تجهيز بياناتي» لإنشاء نسخة جديدة', tone: 'neutral' },
  preparing: { label: 'جارٍ التجهيز', hint: 'نجمع بياناتك من الخادم، وتأخذ ثوانٍ', tone: 'warning' },
  ready: { label: 'جاهز', hint: 'راجع المحتوى ثم احفظ الملف', tone: 'success' },
  saved: { label: 'تم الحفظ', hint: 'يمكنك حفظ نسخة أخرى في أي وقت', tone: 'success' },
};

/**
 * «تحميل بياناتي»: hero explaining the export, what the file includes, the
 * request status, then prepare → save. Same server call and file format as before.
 */
export default function DataExportScreen() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [state, setState] = useState<ExportState>('idle');

  const prepare = async () => {
    setState('preparing');
    const result = await fetchDataExport();
    if (!result) {
      setState('idle');
      await alertMessage('تعذّر تجهيز البيانات', 'تحقق من الاتصال وحاول مجدداً');
      return;
    }
    setData(result);
    setState('ready');
  };

  const save = async () => {
    if (!data) return;
    try {
      const saved = await saveJsonFile(exportFileName(), data);
      if (saved) {
        setState('saved');
        void showToast('تم حفظ ملف بياناتك', 'success');
      }
    } catch {
      await alertMessage('تعذّر حفظ الملف', 'حاول مجدداً');
    }
  };

  const summary = summarizeExport(data);
  const status = STATUS_COPY[state];

  return (
    <SettingsScreen title="تحميل بياناتي">
      <SettingsHero
        icon="download-outline"
        title="نسخة من بياناتك"
        body="نجهّز لك ملفاً يضم بياناتك في سرح لتحتفظ بها أو تنقلها. الملف لك وحدك ولا يُرسل لأي جهة."
      />

      <SettingsGroup title="حالة الطلب" footer={data ? exportFileName() : undefined}>
        <SarhSettingsRow
          testID="export-status"
          icon={state === 'idle' ? 'time-outline' : 'checkmark-circle-outline'}
          iconTile
          title="نسخة بياناتك"
          subtitle={status.hint}
          accessory={<SettingsPill label={status.label} tone={status.tone} />}
        />
        {data ? (
          <SettingsActionRow title="حفظ الملف" icon="download-outline" onPress={() => void save()} />
        ) : (
          <SettingsActionRow
            title="تجهيز بياناتي"
            loading={state === 'preparing'}
            onPress={() => void prepare()}
          />
        )}
      </SettingsGroup>

      {data ? (
        <SettingsGroup title="محتوى الملف">
          {summary.map((row, i) => (
            <SarhSettingsRow
              key={row.label}
              title={row.label}
              value={String(row.count)}
              showDivider={i < summary.length - 1}
            />
          ))}
        </SettingsGroup>
      ) : null}

      <SettingsGroup
        title="ما الذي يشمله الملف"
        footer="الملف بصيغة JSON ولا يشمل كلمة المرور. احفظه في مكان آمن."
      >
        {EXPORT_INCLUDED.map((item, i) => (
          <SarhSettingsRow
            key={item.key}
            icon={item.icon}
            iconTile
            title={item.title}
            subtitle={item.hint}
            showDivider={i < EXPORT_INCLUDED.length - 1}
          />
        ))}
      </SettingsGroup>
    </SettingsScreen>
  );
}
