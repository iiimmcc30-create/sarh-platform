import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/design-system/components';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { fetchUserProfile, setFollowUser } from '@/services/users';
import { showToast } from '@/lib/toast';

type Props = { hostId: string };

/**
 * Follow the council host from inside the room. Open to every listener and
 * speaker (no subscription tier involved); hidden for the host themselves.
 */
export function CouncilHostFollowButton({ hostId }: Props) {
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!isAuthenticated || !hostId) return undefined;
    void fetchUserProfile(hostId).then((p) => {
      if (alive && p) setFollowing(p.isBlocked ? null : Boolean(p.isFollowing));
    });
    return () => {
      alive = false;
    };
  }, [hostId, isAuthenticated]);

  if (!isAuthenticated || following === null) return null;

  const onPress = async () => {
    if (busy) return;
    const next = !following;
    setBusy(true);
    setFollowing(next);
    const res = await setFollowUser(hostId, next);
    setBusy(false);
    if (!res) {
      setFollowing(!next);
      void showToast('تعذّرت المتابعة، حاول مجدداً', 'error');
      return;
    }
    setFollowing(res.following);
  };

  return (
    <Pressable
      onPress={() => void onPress()}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={following ? 'إلغاء متابعة المضيف' : 'متابعة المضيف'}
      testID="council-host-follow"
      style={[
        styles.pill,
        following
          ? { borderColor: colors.borderSoft, backgroundColor: 'transparent' }
          : { borderColor: colors.textPrimary, backgroundColor: colors.textPrimary },
      ]}
    >
      <AppText
        variant="caption"
        style={{ color: following ? colors.textPrimary : colors.screenRoot, fontWeight: '700' }}
      >
        {following ? 'متابَع' : 'تابِع'}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

export default CouncilHostFollowButton;
