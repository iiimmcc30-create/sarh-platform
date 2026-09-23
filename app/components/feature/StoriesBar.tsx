import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { cloudinaryFitUrl } from '@/lib/listingMedia';
import { StoryGroup } from '@/services/stories';
import { StoryViewer } from '@/components/feature/StoryViewer';

const CIRCLE = 64;
const INNER = CIRCLE - 8;
const RING_BORDER = 2;

const STORY_GRADIENT = ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'] as const;

type StoriesBarProps = {
  feed: StoryGroup[];
  myStories: StoryGroup | null;
  myAvatar?: string;
  currentUserId?: string;
  accessToken?: string | null;
  loading?: boolean;
  onAddStory: () => void;
  onRefresh: () => void;
};

function StoryRing({
  unseen,
  children,
  empty,
  scheme,
}: {
  unseen: boolean;
  children: ReactNode;
  empty?: boolean;
  scheme: 'light' | 'dark';
}) {
  const styles = useThemedStyles(({ colors }) => createBarStyles(colors, scheme));

  if (empty) {
    return (
      <View style={[styles.ring, styles.ringEmpty]}>
        {children}
      </View>
    );
  }

  if (unseen) {
    return (
      <LinearGradient
        colors={[...STORY_GRADIENT]}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={styles.ringGradient}
      >
        <View style={styles.ringInner}>{children}</View>
      </LinearGradient>
    );
  }

  return <View style={[styles.ring, styles.ringSeen]}>{children}</View>;
}

export function buildStoryGroups(
  myStories: StoryGroup | null,
  feed: StoryGroup[],
): StoryGroup[] {
  return myStories ? [myStories, ...feed] : feed;
}

export function StoriesBar({
  feed,
  myStories,
  myAvatar,
  currentUserId,
  accessToken,
  loading,
  onAddStory,
  onRefresh,
}: StoriesBarProps) {
  const { scheme } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createBarStyles(c, scheme));
  const [viewer, setViewer] = useState<{ groups: StoryGroup[]; index: number } | null>(
    null,
  );

  const hasMyStories = (myStories?.stories.length ?? 0) > 0;

  const openMyStories = () => {
    if (hasMyStories && myStories) {
      setViewer({ groups: buildStoryGroups(myStories, feed), index: 0 });
      return;
    }
    onAddStory();
  };

  const openGroup = (group: StoryGroup) => {
    const groups = buildStoryGroups(myStories, feed);
    const index = groups.findIndex((g) => g.user.id === group.user.id);
    setViewer({ groups, index: Math.max(0, index) });
  };

  return (
    <>
      <View style={styles.wrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          <Pressable onPress={openMyStories} style={styles.itemWrap}>
            <StoryRing
              unseen={!!myStories?.hasUnseen}
              empty={!hasMyStories}
              scheme={scheme}
            >
              <Image
                source={uriSource(cloudinaryFitUrl(myStories?.latestThumbnail || myAvatar, 'row'))}
                style={styles.avatar}
                contentFit="cover"
              />
              <Pressable onPress={onAddStory} style={styles.addIcon} hitSlop={6}>
                <AppIcon name="add" size={13} color="#fff" />
              </Pressable>
            </StoryRing>
            <Text style={styles.label} numberOfLines={1}>
              {hasMyStories ? 'قصتي' : 'إضافة'}
            </Text>
          </Pressable>

          {loading && feed.length === 0
            ? [0, 1, 2, 3, 4].map((i) => (
                <View key={`sk-${i}`} style={styles.itemWrap}>
                  <View style={[styles.ring, styles.skeleton]} />
                  <View style={styles.skeletonLabel} />
                </View>
              ))
            : feed.map((group) => {
                const firstName = (
                  group.user.arabicName ||
                  group.user.displayName ||
                  group.user.username
                ).split(' ')[0];

                return (
                  <Pressable
                    key={group.user.id}
                    onPress={() => openGroup(group)}
                    style={styles.itemWrap}
                  >
                    <StoryRing unseen={group.hasUnseen} scheme={scheme}>
                      <Image
                        source={uriSource(cloudinaryFitUrl(
                          group.latestThumbnail || group.user.avatar,
                          'row',
                        ))}
                        style={styles.avatar}
                        contentFit="cover"
                      />
                      {group.storiesCount > 1 ? (
                        <View style={styles.countBadge}>
                          <Text style={styles.countText}>{group.storiesCount}</Text>
                        </View>
                      ) : null}
                    </StoryRing>
                    <Text
                      style={[
                        styles.label,
                        group.hasUnseen && styles.labelUnseen,
                      ]}
                      numberOfLines={1}
                    >
                      {firstName}
                    </Text>
                  </Pressable>
                );
              })}
        </ScrollView>
      </View>

      {viewer ? (
        <StoryViewer
          groups={viewer.groups}
          startGroupIndex={viewer.index}
          currentUserId={currentUserId}
          accessToken={accessToken}
          onClose={() => setViewer(null)}
          onRefresh={onRefresh}
        />
      ) : null}
    </>
  );
}

function createBarStyles(colors: ThemeColors, scheme: 'light' | 'dark') {
  const isDark = scheme === 'dark';
  return StyleSheet.create({
    wrap: {
      borderBottomWidth: isDark ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
      paddingBottom: isDark ? spacing.xs : spacing.sm,
      paddingTop: 0,
    },
    row: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
      paddingBottom: 0,
      gap: spacing.md,
    },
    itemWrap: { alignItems: 'center', gap: spacing.xs, width: CIRCLE + spacing.sm },
    ringGradient: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      padding: RING_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringInner: {
      width: INNER,
      height: INNER,
      borderRadius: INNER / 2,
      backgroundColor: colors.bgDeep,
      padding: RING_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: CIRCLE / 2,
      padding: RING_BORDER,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringSeen: {
      borderWidth: RING_BORDER,
      borderColor: colors.borderMid,
      backgroundColor: colors.bgDeep,
      padding: RING_BORDER,
    },
    ringEmpty: {
      borderWidth: RING_BORDER,
      borderColor: colors.borderSoft,
      borderStyle: 'dashed',
      backgroundColor: colors.bgElevated,
    },
    avatar: {
      width: INNER - RING_BORDER * 2,
      height: INNER - RING_BORDER * 2,
      borderRadius: (INNER - RING_BORDER * 2) / 2,
      backgroundColor: colors.bgElevated,
    },
    addIcon: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 22,
      height: 22,
      borderRadius: 12,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: colors.bgDeep,
    },
    countBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.electric,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      borderWidth: 2,
      borderColor: colors.bgDeep,
    },
    countText: {
      ...typography.badge,
      color: '#fff',
    },
    label: {
      ...typography.caption,
      color: colors.textMuted,
      textAlign: 'center',
      width: CIRCLE + spacing.sm,
    },
    labelUnseen: {
      color: colors.textPrimary,
      fontWeight: '600',
    },
    skeleton: {
      backgroundColor: colors.bgElevated,
      borderColor: colors.borderSoft,
      borderWidth: 2,
    },
    skeletonLabel: {
      width: 44,
      height: 8,
      borderRadius: radius.sm,
      backgroundColor: colors.bgElevated,
    },
  });
}
