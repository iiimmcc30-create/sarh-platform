import { Stack } from 'expo-router';
import { fadeScaleScreenLayout } from '@/components/navigation/FadeScaleAppear';
import { fadeScaleStackScreenOptions } from '@/lib/screenTransition';

export default function ProfileSettingsLayout() {
  return (
    <Stack
      screenLayout={fadeScaleScreenLayout}
      screenOptions={fadeScaleStackScreenOptions({
        headerShown: false,
      })}
    />
  );
}
