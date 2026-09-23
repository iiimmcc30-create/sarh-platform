import {
  isProfileEditField,
  ProfileFieldEditScreen,
} from '@/components/feature/ProfileFieldEditScreen';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function ProfileEditFieldRoute() {
  const router = useRouter();
  const { field } = useLocalSearchParams<{ field?: string }>();
  const key = Array.isArray(field) ? field[0] : field;

  useEffect(() => {
    if (!isProfileEditField(key)) {
      router.replace('/profile/edit');
    }
  }, [key, router]);

  if (!isProfileEditField(key)) return null;
  return <ProfileFieldEditScreen field={key} />;
}
