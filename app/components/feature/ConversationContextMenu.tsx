import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { elevation, radius, space } from '@/design-system';
import { useTheme } from '@/hooks/useTheme';
import {
  conversationMenuSize,
  placeConversationMenu,
  type ConversationAnchor,
} from '@/lib/conversationActions';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type ConversationMenuTarget = {
  id: string;
  isPinned: boolean;
  anchor: ConversationAnchor;
};

type ConversationContextMenuProps = {
  target: ConversationMenuTarget | null;
  onClose: () => void;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
};

export function ConversationContextMenu({
  target,
  onClose,
  onPin,
  onDelete,
}: ConversationContextMenuProps) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const menu = useMemo(() => conversationMenuSize(2), []);
  const pos = useMemo(() => {
    if (!target) return { top: 0, left: 0 };
    return placeConversationMenu(target.anchor, window, insets, menu);
  }, [insets, menu, target, window]);

  if (!target) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="إغلاق"
      />
      <View pointerEvents="box-none" style={styles.physicalLayer}>
      <View
        style={[
          styles.menu,
          {
            top: pos.top,
            left: pos.left,
            width: menu.width,
            backgroundColor: colors.bgElevated,
            borderColor: colors.borderSoft,
          },
        ]}
        accessibilityViewIsModal
      >
        <Pressable
          onPress={() => {
            onPin(target.id, !target.isPinned);
            onClose();
          }}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel={
            target.isPinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'
          }
        >
          <Row gap="md" align="center">
            <AppIcon name="pin" size={18} color={colors.textPrimary} />
            <AppText variant="label">
              {target.isPinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
            </AppText>
          </Row>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.borderSoft }]} />
        <Pressable
          onPress={() => onDelete(target.id)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          accessibilityRole="button"
          accessibilityLabel="حذف المحادثة"
        >
          <Row gap="md" align="center">
            <AppIcon name="trash" size={18} color={colors.danger} />
            <AppText variant="label" color="danger">
              حذف المحادثة
            </AppText>
          </Row>
        </Pressable>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  physicalLayer: {
    ...StyleSheet.absoluteFillObject,
    direction: 'ltr',
  },
  menu: {
    position: 'absolute',
    borderRadius: radius[12],
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    ...elevation.overlay,
  },
  row: {
    minHeight: 48,
    paddingHorizontal: space[16],
    justifyContent: 'center',
  },
  rowPressed: {
    opacity: 0.88,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});
