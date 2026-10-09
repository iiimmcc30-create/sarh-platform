import { SettingsScreen, useSettingsSave, useUnsavedChangesGuard } from '@/components/settings/SettingsScreen';
import { SettingsCheckLine, SettingsFieldRow, SettingsGroup } from '@/components/settings/SettingsRows';
import { useAuth } from '@/contexts/AuthContext';
import { alertMessage } from '@/lib/actionSheet';
import { API_BASE } from '@/services/api';
import { authFetch } from '@/services/authFetch';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';

/**
 * «تغيير كلمة المرور»: current + new + confirm as one grouped form, live rule
 * checks under it, «حفظ» at the top-left once all three are filled.
 */
export default function ChangePasswordScreen() {
  const { accessToken } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const dirty = !!(currentPassword || newPassword || confirmPassword);
  const ready = !!(currentPassword.trim() && newPassword && confirmPassword);
  const longEnough = newPassword.length >= 8;
  const mixed = /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const allowLeave = useUnsavedChangesGuard(dirty);
  const { saving, save } = useSettingsSave(allowLeave);

  const handleSubmit = () =>
    void save(
      async () => {
        if (!accessToken) {
          await alertMessage('تسجيل الدخول', 'يجب تسجيل الدخول لتغيير كلمة المرور');
          return false;
        }
        if (!currentPassword.trim()) {
          await alertMessage('كلمة المرور الحالية', 'أدخل كلمة المرور الحالية');
          return false;
        }
        if (newPassword.length < 8) {
          await alertMessage('كلمة مرور ضعيفة', 'يجب أن تكون 8 أحرف على الأقل');
          return false;
        }
        if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
          await alertMessage('كلمة مرور ضعيفة', 'يجب أن تحتوي على حرف كبير ورقم واحد على الأقل');
          return false;
        }
        if (newPassword !== confirmPassword) {
          await alertMessage('تأكيد كلمة المرور', 'كلمتا المرور غير متطابقتين');
          return false;
        }
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
            return true;
          }
          await alertMessage('تعذّر التحديث', json.messageAr || json.message || 'تحقق من كلمة المرور الحالية');
          return false;
        } catch {
          await alertMessage('خطأ', 'تعذّر الاتصال بالخادم');
          return false;
        }
      },
      { successMessage: 'تم تغيير كلمة المرور بنجاح' },
    );

  return (
    <SettingsScreen
      title="تغيير كلمة المرور"
      keyboard
      width="form"
      save={{ enabled: ready, saving, onPress: handleSubmit }}
    >
      <SettingsGroup title="كلمة المرور الحالية">
        <SettingsFieldRow
          testID="password-current"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="أدخل كلمة المرور الحالية"
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="next"
          onSubmitEditing={() => newRef.current?.focus()}
          ltr
        />
      </SettingsGroup>

      <SettingsGroup title="كلمة المرور الجديدة">
        <SettingsFieldRow
          ref={newRef}
          testID="password-new"
          label="الجديدة"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="8 أحرف على الأقل"
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          showDivider
          ltr
        />
        <SettingsFieldRow
          ref={confirmRef}
          testID="password-confirm"
          label="تأكيد"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="أعد كتابتها"
          secureTextEntry
          revealable
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={() => (ready ? handleSubmit() : undefined)}
          ltr
        />
      </SettingsGroup>

      <SettingsGroup footer="تغيير كلمة المرور يُخرج حسابك من كل الأجهزة، ثم تدخل من جديد بكلمة المرور الجديدة.">
        <SettingsCheckLine label="8 أحرف على الأقل" met={longEnough} />
        <SettingsCheckLine label="حرف إنجليزي كبير ورقم واحد على الأقل" met={mixed} />
        <SettingsCheckLine label="الكلمتان متطابقتان" met={matches} />
      </SettingsGroup>
    </SettingsScreen>
  );
}
