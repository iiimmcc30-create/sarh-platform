import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from '@/components/ui/AppImage';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import {
  collectionMembersLabel,
  type Collection,
} from '@/services/collections';
import { resolveMediaUrl } from '@/services/media';

type Props = {
  collection: Collection;
  /** «+ إضافة» / «تمت الإضافة» = follow / unfollow. Hidden for the owner. */
  onAdd?: () => void;
  addBusy?: boolean;
  onPress: () => void;
};

/**
 * Clean RTL row for the Collections list (not a card):
 * [square cover] [name + N عضو] … [«+ إضافة»].
 */
export function CollectionRow({ collection, onAdd, addBusy, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const cover = resolveMediaUrl(collection.coverUrl);
  const showAdd = Boolean(onAdd) && !collection.isOwner;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={collection.name}
    >
      <Row gap="md" align="center" fill>
        <View style={styles.coverWrap}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
          ) : (
            <View style={[styles.cover, styles.coverFallback]}>
              <AppIcon name="people-outline" size={22} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.meta}>
          <AppText variant="label" color="textPrimary" numberOfLines={1}>
            {collection.name}
          </AppText>
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {collectionMembersLabel(collection.membersCount)}
          </AppText>
        </View>
        {showAdd ? (
          <SarhButton
            title={collection.isFollowing ? 'تمت الإضافة' : '+ إضافة'}
            variant={collection.isFollowing ? 'secondary' : 'primary'}
            size="sm"
            shape="pill"
            loading={addBusy}
            onPress={onAdd}
            accessibilityLabel={
              collection.isFollowing ? 'إزالة من قوائمي' : 'إضافة إلى قوائمي'
            }
          />
        ) : null}
      </Row>
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
    pressed: { opacity: 0.85 },
    coverWrap: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      backgroundColor: colors.bgField,
    },
    cover: { width: '100%', height: '100%' },
    coverFallback: { alignItems: 'center', justifyContent: 'center' },
    meta: { flex: 1, minWidth: 0, gap: 2 },
  });
}
