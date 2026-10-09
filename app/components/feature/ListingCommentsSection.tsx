import { SkeletonRegion } from '@/components/ui/skeleton';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useListingComments } from '@/hooks/useListingComments';
import { getRtlRow, getRtlText } from '@/lib/rtl';
import { ListingCommentsModal } from '@/components/feature/ListingCommentsModal';
import { ListingCommentThread, ListingCommentRowSkeleton } from '@/components/feature/ListingCommentRow';
import { groupListingComments } from '@/components/feature/listingCommentsUtils';
import type { PostComment } from '@/services/types';
import { AppText } from '@/components/ui/AppText';

type ListingCommentsSectionProps = {
  listingId: string;
  /** Flat full-width section for listing detail edge-to-edge layout */
  layout?: 'card' | 'edge';
  /** Listing seller id — their comments get the «البائع» label. */
  sellerId?: string | null;
};

export function ListingCommentsSection({
  listingId,
  layout = 'edge',
  sellerId,
}: ListingCommentsSectionProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors, layout));
  const { comments, loading, loadError, rateLimited, reload } = useListingComments(listingId);
  const [modalVisible, setModalVisible] = useState(false);
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const threads = useMemo(() => groupListingComments(comments), [comments]);

  // «رد» opens the composer prefilled as a reply to that comment.
  const openReply = (comment: PostComment) => {
    setReplyTo(comment);
    setModalVisible(true);
  };

  const handleRetry = () => {
    if (rateLimited) return;
    void reload(true);
  };

  return (
    <>
      <View style={layout === 'edge' ? styles.section : styles.card}>
        <View style={{ width: '100%' }}>
          <AppText style={styles.sectionTitle}>عدد التعليقات ({comments.length})</AppText>
        </View>

        {loading && comments.length === 0 ? (
          // First load: placeholders with the real comment-row geometry.
          <SkeletonRegion style={styles.list}>
            {[0, 1, 2].map((index) => (
              <ListingCommentRowSkeleton key={index} divider={index < 2} wide={index === 1} />
            ))}
          </SkeletonRegion>
        ) : loadError && comments.length === 0 ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            {!rateLimited ? (
              <Pressable onPress={handleRetry} style={styles.retryBtn}>
                <Text style={styles.retryText}>إعادة المحاولة</Text>
              </Pressable>
            ) : null}
          </View>
        ) : comments.length === 0 ? null : (
          <View style={styles.list}>
            {threads.map((t, index) => (
              <ListingCommentThread
                key={t.comment.id}
                thread={t}
                sellerId={sellerId}
                divider={index < threads.length - 1}
                onReply={openReply}
              />
            ))}
          </View>
        )}

        <Pressable
          onPress={() => {
            setReplyTo(null);
            setModalVisible(true);
          }}
          style={[styles.addCommentTrigger, getRtlRow()]}
        >
          <View style={[styles.addCommentInput, getRtlRow()]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText style={styles.addCommentPlaceholder}>أكتب تعليقك هنا...</AppText>
            </View>
            <AppIcon name="send" size={18} color={colors.textSubtle} />
          </View>
        </Pressable>
      </View>

      <ListingCommentsModal
        visible={modalVisible}
        listingId={listingId}
        comments={comments}
        loading={loading}
        loadError={loadError}
        rateLimited={rateLimited}
        onClose={() => {
          setModalVisible(false);
          setReplyTo(null);
        }}
        initialReplyTo={replyTo}
        onCommentAdded={() => void reload(true)}
        onReload={() => void reload(true)}
        sellerId={sellerId}
      />
    </>
  );
}

function createStyles(colors: ThemeColors, layout: 'card' | 'edge') {
  const isEdge = layout === 'edge';
  return StyleSheet.create({
    section: {
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
      backgroundColor: colors.screenRoot,
    },
    card: {
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xl,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    sectionTitle: {
      ...typography.feedTitle,
      color: colors.textPrimary,
      ...getRtlText(),
    },
    errorBox: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    errorText: {
      ...typography.feedBody,
      color: colors.rose,
      textAlign: 'center',
      lineHeight: 22,
    },
    retryBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    retryText: {
      ...typography.feedTitle,
      color: colors.electricBright,
    },
    list: {
      gap: isEdge ? 0 : spacing.sm,
    },
    addCommentTrigger: {
      width: '100%',
      ...(isEdge
        ? {
            marginTop: spacing.xs,
            paddingTop: spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.borderHairline,
          }
        : null),
    },
    addCommentInput: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      paddingHorizontal: spacing.md + 2,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      backgroundColor: colors.bgElevated,
    },
    addCommentPlaceholder: {
      ...typography.feedBody,
      color: colors.textSubtle,
      ...getRtlText(),
    },
  });
}
