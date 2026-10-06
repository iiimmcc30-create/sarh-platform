import { StyleSheet, View } from 'react-native';
import { spacing, radius, type ThemeColors } from '@/constants/theme';
import { AppText, SarhAvatar, SarhButton } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { resolveMediaUrl } from '@/services/media';
import { COUNCIL_FULL_TEXT, councilUserName, type CouncilRequest } from '@/services/councils';
import { CouncilSheet } from './CouncilSheet';

type Props = {
  visible: boolean;
  requests: CouncilRequest[];
  isFull: boolean;
  busyId: string | null;
  onDecide: (request: CouncilRequest, accept: boolean) => void;
  onMore?: (request: CouncilRequest) => void;
  onClose: () => void;
};

export function CouncilRequestsSheet({ visible, requests, isFull, busyId, onDecide, onMore, onClose }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <CouncilSheet
      visible={visible}
      title="طلبات التحدث"
      subtitle={isFull ? COUNCIL_FULL_TEXT : requests.length ? `${requests.length} طلب` : undefined}
      onClose={onClose}
    >
      {requests.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted" align="center" style={styles.empty}>
          لا توجد طلبات حالياً
        </AppText>
      ) : (
        requests.map((r) => {
          const name = councilUserName(r.user);
          const busy = busyId === r.id;
          return (
            <Row key={r.id} gap="md" align="center" style={styles.row}>
              <SarhAvatar uri={r.user.avatar ? resolveMediaUrl(r.user.avatar) : null} name={name} size="md" />
              <View style={{ flex: 1 }}>
                <AppText variant="label" color="textPrimary" numberOfLines={1} onPress={onMore ? () => onMore(r) : undefined}>
                  {name}
                </AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={1}>
                  @{r.user.username}
                </AppText>
              </View>
              <SarhButton
                title="قبول"
                size="sm"
                shape="pill"
                disabled={isFull || busy}
                loading={busy}
                onPress={() => onDecide(r, true)}
              />
              <SarhButton title="رفض" size="sm" shape="pill" variant="secondary" disabled={busy} onPress={() => onDecide(r, false)} />
            </Row>
          );
        })
      )}
    </CouncilSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
    },
    empty: { paddingVertical: spacing.xl },
  });
}
