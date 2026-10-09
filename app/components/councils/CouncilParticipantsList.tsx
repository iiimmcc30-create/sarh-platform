import { memo, useCallback, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { spacing } from '@/constants/theme';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { COUNCIL_GRID_COLUMNS, type CouncilParticipant } from '@/services/councils';
import { SpeakerSeat } from './SpeakerSeat';

type Props = {
  participants: CouncilParticipant[];
  speakingUserIds: Set<string>;
  myUserId: string | undefined;
  /** Listeners with a pending «طلب التحدث» (only filled for the host / moderators). */
  raisedHands: Set<string>;
  header: ReactElement;
  loadingMore: boolean;
  bottomInset: number;
  onEndReached: () => void;
  onPress: (p: CouncilParticipant) => void;
};

/** Row height (avatar ring + name + role tag + gap) for getItemLayout-free smooth paging. */
const ROW_GAP = spacing.lg;

/**
 * X Spaces participants grid: every participant in equal circles, 4 per row —
 * owner, moderators, speakers, then listeners. Virtualized (FlatList) and paged:
 * reaching the end asks the session for the next page of listeners.
 */
function CouncilParticipantsListBase({
  participants,
  speakingUserIds,
  myUserId,
  raisedHands,
  header,
  loadingMore,
  bottomInset,
  onEndReached,
  onPress,
}: Props) {
  const layout = useLayout();
  const { colors } = useTheme();

  const renderItem = useCallback<ListRenderItem<CouncilParticipant>>(
    ({ item }) => (
      <View style={styles.cell}>
        <SpeakerSeat
          speaker={item}
          speaking={item.onStage && speakingUserIds.has(item.userId)}
          isMe={item.userId === myUserId}
          handRaised={!item.onStage && raisedHands.has(item.userId)}
          onPress={onPress}
        />
      </View>
    ),
    [myUserId, onPress, raisedHands, speakingUserIds],
  );

  return (
    <FlatList
      testID="council-participants"
      data={participants}
      keyExtractor={(p) => p.userId}
      numColumns={COUNCIL_GRID_COLUMNS}
      renderItem={renderItem}
      extraData={speakingUserIds}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={colors.textMuted} style={styles.footer} /> : null
      }
      columnWrapperStyle={styles.row}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: layout.gutter, paddingBottom: bottomInset + spacing.xl },
      ]}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      initialNumToRender={24}
      maxToRenderPerBatch={16}
      windowSize={9}
      removeClippedSubviews
      showsVerticalScrollIndicator={false}
    />
  );
}

export const CouncilParticipantsList = memo(CouncilParticipantsListBase);

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  header: { marginBottom: spacing.xl },
  row: { marginBottom: ROW_GAP },
  /** Equal columns; a short last row keeps the same circle size (no stretching). */
  cell: { width: `${100 / COUNCIL_GRID_COLUMNS}%` },
  footer: { paddingVertical: spacing.lg },
});
