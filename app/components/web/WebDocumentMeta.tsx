import Head from 'expo-router/head';
import { Platform } from 'react-native';
import { SITE_NAME } from '@/lib/siteSeo';

type Props = {
  /** Short page name, without the site name. */
  title: string;
  description: string;
};

/**
 * Per-route document title and description for the Expo web export.
 * Native builds render nothing. The root layout still sets the site name;
 * this screen-level head replaces it while the route is open.
 */
export function WebDocumentMeta({ title, description }: Props) {
  if (Platform.OS !== 'web') return null;
  const full = `${title} · ${SITE_NAME}`;
  return (
    <Head>
      <title>{full}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={full} />
      <meta property="og:description" content={description} />
    </Head>
  );
}
