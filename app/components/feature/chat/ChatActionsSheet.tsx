/**
 * Chat header «المزيد» sheet — conversation actions (mute, block, profile).
 * RN Animated + Modal only (no new libraries), same motion as NewMessageSheet.
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { radius, space } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SHEET_OFFSET = 360;

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
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  const afterCloseRef = useRef<(() => void) | null>(null);

  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) setMounted(true);
  }

  useEffect(() => {
    if (!mounted) return;
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 240 : 180,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || visible) return;
      setMounted(false);
      // A follow-up modal (block confirmation) opens only once this one is gone.
      const next = afterCloseRef.current;
      afterCloseRef.current = null;
      next?.();
    });
  }, [mounted, progress, visible]);

  if (!mounted) return null;

  const closeThen = (fn: () => void) => {
    afterCloseRef.current = fn;
    onClose();
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SHEET_OFFSET, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        testID="chat-actions-sheet"
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, space[12]),
            backgroundColor: colors.bgElevated,
            borderColor: colors.borderSoft,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
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
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgSurface }]}
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
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgSurface }]}
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
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bgSurface }]}
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
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(16, 24, 32, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius[20],
    borderTopRightRadius: radius[20],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: space[8],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: space[8],
  },
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
