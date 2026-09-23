import { ActivityIndicator } from 'react-native';
import { AppText, SarhButton } from '@/design-system/components';
import { Stack } from '@/design-system/layout';
import { space } from '@/design-system/tokens';
import { useTheme } from '@/hooks/useTheme';

export function SellerListingsPaginationFooter({
  hasMore,
  loadingMore,
  loadMoreFailed,
  onLoadMore,
}: {
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  onLoadMore: () => void;
}) {
  const { colors } = useTheme();

  if (!hasMore && !loadingMore && !loadMoreFailed) return null;

  return (
    <Stack gap="sm" align="center" style={{ paddingVertical: space[24] }}>
      {loadingMore ? <ActivityIndicator color={colors.electricBright} /> : null}
      {loadMoreFailed && !loadingMore ? (
        <>
          <AppText variant="caption" color="textMuted">
            تعذّر تحميل المزيد
          </AppText>
          <SarhButton title="إعادة المحاولة" size="sm" variant="secondary" onPress={onLoadMore} />
        </>
      ) : null}
      {hasMore && !loadingMore && !loadMoreFailed ? (
        <SarhButton title="تحميل المزيد" size="sm" variant="secondary" onPress={onLoadMore} />
      ) : null}
    </Stack>
  );
}
