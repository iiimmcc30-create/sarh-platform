import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { AppText } from '@/components/ui/AppText';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { SkeletonCircle, SkeletonPulse, SkeletonText } from '@/components/ui/skeleton';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { getRtlRow, getRtlText } from '@/lib/rtl';
import { avatarUrl } from '@/lib/listingMedia';
import type { ListingCommentThreadData } from '@/components/feature/listingCommentsUtils';
import type { PostComment } from '@/services/types';

/**
 * Listing comment row (RTL): one header line — avatar + name + verified badge
 * at the start (right), time at the far end (left) — and the text directly
 * under it. Replies render indented under their parent with a thin thread line.
 */
export const LISTING_COMMENT_AVATAR = 34;
export const LISTING_REPLY_AVATAR = 26;
/** More replies than this start collapsed behind «عرض الردود (n)». */
export const LISTING_REPLIES_COLLAPSE_OVER = 2;

/** Comment author is the listing's seller (managed listings pass no seller id → never). */
export function isListingSellerComment(comment: PostComment, sellerId?: string | null): boolean {
  return !!sellerId && !!comment.author?.id && comment.author.id === sellerId;
}

export type ListingCommentRowProps = {
  comment: PostComment;
  sellerId?: string | null;
  /** Smaller avatar / type for replies under a parent. */
  reply?: boolean;
  /** «رد» under the comment. */
  onReply?: (comment: PostComment) => void;
};

export function ListingCommentRow({ comment: c, sellerId, reply = false, onReply }: ListingCommentRowProps) {
  const styles = useThemedStyles(({ colors: t }) => createStyles(t));
  const isSeller = isListingSellerComment(c, sellerId);
  return (
    <View style={[styles.row, reply && styles.replyRow]}>
      <View style={[styles.header, getRtlRow()]}>
        <UserProfileLink userId={c.author.id} style={[styles.identity, getRtlRow()]}>
          <Image
            source={uriSource(avatarUrl(c.author.avatar))}
            style={reply ? styles.replyAvatar : styles.avatar}
            contentFit="cover"
          />
          <VerifiedInlineName
            name={c.author.arabicName || c.author.displayName}
            verified={c.author.verified}
            tier={c.author.verifiedTier}
            username={c.author.username}
            nameStyle={reply ? styles.replyName : styles.name}
          />
        </UserProfileLink>
        {isSeller ? (
          <View style={styles.sellerPill}>
            <Text style={styles.sellerPillText}>البائع</Text>
          </View>
        ) : null}
        <View style={styles.headerSpacer} />
        {c.createdAt ? (
          <Text style={styles.time} numberOfLines={1}>
            {c.createdAt}
          </Text>
        ) : null}
      </View>

      <AppText style={reply ? styles.replyText : styles.text}>{c.content}</AppText>

      {onReply ? (
        <View style={[styles.actions, getRtlRow()]}>
          <ReplyAction onPress={() => onReply(c)} />
        </View>
      ) : null}
    </View>
  );
}

function ReplyAction({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: t }) => createStyles(t));
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.action, getRtlRow()]}
      accessibilityRole="button"
      accessibilityLabel="رد"
    >
      <AppIcon name="chatbubble-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.actionText}>رد</Text>
    </Pressable>
  );
}

export type ListingCommentThreadProps = {
  thread: ListingCommentThreadData;
  sellerId?: string | null;
  divider?: boolean;
  onReply?: (comment: PostComment) => void;
};

/** Top-level comment + its replies (indented, thread line, collapsible when many). */
export function ListingCommentThread({ thread, sellerId, divider = false, onReply }: ListingCommentThreadProps) {
  const styles = useThemedStyles(({ colors: t }) => createStyles(t));
  const count = thread.replies.length;
  const collapsible = count > LISTING_REPLIES_COLLAPSE_OVER;
  const [expanded, setExpanded] = useState(false);
  const showReplies = count > 0 && (!collapsible || expanded);
  return (
    <View style={[styles.thread, divider && styles.divider]}>
      <ListingCommentRow comment={thread.comment} sellerId={sellerId} onReply={onReply} />
      {count > 0 ? (
        <View style={styles.replies}>
          <View style={styles.threadLine} />
          {showReplies
            ? thread.replies.map((r) => (
                <ListingCommentRow
                  key={r.id}
                  comment={r}
                  sellerId={sellerId}
                  reply
                  // Replying to a reply stays in the same thread (backend attaches to the parent).
                  onReply={onReply}
                />
              ))
            : null}
          {collapsible ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              hitSlop={6}
              style={[styles.toggle, getRtlRow()]}
              accessibilityRole="button"
            >
              <Text style={styles.toggleText}>
                {expanded ? 'إخفاء الردود' : `عرض الردود (${count})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** First-load placeholder with the real row geometry. */
export function ListingCommentRowSkeleton({ divider = false, wide = false }: { divider?: boolean; wide?: boolean }) {
  const styles = useThemedStyles(({ colors: t }) => createStyles(t));
  return (
    <View style={[styles.thread, divider && styles.divider]}>
      <SkeletonPulse style={styles.row}>
        <View style={[styles.header, getRtlRow()]}>
          <View style={[styles.identity, getRtlRow()]}>
            <SkeletonCircle size={LISTING_COMMENT_AVATAR} />
            <SkeletonText fontSize={typography.feedBody.fontSize} lineHeight={typography.feedBody.lineHeight} widths={[84]} />
          </View>
          <View style={styles.headerSpacer} />
          <SkeletonText fontSize={typography.micro.fontSize} lineHeight={typography.micro.lineHeight} widths={[36]} />
        </View>
        <SkeletonText fontSize={typography.feedBody.fontSize} lineHeight={21} widths={[wide ? '88%' : '64%']} />
      </SkeletonPulse>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    thread: {
      paddingVertical: spacing.md,
    },
    divider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    row: {
      gap: spacing.xs + 2,
    },
    replyRow: {
      paddingTop: spacing.sm + 2,
    },
    header: {
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: spacing.xs + 2,
      minWidth: 0,
    },
    identity: {
      alignItems: 'center',
      gap: spacing.sm,
      flexShrink: 1,
      minWidth: 0,
    },
    headerSpacer: {
      flex: 1,
      minWidth: spacing.sm,
    },
    avatar: {
      width: LISTING_COMMENT_AVATAR,
      height: LISTING_COMMENT_AVATAR,
      borderRadius: LISTING_COMMENT_AVATAR / 2,
      backgroundColor: colors.bgElevated,
    },
    replyAvatar: {
      width: LISTING_REPLY_AVATAR,
      height: LISTING_REPLY_AVATAR,
      borderRadius: LISTING_REPLY_AVATAR / 2,
      backgroundColor: colors.bgElevated,
    },
    name: {
      ...typography.feedBody,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    replyName: {
      ...typography.micro,
      fontSize: 13,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    sellerPill: {
      flexShrink: 0,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
    },
    sellerPillText: {
      ...typography.micro,
      fontSize: 11,
      lineHeight: 15,
      color: colors.textSecondary,
    },
    time: {
      ...typography.micro,
      color: colors.textSecondary,
      flexShrink: 0,
    },
    text: {
      ...typography.feedBody,
      color: colors.textPrimary,
      lineHeight: 21,
      ...getRtlText(),
    },
    replyText: {
      ...typography.feedBody,
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 20,
      ...getRtlText(),
    },
    actions: {
      alignItems: 'center',
      gap: spacing.lg,
    },
    action: {
      alignItems: 'center',
      gap: 4,
      paddingVertical: 2,
    },
    actionText: {
      ...typography.micro,
      color: colors.textSecondary,
    },
    replies: {
      position: 'relative',
      paddingStart: LISTING_COMMENT_AVATAR / 2 + spacing.md,
      marginTop: spacing.xs,
    },
    // Thin thread line under the parent avatar (start side).
    threadLine: {
      position: 'absolute',
      start: LISTING_COMMENT_AVATAR / 2 - 1,
      top: 0,
      bottom: spacing.xs,
      width: 2,
      borderRadius: 1,
      backgroundColor: colors.borderHairline,
    },
    toggle: {
      alignItems: 'center',
      paddingTop: spacing.sm,
    },
    toggleText: {
      ...typography.micro,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}

export default ListingCommentRow;
