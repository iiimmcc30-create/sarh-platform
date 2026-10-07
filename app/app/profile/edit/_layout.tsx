import { Stack } from 'expo-router';
import { patternScreenLayout } from '@/components/navigation/ScreenPage';
import { iosStackScreenOptions } from '@/lib/screenTransition';

export default function EditProfileLayout() {
  return (
    <Stack
      screenLayout={patternScreenLayout}
      screenOptions={iosStackScreenOptions({
        headerShown: false,
      })}
    />
  );
}
