import { isAppRtl } from '@/lib/rtl';
import type { ViewStyle } from 'react-native';

/** Physical right-swipe reveal. Gesture uses dx, not row-reverse. */
export const CONVERSATION_SWIPE_MAX = 72;
export const CONVERSATION_SWIPE_THRESHOLD = 56;
export const CONVERSATION_SWIPE_AXIS = 8;

export const CONVERSATION_MENU_WIDTH = 220;
export const CONVERSATION_MENU_ROW_H = 48;

export type ConversationAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function clampConversationSwipe(dx: number): number {
  if (dx <= 0) return 0;
  return Math.min(CONVERSATION_SWIPE_MAX, dx);
}

export function shouldRevealConversationDelete(offset: number): boolean {
  return offset >= CONVERSATION_SWIPE_THRESHOLD;
}

export function shouldCaptureConversationSwipe(dx: number, dy: number): boolean {
  return dx > CONVERSATION_SWIPE_AXIS && dx > Math.abs(dy);
}

/**
 * Trash sits on the physical left so a +translateX swipe reveals it.
 * Under I18nManager.swapLeftAndRightInRTL, `right` maps to physical left.
 */
export function conversationDeleteStripAnchor(): ViewStyle {
  return isAppRtl() ? { right: 0 } : { left: 0 };
}

export function conversationMenuSize(itemCount: number) {
  return {
    width: CONVERSATION_MENU_WIDTH,
    height: Math.max(1, itemCount) * CONVERSATION_MENU_ROW_H,
  };
}

export function placeConversationMenu(
  anchor: ConversationAnchor,
  window: { width: number; height: number },
  insets: { top: number; bottom: number },
  menu: { width: number; height: number },
): { top: number; left: number } {
  const gap = 8;
  const minX = 8;
  const maxX = Math.max(minX, window.width - menu.width - 8);
  const minY = insets.top + 8;
  const maxY = Math.max(minY, window.height - insets.bottom - menu.height - 8);

  const below = anchor.y + anchor.height + gap;
  const above = anchor.y - menu.height - gap;
  const fitsBelow = below <= maxY;
  const top = Math.min(maxY, Math.max(minY, fitsBelow ? below : above));

  const startAligned = anchor.x + anchor.width - menu.width;
  const left = Math.min(maxX, Math.max(minX, startAligned));
  return { top, left };
}
