/**
 * Chat thread palette — built from existing Sarh DS tokens only.
 *
 * Light Mode (unchanged): the thread background is #FFFFFF. The sent bubble
 * uses the Light brand tint (`lightActionMuted`, the brand black #020202 at
 * 14%) — a neutral grey on white — with the DS ink colour; controls use the
 * Light pressed primary (black family, black & white identity). Received
 * bubbles use the DS light field neutral.
 *
 * Dark Mode: the thread background is the brand black (#020202, `sarh.color.bg`).
 * Received bubbles are a lifted X-style dark surface (`surfaceAlt`) with the
 * dark primary text; sent bubbles reuse the dark primary CTA treatment
 * (white fill `primaryActionButton`, black `primaryActionText`) — the Sarh
 * black & white identity, no gradients, no glow.
 *
 * Ratios are asserted in __tests__/chat-bubble-contrast.test.ts.
 */
import { sarh } from '@/constants/sarhTokens';

export const CHAT_BACKGROUND = '#FFFFFF';
/** Dark Mode thread background — the app-icon / dark page black. */
export const CHAT_BACKGROUND_DARK = sarh.color.bg;

type Rgb = { r: number; g: number; b: number };

export function parseColor(input: string): Rgb & { a: number } {
  const value = input.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    value,
  );
  if (rgba) {
    return {
      r: Number(rgba[1]),
      g: Number(rgba[2]),
      b: Number(rgba[3]),
      a: rgba[4] === undefined ? 1 : Number(rgba[4]),
    };
  }
  throw new Error(`Unsupported colour: ${input}`);
}

function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/** Flatten a (possibly translucent) colour over an opaque background. */
export function compositeOver(fg: string, bg: string): string {
  const f = parseColor(fg);
  const b = parseColor(bg);
  return toHex({
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
  });
}

export function relativeLuminance(color: string): number {
  const { r, g, b } = parseColor(color);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Same hue with alpha, e.g. DS ink at 68% for secondary meta text. */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = parseColor(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SENT_BG = compositeOver(sarh.color.lightActionMuted, CHAT_BACKGROUND);
const RECEIVED_BG = sarh.color.lightField;
/** DS lightTextSecondary (#65727D) is ~4.4:1 on the bubbles; ink @68% keeps AA. */
const META_INK = withAlpha(sarh.color.lightText, 0.68);

/** Light Mode palette — values unchanged since the black & white identity pass. */
export const chatBubbleColors = {
  background: CHAT_BACKGROUND,
  sentBg: SENT_BG,
  sentText: sarh.color.lightText,
  sentMeta: compositeOver(META_INK, SENT_BG),
  sentTickRead: sarh.color.lightActionPressed,
  /** Controls inside sent bubbles (voice play button, progress, upload spinner). */
  sentAccent: sarh.color.lightActionPressed,
  sentOnAccent: sarh.color.fab,
  sentTrack: sarh.color.lightBorder,
  receivedBg: RECEIVED_BG,
  receivedText: sarh.color.lightText,
  receivedMeta: compositeOver(META_INK, RECEIVED_BG),
  /** Controls inside received bubbles / on the thread background. */
  accent: sarh.color.lightActionPressed,
  onAccent: sarh.color.fab,
  track: sarh.color.lightBorder,
  danger: sarh.color.danger,
  /**
   * Composer send / mic, media-preview send and offer «قبول»: the Light primary
   * (brand black, white icon). Disabled keeps the same look in Light (unchanged).
   */
  actionBg: sarh.color.lightAction,
  actionFg: sarh.color.fab,
  actionDisabledBg: sarh.color.lightAction,
  actionDisabledFg: sarh.color.fab,
  /** Offer card amount. */
  offerAmount: sarh.color.lightAction,
} as const;

export type ChatBubbleColors = { readonly [K in keyof typeof chatBubbleColors]: string };

const DARK_SENT_BG = sarh.color.primaryActionButton;
const DARK_RECEIVED_BG = sarh.color.surfaceAlt;
/** Dark ink at 68%: AA on the lifted surface (dark textSecondary is ~3.6:1 there). */
const DARK_META_INK = withAlpha(sarh.color.text, 0.68);
const DARK_SENT_META_INK = withAlpha(sarh.color.primaryActionText, 0.68);

/** Dark Mode palette — black thread, lifted received, white sent bubble. */
export const chatBubbleColorsDark: ChatBubbleColors = {
  background: CHAT_BACKGROUND_DARK,
  sentBg: DARK_SENT_BG,
  sentText: sarh.color.primaryActionText,
  sentMeta: compositeOver(DARK_SENT_META_INK, DARK_SENT_BG),
  sentTickRead: sarh.color.primaryActionText,
  sentAccent: sarh.color.primaryActionText,
  sentOnAccent: sarh.color.primaryActionButton,
  sentTrack: sarh.color.lightBorder,
  receivedBg: DARK_RECEIVED_BG,
  receivedText: sarh.color.text,
  receivedMeta: compositeOver(DARK_META_INK, DARK_RECEIVED_BG),
  accent: sarh.color.fab,
  onAccent: sarh.color.fabIcon,
  track: sarh.color.borderStrong,
  danger: sarh.color.danger,
  /** Dark primary CTA: white control, black icon/label (matches the white sent bubble). */
  actionBg: sarh.color.primaryActionButton,
  actionFg: sarh.color.primaryActionText,
  /** DS dark disabled: low-contrast fill, never a loud light grey. */
  actionDisabledBg: sarh.color.darkDisabledFill,
  actionDisabledFg: sarh.color.darkDisabledText,
  offerAmount: sarh.color.primaryActionButton,
};

/** Palette for the active scheme (Light keeps the exact previous values). */
export function getChatBubbleColors(scheme: 'light' | 'dark'): ChatBubbleColors {
  return scheme === 'dark' ? chatBubbleColorsDark : chatBubbleColors;
}
