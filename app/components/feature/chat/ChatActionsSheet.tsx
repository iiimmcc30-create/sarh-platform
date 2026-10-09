/**
 * Chat header «المزيد» sheet — conversation actions (mute, block, profile).
 * Built on the shared sheet system (SheetModal + SheetSurface): spring up, dim
 * backdrop, drag down to dismiss, surface flush to the bottom edge.
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { SheetModal } from '@/components/ui/SheetModal';
import { SheetSurface } from '@/components/ui/sheets/SheetSurface';
import { AppText } from '@/design-system/components';
import { space } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

export type ChatActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Peer display name (sheet title). */
  name: string;
  muted: boolean;
  /** Mute needs a server thread — disabled until the first message exists. */
  muteAvailable: boolean;
  muteBusy?: boolean;
  onToggleMute: () => void;
  blocked: boolean;
  /** Runs after the sheet has closed (the caller asks for confirmation). */
  onBlockToggle: () => void;
  onViewProfile?: () => void;
};

export function ChatActionsSheet({
  visible,
  onClose,
  name,
  muted,
  muteAvailable,
  muteBusy = false,
  onToggleMute,
  blocked,
  onBlockToggle,
  onViewProfile,
}: ChatActionsSheetProps) {
  const { colors } = useTheme();
  const afterCloseRef = useRef<(() => void) | null>(null);

  const closeThen = (fn: () => void) => {
    afterCloseRef.current = fn;
    onClose();
  };

  // A follow-up modal (block confirmation) opens only once this one is gone.
  const runAfterClose = () => {
    const next = afterCloseRef.current;
    afterCloseRef.current = null;
    next?.();
  };

  return (
    <SheetModal visible={visible} onClose={onClose} onClosed={runAfterClose}>
      <SheetSurface testID="chat-actions-sheet">
        <AppText
          variant="label"
          color="textSecondary"
          align="center"
          numberOfLines={1}
          style={styles.title}
          accessibilityRole="header"
        >
          {name}
        </AppText>

        <Pressable
          onPress={muteAvailable && !muteBusy ? onToggleMute : undefined}
          disabled={!muteAvailable || muteBusy}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgElevated }]}
          accessibilityRole="switch"
          accessibilityLabel="كتم المحادثة"
          accessibilityState={{ checked: muted, disabled: !muteAvailable || muteBusy }}
          testID="chat-action-mute"
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.bgField }]}>
            <AppIcon
              name={muted ? 'notifications-off-outline' : 'notifications-outline'}
              size={18}
              color={colors.textPrimary}
            />
          </View>
          <View style={styles.rowText}>
            <AppText variant="body" color={muteAvailable ? 'textPrimary' : 'textMuted'}>
              كتم المحادثة
            </AppText>
            <AppText variant="caption" color="textMuted" numberOfLines={2}>
              {!muteAvailable
                ? 'متاح بعد إرسال أول رسالة'
                : muted
                  ? 'لن تصلك إشعارات من هذه المحادثة'
                  : 'إيقاف إشعارات هذه المحادثة فقط'}
            </AppText>
          </View>
          {muteBusy ? (
            <ActivityIndicator size="small" color={colors.electricBright} />
          ) : (
            <Switch
              value={muted}
              onValueChange={onToggleMute}
              disabled={!muteAvailable}
              trackColor={{ false: colors.borderMid, true: colors.electricBright }}
              thumbColor={muted ? colors.onElectric : '#FFFFFF'}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          )}
        </Pressable>

        {onViewProfile ? (
          <Pressable
            onPress={() => closeThen(onViewProfile)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgElevated }]}
            accessibilityRole="button"
            accessibilityLabel="عرض الملف الشخصي"
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.bgField }]}>
              <AppIcon name="person-circle-outline" size={18} color={colors.textPrimary} />
            </View>
            <View style={styles.rowText}>
              <AppText variant="body" color="textPrimary">
                عرض الملف الشخصي
              </AppText>
            </View>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => closeThen(onBlockToggle)}
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgElevated }]}
          accessibilityRole="button"
          accessibilityLabel={blocked ? 'إلغاء حظر الحساب' : 'حظر الحساب'}
          testID="chat-action-block"
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.bgField }]}>
            <AppIcon name="block" size={18} color={colors.danger} />
          </View>
          <View style={styles.rowText}>
            <AppText variant="body" color="danger">
              {blocked ? 'إلغاء حظر الحساب' : 'حظر الحساب'}
            </AppText>
            {!blocked ? (
              <AppText variant="caption" color="textMuted" numberOfLines={2}>
                لن يتمكن من مراسلتك، وتبقى الرسائل السابقة محفوظة
              </AppText>
            ) : null}
          </View>
        </Pressable>
      </SheetSurface>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: space[24], paddingBottom: space[8] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    minHeight: 56,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
});

export default ChatActionsSheet;
