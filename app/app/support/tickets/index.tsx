import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { rtlForwardIcon } from '@/lib/rtl';
import {
  fetchMyTickets,
  TICKET_CATEGORY_LABEL_AR,
  type SupportTicketSummary,
  type SupportTicketCategory,
} from '@/services/support';
import { userFacingTicketStatus } from '@/lib/supportFlow';
import { motion } from '@/design-system';
import { AppText, SarhButton, SarhCard } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';

export default function SupportTicketsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [items, setItems] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await fetchMyTickets();
    if (data) setItems(data.items);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="تذاكر الدعم" showBack />
      <ScreenBody scroll={false} padTop="lg" gap="lg">
        <SarhButton
          title="إنشاء تذكرة جديدة"
          fullWidth
          onPress={() => router.push('/support' as never)}
        />

        {loading && items.length === 0 ? (
          <ActivityIndicator style={styles.loader} />
        ) : items.length === 0 ? (
          <Stack gap="sm" align="center" style={styles.empty}>
            <AppIcon name="ticket" size={32} color={colors.textMuted} />
            <AppText variant="cardTitle" color="textPrimary">لا توجد تذاكر بعد</AppText>
            <AppText variant="caption" color="textMuted" align="center">
              أنشئ تذكرة جديدة وسنرد عليك في أقرب وقت
            </AppText>
          </Stack>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/support/tickets/[id]', params: { id: item.id } } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`تذكرة ${item.ticketNumber}`}
                style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
              >
                <SarhCard level="card" padding="md">
                  <Stack gap="sm">
                    <Row gap="sm" justify="between">
                      <AppText variant="caption" color="primary">{item.ticketNumber}</AppText>
                      <View style={styles.statusPill}>
                        <AppText variant="caption" color="textSecondary">
                          {userFacingTicketStatus(item.status)}
                        </AppText>
                      </View>
                    </Row>
                    <AppText variant="bodyMedium" color="textPrimary" numberOfLines={2}>
                      {item.subject}
                    </AppText>
                    <Row gap="sm" justify="between">
                      <AppText variant="caption" color="textMuted">
                        {TICKET_CATEGORY_LABEL_AR[item.category as SupportTicketCategory] ??
                          item.category}
                      </AppText>
                      <AppIcon name={rtlForwardIcon()} size={14} color={colors.textMuted} />
                    </Row>
                  </Stack>
                </SarhCard>
              </Pressable>
            )}
          />
        )}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    loader: { marginTop: spacing.xl },
    list: { gap: spacing.md, paddingBottom: spacing.huge },
    empty: { paddingVertical: spacing.xxl },
    statusPill: {
      backgroundColor: colors.bgSurface,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
  });
}
