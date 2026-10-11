import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { sarh } from '@/constants/sarhTokens';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { COLLECTION_MARK_SIZE, collectionMarkColor } from '@/lib/collectionMark';
import { getRtlRow } from '@/lib/rtl';
import {
  collectionFollowersIncluding,
  collectionMembersMeta,
  collectionOwnerName,
  type Collection,
} from '@/services/collections';
import { resolveMediaUrl } from '@/services/media';

type Props = {
  collection: Collection;
  /** Discover rows follow with +. Your lists pin instead. */
  mode: 'discover' | 'mine';
  pinned?: boolean;
  busy?: boolean;
  onFollow?: () => void;
  onPin?: () => void;
  onPress: () => void;
};

const AVATAR = 18;

/**
 * X-style list row (not a card): cover on the inline start, name and meta,
 * a small circular action on the inline end. Hairline separators live outside.
 */
export function CollectionRow({
  collection,
  mode,
  pinned = false,
  busy = false,
  onFollow,
  onPin,
  onPress,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const cover = resolveMediaUrl(collection.coverUrl);
  const mark = collectionMarkColor(collection.id);
  const previews = (collection.previewMembers ?? []).slice(0, 3);
  const ownerName = collectionOwnerName(collection.owner);
  const ownerAvatar = resolveMediaUrl(collection.owner.avatar);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={collection.name}
    >
      <View style={[styles.line, getRtlRow()]}>
        <View style={[styles.mark, { backgroundColor: cover ? colors.bgField : mark }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.markImage} contentFit="cover" />
          ) : (
            <AppIcon name="lists-outline" size={22} color={sarh.color.action} />
          )}
        </View>

        <View style={styles.meta}>
          <AppText variant="label" color="textPrimary" numberOfLines={1}>
            {collection.name}
            <AppText variant="caption" color="textMuted">
              {`  ${collectionMembersMeta(collection.membersCount)}`}
            </AppText>
          </AppText>
          {mode === 'mine' ? (
            <View style={[styles.ownerLine, getRtlRow()]}>
              {ownerAvatar ? (
                <Image source={{ uri: ownerAvatar }} style={styles.ownerAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.ownerAvatar, styles.ownerFallback]}>
                  <AppIcon name="person-outline" size={10} color={colors.textMuted} />
                </View>
              )}
              <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.ownerName}>
                {ownerName}
              </AppText>
            </View>
          ) : (
            <View style={[styles.followLine, getRtlRow()]}>
              {previews.length > 0 ? (
                <View style={[styles.avatars, getRtlRow()]}>
                  {previews.map((user, index) => {
                    const uri = resolveMediaUrl(user.avatar);
                    return uri ? (
                      <Image
                        key={user.id}
                        source={{ uri }}
                        style={[styles.mini, index > 0 && styles.miniOverlap]}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        key={user.id}
                        style={[styles.mini, styles.miniFallback, index > 0 && styles.miniOverlap]}
                      />
                    );
                  })}
                </View>
              ) : null}
              <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.followText}>
                {collectionFollowersIncluding(
                  collection.followersCount,
                  collection.mutualFollower?.username,
                )}
              </AppText>
            </View>
          )}
        </View>

        {mode === 'mine' ? (
          <Pressable
            onPress={onPin}
            disabled={busy}
            hitSlop={8}
            style={[styles.action, pinned && styles.actionOn]}
            accessibilityRole="button"
            accessibilityLabel={pinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة'}
          >
            <AppIcon
              name="pin"
              size={16}
              color={pinned ? colors.onElectric : colors.textPrimary}
              variant={pinned ? 'sr' : 'rr'}
            />
          </Pressable>
        ) : (
          <Pressable
            onPress={onFollow}
            disabled={busy || collection.isFollowing}
            hitSlop={8}
            style={[styles.action, collection.isFollowing && styles.actionOn]}
            accessibilityRole="button"
            accessibilityLabel={collection.isFollowing ? 'تتابع القائمة' : 'متابعة القائمة'}
          >
            <AppIcon
              name={collection.isFollowing ? 'checkmark' : 'plus'}
              size={16}
              color={collection.isFollowing ? colors.onElectric : colors.textPrimary}
            />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.screenRoot,
    },
    pressed: { opacity: 0.72 },
    line: { alignItems: 'center', gap: spacing.md },
    mark: {
      width: COLLECTION_MARK_SIZE,
      height: COLLECTION_MARK_SIZE,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    markImage: { width: '100%', height: '100%' },
    meta: { flex: 1, minWidth: 0, gap: 4 },
    followLine: { alignItems: 'center', gap: spacing.xs },
    followText: { flex: 1 },
    avatars: { alignItems: 'center' },
    mini: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      borderWidth: 1,
      borderColor: colors.screenRoot,
      backgroundColor: colors.bgField,
    },
    miniOverlap: { marginStart: -6 },
    miniFallback: { backgroundColor: colors.borderSoft },
    ownerLine: { alignItems: 'center', gap: 6 },
    ownerAvatar: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: AVATAR / 2,
      backgroundColor: colors.bgField,
    },
    ownerFallback: { alignItems: 'center', justifyContent: 'center' },
    ownerName: { flex: 1 },
    action: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.screenRoot,
    },
    actionOn: {
      backgroundColor: colors.electric,
      borderColor: colors.electric,
    },
  });
}
