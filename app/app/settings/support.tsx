import { Redirect } from 'expo-router';

/** Legacy «الدعم والمساعدة» menu — unified onto the help-center hub. */
export default function SupportScreen() {
  return <Redirect href={'/support' as never} />;
}
