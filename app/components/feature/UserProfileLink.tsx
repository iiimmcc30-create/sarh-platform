import type { ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { openUserProfile } from '@/lib/openUserProfile';

type UserProfileLinkProps = {
  userId?: string | null;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function UserProfileLink({ userId, children, style, disabled }: UserProfileLinkProps) {
  const router = useRouter();

  if (!userId || disabled) {
    return <>{children}</>;
  }

  return (
    <Pressable
      style={style}
      onPress={() => openUserProfile(router, userId)}
      accessibilityRole="button"
      accessibilityLabel="فتح الملف الشخصي"
    >
      {children}
    </Pressable>
  );
}
