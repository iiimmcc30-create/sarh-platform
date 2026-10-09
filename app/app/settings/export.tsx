import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppText, SarhButton, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
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
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="تحميل بياناتي" showBack />
      <ScreenBody gutter={false} padBottom="xxxl">
        <SarhSettingsSection
          grouped
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
        </SarhSettingsSection>
        <View style={styles.actions}>
          {data ? (
            <SarhButton title="حفظ الملف" onPress={() => void save()} fullWidth leftIcon="download-outline" />
          ) : (
            <SarhButton title="تجهيز بياناتي" onPress={() => void prepare()} loading={busy} fullWidth />
          )}
          {!data ? null : (
            <AppText variant="caption" color="textMuted" align="center">
              {exportFileName()}
            </AppText>
          )}
        </View>
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: 16, paddingTop: 24, gap: 10 },
});
