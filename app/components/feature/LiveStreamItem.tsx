// Powered by OnSpace.AI
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlText, inlineEnd, inlineStart, marginStart, getRtlRow } from '@/lib/rtl';
import { LiveStream } from '@/services/types';
import { UserProfileLink } from '@/components/feature/UserProfileLink';

interface LiveStreamItemProps {
  stream: LiveStream;
  height: number;
  onComment?: () => void;
  onShare?: () => void;
}

function LiveStreamItemInner({ stream, height, onComment, onShare }: LiveStreamItemProps) {
  const [following, setFollowing] = useState(false);
  const { colors, gradients } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const commentCount = stream.comments?.length ?? 0;

  return (
    <View style={[styles.container, { height }]}>
      <Image
        source={uriSource(stream.thumbnail)}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={0}
        priority="low"
      />
      <LinearGradient colors={gradients.liveOverlay} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(6,9,26,0.6)', 'transparent']}
        style={[StyleSheet.absoluteFill, { height: 180 }]}
      />

      <View style={styles.topRow}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>مباشر</Text>
        </View>
        <View style={styles.viewerBadge}>
          <AppIcon name="eye" size={14} color={colors.textPrimary} />
          <Text style={styles.viewerText}>{(((stream.viewers ?? 0) / 1000)).toFixed(1)}K</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{stream.category}</Text>
        </View>
      </View>

      <View style={styles.actionsCol}>
        <UserProfileLink userId={stream.host?.id} style={styles.avatarWrap}>
          <Image source={uriSource(stream.host?.avatar)} style={styles.avatar} contentFit="cover" transition={0} />
          <Pressable
            onPress={() => setFollowing((f) => !f)}
            style={[styles.followBtn, following && styles.followingBtn]}
          >
            <AppIcon name={following ? 'checkmark' : 'add'} size={14} color="#fff" />
          </Pressable>
        </UserProfileLink>

        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <AppIcon name="heart-outline" size={32} color="#fff" />
          <Text style={styles.actionText}>{((stream.likes ?? 0) / 1000).toFixed(1)}K</Text>
        </Pressable>

        <Pressable onPress={onComment} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <AppIcon name="chatbubble-ellipses-outline" size={30} color="#fff" />
          <Text style={styles.actionText}>{commentCount}</Text>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <AppIcon name="gavel" size={28} color={colors.gold} />
          <Text style={[styles.actionText, { color: colors.gold }]}>مزايدة</Text>
        </Pressable>

        <Pressable onPress={onShare} style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}>
          <AppIcon name="paper-plane-outline" size={28} color="#fff" />
          <Text style={styles.actionText}>مشاركة</Text>
        </Pressable>
      </View>

      <View style={styles.bottom}>
        <View style={styles.hostRow}>
          <UserProfileLink userId={stream.host?.id} style={styles.hostInfo}>
            <Text style={styles.hostName}>{stream.host?.arabicName || 'مستخدم سرح'}</Text>
            {stream.host?.verified ? (
              <AppIcon name="checkmark-circle" size={16} color={colors.electricBright} style={marginStart(4)} />
            ) : null}
          </UserProfileLink>
          <View style={styles.topicPill}>
            <AppIcon name="broadcast" size={12} color={colors.glow} />
            <Text style={styles.topicText}>{stream.topic}</Text>
          </View>
        </View>
        <Text style={styles.streamArabic} numberOfLines={2}>{stream.arabicTitle}</Text>

        <View style={styles.commentsArea}>
          {(stream.comments ?? []).slice(-3).map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Image source={uriSource(c.avatar)} style={styles.commentAvatar} transition={0} />
              <View style={[styles.commentBubble, c.isOffer && styles.offerBubble]}>
                <Text style={styles.commentUser}>{c.arabicUser}</Text>
                <Text style={styles.commentMsg}>{c.message}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.bgDeep,
    overflow: 'hidden',
    borderRadius: radius.xl,
    marginBottom: spacing.md,
  },
  topRow: {
    position: 'absolute',
    top: 60,
    ...inlineStart(spacing.lg),
    ...getRtlRow(),
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveBadge: {
    ...getRtlRow(),
    alignItems: 'center',
    backgroundColor: colors.liveRed,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    ...typography.micro,
    color: '#fff',
  },
  viewerBadge: {
    ...getRtlRow(),
    alignItems: 'center',
    backgroundColor: 'rgba(6,9,26,0.7)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  viewerText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  categoryBadge: {
    backgroundColor: 'rgba(59,130,246,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderMid,
  },
  categoryText: {
    ...typography.caption,
    color: colors.textBrand,
  },
  actionsCol: {
    position: 'absolute',
    ...inlineEnd(spacing.lg),
    bottom: 220,
    alignItems: 'center',
    gap: spacing.xl,
  },
  avatarWrap: {
    width: 52,
    height: 64,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#fff',
  },
  followBtn: {
    position: 'absolute',
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 12,
    backgroundColor: colors.electric,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bgDeep,
  },
  followingBtn: {
    backgroundColor: colors.success,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 4,
  },
  pressed: {
    transform: [{ scale: 0.9 }],
  },
  actionText: {
    ...typography.micro,
    color: '#fff',
  },
  bottom: {
    position: 'absolute',
    ...inlineStart(spacing.lg),
    ...inlineEnd(80),
    bottom: 120,
  },
  hostRow: {
    ...getRtlRow(),
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  hostInfo: {
    ...getRtlRow(),
    alignItems: 'center',
  },
  hostName: {
    ...typography.bodyStrong,
    color: '#fff',
  },
  topicPill: {
    ...getRtlRow(),
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderMid,
    backgroundColor: 'rgba(125,211,252,0.1)',
  },
  topicText: {
    ...typography.micro,
    color: colors.textBrand,
  },
  streamArabic: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    ...getRtlText(),
  },
  commentsArea: {
    gap: 6,
  },
  commentRow: {
    ...getRtlRow(),
    alignItems: 'flex-start',
    gap: 8,
  },
  commentAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  commentBubble: {
    backgroundColor: 'rgba(6,9,26,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    flex: 1,
  },
  offerBubble: {
    backgroundColor: 'rgba(245,197,106,0.15)',
    borderColor: 'rgba(245,197,106,0.5)',
  },
  commentUser: {
    ...typography.micro,
    color: colors.textBrand,
  },
  commentMsg: {
    ...typography.caption,
    color: '#fff',
  },
  });
}

export const LiveStreamItem = memo(LiveStreamItemInner, (prev, next) =>
  prev.height === next.height &&
  prev.stream.id === next.stream.id &&
  prev.stream.viewers === next.stream.viewers &&
  prev.stream.likes === next.stream.likes &&
  prev.stream.thumbnail === next.stream.thumbnail,
);

export default LiveStreamItem;
