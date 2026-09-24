import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { Image, uriSource } from '@/components/ui/AppImage';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { formatPostCardTimestampAr } from '@/lib/formatRelativeTime';
import { getRtlRow } from '@/lib/rtl';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import type { ProfileReply } from '@/services/posts';

const MENTION_BLUE = '#1D9BF0';

type ProfileReplyRowProps = {
  reply: ProfileReply;
  onPress: () => void;
};

export function ProfileReplyRow({ reply, onPress }: ProfileReplyRowProps) {
  const styles = useThemedStyles(({ colors, scheme }) => createStyles(colors, scheme));
  const displayName = reply.author.arabicName || reply.author.displayName;
  const handle = reply.author.username ? `@${reply.author.username}` : '';
  const originalHandle =
    reply.originalAuthor.username ||
    reply.originalAuthor.arabicName ||
    reply.originalAuthor.displayName;
  const timestamp = reply.createdAt
    ? formatPostCardTimestampAr(reply.createdAt) || reply.createdAt
    : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="فتح المنشور الأصلي"
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={[styles.row, getRtlRow()]}>
        <UserProfileLink userId={reply.author.id}>
          <Image source={uriSource(reply.author.avatar)} style={styles.avatar} contentFit="cover" />
        </UserProfileLink>
        <View style={styles.main}>
          <View style={[styles.meta, getRtlRow()]}>
            <AppText style={styles.name} numberOfLines={1}>
              {displayName}
            </AppText>
            {reply.author.verified ? <VerificationBadge size={14} /> : null}
            {handle ? (
              <AppText style={styles.handle} numberOfLines={1}>
                {handle}
              </AppText>
            ) : null}
            {timestamp ? (
              <>
                <AppText style={styles.dot}>·</AppText>
                <AppText style={styles.time} numberOfLines={1}>
                  {timestamp}
                </AppText>
              </>
            ) : null}
          </View>
          <AppText style={styles.context}>
            رد على{' '}
            <AppText style={styles.mention}>@{originalHandle}</AppText>
          </AppText>
          <AppText style={styles.body}>{reply.content}</AppText>
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  return StyleSheet.create({
    wrap: {
      backgroundColor: scheme === 'light' ? colors.bgSurface : colors.bgDeep,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    pressed: {
      opacity: 0.86,
    },
    row: {
      alignItems: 'flex-start',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.bgElevated,
    },
    main: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    meta: {
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
    },
    name: {
      ...typography.feedTitle,
      color: colors.textPrimary,
      flexShrink: 1,
    },
    handle: {
      ...typography.caption,
      color: colors.textMuted,
      flexShrink: 1,
    },
    dot: {
      ...typography.caption,
      color: colors.textSubtle,
    },
    time: {
      ...typography.caption,
      color: colors.textMuted,
    },
    context: {
      ...typography.caption,
      color: colors.textMuted,
    },
    mention: {
      ...typography.caption,
      color: MENTION_BLUE,
    },
    body: {
      ...typography.feedBody,
      color: colors.textPrimary,
      lineHeight: 22,
    },
  });
}
