import { Alert, Platform } from 'react-native';

const TITLE = 'تسجيل الخروج';
const MESSAGE = 'هل أنت متأكد أنك تريد الخروج من حسابك؟';

/** Cross-platform logout confirmation (Alert on native, confirm on web). */
export function confirmSignOut(onConfirm: () => void | Promise<void>) {
  const run = () => void onConfirm();

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(MESSAGE)) {
      run();
    }
    return;
  }

  Alert.alert(TITLE, MESSAGE, [
    { text: 'إلغاء', style: 'cancel' },
    { text: 'خروج', style: 'destructive', onPress: run },
  ]);
}
