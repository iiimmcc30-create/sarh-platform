import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  addVerificationDocument,
  fetchVerificationRequest,
  removeVerificationDocument,
  saveVerificationDraft,
  submitVerificationRequest,
  VERIFICATION_STATUS_LABEL_AR,
  type VerificationRequest,
} from '@/services/support';
import { uploadSupportFileFromUri } from '@/services/upload';
import { AppText, SarhButton, SarhDivider, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';

const REQUIREMENTS = [
  'الاسم الكامل كما في الهوية',
  'رقم الهوية الوطنية',
  'صورة واضحة للهوية',
  'للحسابات التجارية: السجل التجاري',
];

export default function AccountVerificationScreen() {
  const { accessToken } = useAuth();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [request, setRequest] = useState<VerificationRequest | null>(null);
  const [userVerified, setUserVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const load = useCallback(async () => {
    const data = await fetchVerificationRequest();
    if (data) {
      setRequest(data.request);
      setUserVerified(data.userVerified);
      setFullName(data.request.fullName ?? '');
      setNationalId(data.request.nationalId ?? '');
      setBusinessName(data.request.businessName ?? '');
      setBusinessType(data.request.businessType ?? '');
      setAdditionalInfo(data.request.additionalInfo ?? '');
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const editable =
    request &&
    !userVerified &&
    (request.status === 'DRAFT' || request.status === 'NEEDS_AMENDMENTS');

  const saveDraft = async () => {
    setSaving(true);
    const res = await saveVerificationDraft({
      fullName,
      nationalId,
      businessName,
      businessType,
      additionalInfo,
    });
    setSaving(false);
    if (!res.ok) Alert.alert('تعذر الحفظ', res.error ?? 'حاول مرة أخرى');
    else void load();
  };

  const uploadDocument = async (type: 'NATIONAL_ID' | 'COMMERCIAL_REGISTER' | 'OTHER') => {
    if (!accessToken) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('الإذن مطلوب', 'يرجى السماح بالوصول للصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;

    try {
      setSaving(true);
      const asset = result.assets[0];
      const uploaded = await uploadSupportFileFromUri(accessToken, asset.uri, {
        originalFileName: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });
      const res = await addVerificationDocument({
        type,
        fileKey: uploaded.fileKey,
        fileUrl: uploaded.fileUrl,
        originalFileName: uploaded.originalFileName,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.fileSizeBytes,
      });
      if (!res.ok) Alert.alert('تعذر الرفع', res.error ?? 'حاول مرة أخرى');
      else void load();
    } catch (e) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'فشل الرفع');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    await saveDraft();
    setSaving(true);
    const res = await submitVerificationRequest();
    setSaving(false);
    if (!res.ok) Alert.alert('تعذر الإرسال', res.error ?? 'تحقق من البيانات والمستندات');
    else {
      Alert.alert('تم الإرسال', 'سيتم مراجعة طلبك وإشعارك بالنتيجة');
      void load();
    }
  };

  if (loading && !request && !userVerified) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="طلب توثيق الحساب" showBack />
        <ScreenBody scroll={false} style={styles.centered}>
          <ActivityIndicator />
        </ScreenBody>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="طلب توثيق الحساب" showBack />
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxxl">
        <Stack gap="xs">
          <AppText variant="caption" color="textMuted">حالة الطلب</AppText>
          <AppText variant="cardTitle" color="primary">
            {userVerified
              ? 'موثق'
              : VERIFICATION_STATUS_LABEL_AR[request?.status ?? 'DRAFT']}
          </AppText>
          {request?.reviewReason ? (
            <AppText variant="body" color="danger" style={styles.reason}>
              {request.reviewReason}
            </AppText>
          ) : null}
        </Stack>

        <SarhDivider />

        <Section title="المتطلبات" gap="xs">
          {REQUIREMENTS.map((item) => (
            <AppText key={item} variant="caption" color="textSecondary" style={styles.requirement}>
              • {item}
            </AppText>
          ))}
        </Section>

        <Stack gap="lg">
          <SarhInput appearance="theme" label="الاسم الكامل" value={fullName} onChangeText={setFullName} editable={!!editable} />
          <SarhInput appearance="theme" label="رقم الهوية" value={nationalId} onChangeText={setNationalId} editable={!!editable} />
          <SarhInput appearance="theme" label="اسم المنشأة (اختياري)" value={businessName} onChangeText={setBusinessName} editable={!!editable} />
          <SarhInput appearance="theme" label="نوع النشاط (اختياري)" value={businessType} onChangeText={setBusinessType} editable={!!editable} />
          <SarhInput
            appearance="theme"
            label="معلومات إضافية"
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            multiline
            numberOfLines={3}
            editable={!!editable}
          />
        </Stack>

        {editable ? (
          <>
            <Section title="المستندات">
              <Row gap="sm" wrap>
                <Pressable
                  style={styles.docBtn}
                  onPress={() => void uploadDocument('NATIONAL_ID')}
                  accessibilityRole="button"
                  accessibilityLabel="رفع الهوية"
                >
                  <AppText variant="caption" color="primary">رفع الهوية</AppText>
                </Pressable>
                <Pressable
                  style={styles.docBtn}
                  onPress={() => void uploadDocument('COMMERCIAL_REGISTER')}
                  accessibilityRole="button"
                  accessibilityLabel="رفع السجل التجاري"
                >
                  <AppText variant="caption" color="primary">رفع السجل التجاري</AppText>
                </Pressable>
              </Row>
              {(request?.documents ?? []).map((doc) => (
                <Row key={doc.id} gap="sm" justify="between">
                  <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.fill}>
                    {doc.originalFileName ?? doc.type}
                  </AppText>
                  <Pressable
                    onPress={() => void removeVerificationDocument(doc.id).then(load)}
                    accessibilityRole="button"
                    accessibilityLabel="حذف المستند"
                    hitSlop={8}
                  >
                    <AppText variant="caption" color="danger">حذف</AppText>
                  </Pressable>
                </Row>
              ))}
            </Section>

            <Stack gap="md">
              <SarhButton title="حفظ المسودة" variant="secondary" fullWidth loading={saving} onPress={() => void saveDraft()} />
              <SarhButton title="إرسال الطلب" fullWidth loading={saving} onPress={() => void submit()} />
            </Stack>
          </>
        ) : null}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    centered: { alignItems: 'center', justifyContent: 'center' },
    fill: { flex: 1, minWidth: 0 },
    reason: { lineHeight: 22 },
    requirement: { lineHeight: 20 },
    docBtn: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
  });
}
