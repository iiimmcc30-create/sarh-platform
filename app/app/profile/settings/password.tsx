import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { alertMessage } from '@/lib/actionSheet';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';

/** Layout only — theme colors are read at render. */
const styles = StyleSheet.create({
  fill: { flex: 1, minWidth: 0 },
});

export default function ChangePasswordScreen() {
  const { accessToken } = useAuth();
  const { colors } = useTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!accessToken) {
      await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لتغيير كلمة المرور');
      return;
    }
    if (!currentPassword.trim()) {
      await alertMessage('كلمة المرور الحالية', 'أدخل كلمة المرور الحالية');
      return;
    }
    if (newPassword.length < 8) {
      await alertMessage('كلمة مرور ضعيفة', 'يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      await alertMessage(
        'كلمة مرور ضعيفة',
        'يجب أن تحتوي على حرف كبير ورقم واحد على الأقل',
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      await alertMessage('تأكيد كلمة المرور', 'كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        await alertMessage('تم التحديث', 'تم تغيير كلمة المرور بنجاح');
      } else {
        await alertMessage(
          'تعذّر التحديث',
          json.messageAr || json.message || 'تحقق من كلمة المرور الحالية',
        );
      }
    } catch {
      await alertMessage('خطأ', 'تعذّر الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="تغيير كلمة المرور" showBack />
      <ScreenBody padTop="lg" gap="section" width="form" padBottom="xxxl">
        <Row gap="md" align="center">
          <AppIcon name="lock-outline" size={22} color={colors.textBrandStrong} />
          <AppText variant="bodySmall" color="textSecondary" style={styles.fill}>
            استخدم 8 أحرف على الأقل مع حرف كبير ورقم لحماية أفضل لحسابك.
          </AppText>
        </Row>

        <Stack gap="lg">
          <SarhInput
            appearance="theme"
            label="كلمة المرور الحالية"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            ltr
          />
          <SarhInput
            appearance="theme"
            label="كلمة المرور الجديدة"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            ltr
          />
          <SarhInput
            appearance="theme"
            label="تأكيد كلمة المرور الجديدة"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            ltr
          />

          <SarhButton
            title="حفظ كلمة المرور"
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            leftIcon="checkmark-done-outline"
          />
        </Stack>
      </ScreenBody>
    </Screen>
  );
}
