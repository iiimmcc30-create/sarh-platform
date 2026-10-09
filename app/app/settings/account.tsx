import { Redirect } from 'expo-router';

/** Legacy «الحساب» menu: unified into the settings home. */
export default function AccountSettingsScreen() {
  return <Redirect href={'/settings' as never} />;
}
