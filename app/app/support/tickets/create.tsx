import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { showToast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  createTicket,
  TICKET_CATEGORY_LABEL_AR,
  type SupportTicketCategory,
} from '@/services/support';
import { uploadSupportFileFromUri } from '@/services/upload';
import { AppText, SarhButton, SarhChip, SarhChipRow, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

const CATEGORIES = (Object.keys(TICKET_CATEGORY_LABEL_AR) as SupportTicketCategory[]).filter(
  (c) => c !== 'ORDER_HELP' && c !== 'OTHER_HELP',
);

export default function CreateSupportTicketScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [category, setCategory] = useState<SupportTicketCategory>('OTHER');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<
    { uri: string; fileUrl?: string; fileName?: string; mimeType?: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = subject.trim().length >= 3 && description.trim().length >= 10;

  const pickAttachments = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('الإذن مطلوب', 'يرجى السماح بالوصول للصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.85,
    });
    if (!result.canceled) {
      setAttachments((prev) => [
        ...prev,
        ...result.assets.slice(0, 8 - prev.length).map((a) => ({
          uri: a.uri,
          fileName: a.fileName ?? undefined,
          mimeType: a.mimeType ?? undefined,
        })),
      ]);
    }
  };

  const handleSubmit = async () => {
    if (!accessToken || !canSubmit) return;
    setSubmitting(true);
    try {
      const uploaded = await Promise.all(
        attachments.map(async (item) => {
          if (item.fileUrl) return item;
          const result = await uploadSupportFileFromUri(accessToken, item.uri, {
            originalFileName: item.fileName,
            mimeType: item.mimeType,
          });
          return { ...item, fileUrl: result.fileUrl, mimeType: result.mimeType };
        }),
      );

      const res = await createTicket({
        category,
        subject: subject.trim(),
        description: description.trim(),
        attachments: uploaded
          .filter((a) => a.fileUrl)
          .map((a) => ({
            fileUrl: a.fileUrl!,
            fileName: a.fileName,
            mimeType: a.mimeType,
          })),
      });

      if (!res.ok) {
        void showToast(res.error ?? 'حاول مرة أخرى', 'error');
        return;
      }

      Alert.alert('تم الإرسال', `رقم التذكرة: ${res.ticket?.ticketNumber ?? ''}`, [
        {
          text: 'موافق',
          onPress: () => {
            if (res.ticket?.id) {
              router.replace({
                pathname: '/support/tickets/[id]',
                params: { id: res.ticket.id },
              } as never);
            } else {
              router.back();
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'فشل رفع المرفقات');
    } finally {
      setSubmitting(false);
    }
  };

  const categoryLabel = useMemo(() => TICKET_CATEGORY_LABEL_AR[category], [category]);

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="تذكرة دعم جديدة" showBack />
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxxl">
        <Section title="تصنيف المشكلة">
          <SarhChipRow contentPaddingHorizontal={0}>
            {CATEGORIES.map((cat) => (
              <SarhChip
                appearance="filter"
                key={cat}
                label={TICKET_CATEGORY_LABEL_AR[cat]}
                selected={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </SarhChipRow>
          <AppText variant="meta" color="textMuted">المحدد: {categoryLabel}</AppText>
        </Section>

        <Stack gap="lg">
          <SarhInput
            appearance="theme"
            label="عنوان المشكلة"
            value={subject}
            onChangeText={setSubject}
          />
          <SarhInput
            appearance="theme"
            label="وصف المشكلة بالتفصيل"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            style={styles.textArea}
          />
        </Stack>

        <Section
          title="المرفقات (اختياري)"
          action={
            <Pressable
              onPress={() => void pickAttachments()}
              accessibilityRole="button"
              accessibilityLabel="إضافة مرفق"
              hitSlop={8}
            >
              <AppText variant="caption" color="primary">إضافة</AppText>
            </Pressable>
          }
        >
          {attachments.length === 0 ? (
            <AppText variant="caption" color="textMuted">صور أو فيديو — حتى 8 ملفات</AppText>
          ) : (
            attachments.map((item, index) => (
              <Row key={`${item.uri}-${index}`} gap="sm" justify="between">
                <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.fill}>
                  {item.fileName ?? `مرفق ${index + 1}`}
                </AppText>
                <Pressable
                  onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  accessibilityRole="button"
                  accessibilityLabel="حذف المرفق"
                  hitSlop={8}
                >
                  <AppText variant="caption" color="danger">حذف</AppText>
                </Pressable>
              </Row>
            ))
          )}
        </Section>

        <SarhButton
          title="إرسال التذكرة"
          fullWidth
          loading={submitting}
          disabled={!canSubmit || submitting}
          onPress={() => void handleSubmit()}
        />
      </ScreenBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
});
