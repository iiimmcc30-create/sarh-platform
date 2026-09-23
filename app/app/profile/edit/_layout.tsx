import { Stack } from 'expo-router';
import { fadeScaleScreenLayout } from '@/components/navigation/FadeScaleAppear';
import { fadeScaleStackScreenOptions } from '@/lib/screenTransition';

export default function EditProfileLayout() {
  return (
    <Stack
      screenLayout={fadeScaleScreenLayout}
      screenOptions={fadeScaleStackScreenOptions({
        headerShown: false,
      })}
    />
  );
}
