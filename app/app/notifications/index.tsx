// SAFAT — Notification Center (مركز الإشعارات)
import { EmptyState } from '@/components/ui/EmptyState';
import { NotificationCardSkeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { NotificationGroupRow } from '@/components/notifications/NotificationGroupRow';
import { useAuth } from '@/contexts/AuthContext';
import { AppText, SarhButton } from '@/design-system/components';
import { Row, Screen, ScreenBody } from '@/design-system/layout';
import { useNotificationsList } from '@/hooks/useNotificationsList';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { handleNotificationNavigation } from '@/lib/notifications';
import { groupNotifications, type InboxTab, type NotificationGroup } from '@/lib/notificationInbox';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { type ThemeColors } from '@/constants/theme';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';

const TABS: { key: InboxTab; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'mentions', label: 'الإشارات' },
];

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<InboxTab>('all');
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    refreshing,
    error,
    refresh,
    loadMore,
    markIds,
    markAllAsRead,
    retry,
  } = useNotificationsList(tab);

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  const handlePress = async (group: NotificationGroup) => {
    const unreadIds = group.ids.filter((id) => {
      const row = notifications.find((item) => item.id === id);
      return row ? !row.isRead : !group.isRead;
    });
    if (unreadIds.length > 0) {
      await markIds(unreadIds);
    }

    handleNotificationNavigation(
      { type: group.target.type, data: group.target.data },
      {
        router,
        isAdmin: user?.role === 'ADMIN',
      },
      { stayOnUnknown: true },
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator color={colors.glow} />
      </View>
    );
  };

  const firstLoad = loading && notifications.length === 0;
  const emptyTitle = tab === 'mentions' ? 'لا توجد إشارات' : 'لا توجد إشعارات';
  const emptyBody =
    tab === 'mentions'
      ? 'عندما يردّ أحد عليك أو يُشار إليك ستظهر هنا.'
      : 'ستظهر هنا الإعجابات وإعادات النشر والمتابعات والمجالس.';

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        variant="screen"
        title="الإشعارات"
        showBack
        rightIcon="checkmark-done-outline"
        onRightPress={unreadCount > 0 ? markAllAsRead : undefined}
        rightAccessibilityLabel="تعليم الكل كمقروء"
      />
      <ScreenBody scroll={false} gutter={false} padTop="none" gap="none">
        <Row gap="none" align="stretch" testID="notif-tabs">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                testID={`notif-tab-${item.key}`}
                style={styles.tab}
              >
                <AppText variant={active ? 'label' : 'body'} color={active ? 'textPrimary' : 'textMuted'}>
                  {item.label}
                </AppText>
                {active ? <View style={styles.tabIndicator} /> : <View style={styles.tabIndicatorIdle} />}
              </Pressable>
            );
          })}
        </Row>

        {unreadCount > 0 ? (
          <SarhButton
            title="تعليم الكل كمقروء"
            variant="secondary"
            size="sm"
            onPress={markAllAsRead}
            style={styles.markAllBtn}
          />
        ) : null}

        {error && notifications.length === 0 ? (
          <EmptyState
            title="تعذّر تحميل الإشعارات"
            description={error}
            actionLabel="إعادة المحاولة"
            onAction={retry}
            icon="alert-circle-outline"
          />
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationGroupRow group={item} onPress={() => void handlePress(item)} />
            )}
            style={styles.listFill}
            contentContainerStyle={[
              styles.list,
              groups.length === 0 && !firstLoad && styles.listEmpty,
            ]}
            refreshControl={
              <AppRefreshControl refreshing={refreshing} onRefresh={refresh} />
            }
            onEndReached={() => loadMore()}
            onEndReachedThreshold={0.35}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              firstLoad ? (
                <SkeletonRegion style={styles.skeletonList}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <NotificationCardSkeleton key={i} />
                  ))}
                </SkeletonRegion>
              ) : (
                <EmptyState title={emptyTitle} description={emptyBody} icon="notifications-outline" />
              )
            }
            showsVerticalScrollIndicator={false}
          />
        )}

        {error && notifications.length > 0 ? (
          <View style={styles.inlineError}>
            <AppText variant="caption" color="danger" align="center">
              {error}
            </AppText>
          </View>
        ) : null}
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingTop: 12,
      gap: 8,
    },
    tabIndicator: {
      height: 3,
      alignSelf: 'stretch',
      backgroundColor: colors.textPrimary,
      borderRadius: 2,
    },
    tabIndicatorIdle: {
      height: 3,
      alignSelf: 'stretch',
    },
    markAllBtn: {
      alignSelf: 'flex-start',
      marginHorizontal: 16,
      marginVertical: 8,
    },
    listFill: { flex: 1 },
    list: {
      paddingBottom: 48,
    },
    listEmpty: {
      flexGrow: 1,
    },
    skeletonList: { gap: 12 },
    footerLoader: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    inlineError: {
      padding: 12,
      backgroundColor: `${colors.danger}1F`,
      borderRadius: 10,
    },
  });
}
