import { Redirect } from 'expo-router';

/** Legacy privacy page: its switches now live in the settings home «الخصوصية» group. */
export default function PrivacySettingsScreen() {
  return <Redirect href={'/settings' as never} />;
}
