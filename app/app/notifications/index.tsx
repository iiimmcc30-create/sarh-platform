// SAFAT — Notification Center (مركز الإشعارات)
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { NotificationCard } from '@/components/notifications/NotificationCard';
import { useAuth } from '@/contexts/AuthContext';
import { SarhButton } from '@/design-system/components';
import { AppText } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { useNotificationsList } from '@/hooks/useNotificationsList';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { handleNotificationNavigation } from '@/lib/notifications';
import type { AppNotification } from '@/services/notifications';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { type ThemeColors } from '@/constants/theme';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    refreshing,
    error,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    retry,
  } = useNotificationsList();

  const handlePress = async (notification: AppNotification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }

    handleNotificationNavigation(
      { type: notification.type, data: notification.data },
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

  if (loading && notifications.length === 0) {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="الإشعارات" showBack />
        <ScreenBody scroll={false}>
          <LoadingState message="جاري تحميل الإشعارات..." />
        </ScreenBody>
      </Screen>
    );
  }

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
      <ScreenBody scroll={false} padTop="sm" gap="sm">
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
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <NotificationCard notification={item} onPress={() => handlePress(item)} />
            )}
            style={styles.listFill}
            contentContainerStyle={[
              styles.list,
              notifications.length === 0 && styles.listEmpty,
            ]}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.glow} />
            }
            onEndReached={() => loadMore()}
            onEndReachedThreshold={0.35}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={
              <EmptyState
                title="لا توجد إشعارات"
                description="ستظهر هنا إشعارات نشاطك وطلباتك."
                icon="notifications-outline"
              />
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
    markAllBtn: {
      alignSelf: 'flex-start',
    },
    listFill: { flex: 1 },
    list: {
      paddingBottom: 48,
      gap: 12,
    },
    listEmpty: {
      flexGrow: 1,
    },
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
