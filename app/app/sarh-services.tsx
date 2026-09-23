import { Redirect } from 'expo-router';

/** Legacy route — ministry services now live on the official MEWA profile. */
export default function SarhServicesRedirect() {
  return <Redirect href="/ministry?tab=services" />;
}
