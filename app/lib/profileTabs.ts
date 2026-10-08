export type ProfileTabKey = 'posts' | 'ads' | 'replies' | 'reposts' | 'likes';

export type ProfileTabDef = {
  key: ProfileTabKey;
  label: string;
  /** AppIcon name (same line set as the feed actions). */
  icon: string;
  /**
   * Selected look: `fill` = solid glyph (closed shapes: heart, tag, bubble);
   * `bold` = heavier stroke (open / lined shapes a fill would hide: document, repeat).
   */
  activeStyle: 'fill' | 'bold';
};

const SHARED_TABS: ProfileTabDef[] = [
  { key: 'posts', label: 'المنشورات', icon: 'document-text', activeStyle: 'bold' },
  { key: 'ads', label: 'الإعلانات', icon: 'pricetag', activeStyle: 'fill' },
  { key: 'replies', label: 'الردود', icon: 'chatbubble-ellipses-outline', activeStyle: 'fill' },
  { key: 'reposts', label: 'إعادة النشر', icon: 'repeat-2', activeStyle: 'bold' },
];

const LIKES_TAB: ProfileTabDef = { key: 'likes', label: 'الإعجابات', icon: 'heart', activeStyle: 'fill' };

export function getProfileTabs(isOwnProfile: boolean): ProfileTabDef[] {
  return isOwnProfile ? [...SHARED_TABS, LIKES_TAB] : SHARED_TABS;
}

/* -------------------------------------------------------------------------- */
/* Tab bar track: every frame is computed up front, never measured per frame. */
/* -------------------------------------------------------------------------- */

export type ProfileTabTrackInput = {
  /** Bar width (physical px). */
  rowWidth: number;
  /** Bold label width per tab (measured once off-flow; 0 until measured). */
  labelWidths: readonly number[];
  /** Physical right-to-left row (tab 0 on the right). */
  rtl: boolean;
  iconSize: number;
  /** Space between the icon and the label of the selected tab. */
  gap: number;
  /** Width of an idle (icon only) tab before the spare space is shared: >= 44pt touch. */
  baseWidth: number;
  /** Underline inset from each side of its tab. */
  inset: number;
};

/**
 * Where everything sits when tab `k` is selected, for every k. The bar animates
 * by interpolating the pager progress over these arrays (transform + opacity
 * only), so a tap or swipe never re-lays out the bar frame by frame.
 *
 * Model (same as the old flexGrow row): idle tab = baseWidth, selected tab =
 * baseWidth + gap + label; spare width is shared evenly. Selected tab: icon +
 * label centred as a group (icon at the inline start); idle: icon centred.
 */
export type ProfileTabTrack = {
  inputRange: number[];
  /** [k][i] slot width of tab i while tab k is selected (touch targets). */
  widthsAt: number[][];
  /** [i][k] physical left of tab i's icon while tab k is selected. */
  iconX: number[][];
  /** [i][k] physical left of tab i's label while tab k is selected. */
  labelX: number[][];
  /** [k] underline physical centre / width under the selected tab's content. */
  indicatorCenter: number[];
  indicatorWidth: number[];
  /** Width of the scrolling track. Wider than the viewport when tabs overflow. */
  contentWidth: number;
};

function naturalSlotWidths(k: number, input: ProfileTabTrackInput, count: number): number[] {
  return Array.from({ length: count }, (_, i) =>
    input.baseWidth + (i === k ? input.gap + Math.max(0, input.labelWidths[i] ?? 0) : 0),
  );
}

/**
 * When the natural row fits, spare width is shared (tabs fill the screen).
 * When it does not, slots stay at their natural width so the bar can scroll
 * instead of shrinking the touch targets.
 */
function slotWidths(
  k: number,
  input: ProfileTabTrackInput,
  count: number,
  layoutWidth: number,
  fill: boolean,
): number[] {
  const natural = naturalSlotWidths(k, input, count);
  const total = natural.reduce((sum, w) => sum + w, 0);
  if (!fill || total > layoutWidth) return natural;
  const extra = (layoutWidth - total) / count;
  return natural.map((w) => w + extra);
}

export function profileTabTrack(count: number, input: ProfileTabTrackInput): ProfileTabTrack | null {
  if (count <= 0 || !(input.rowWidth > 0)) return null;
  const inputRange: number[] = [];
  const widthsAt: number[][] = [];
  const iconX: number[][] = Array.from({ length: count }, () => []);
  const labelX: number[][] = Array.from({ length: count }, () => []);
  const indicatorCenter: number[] = [];
  const indicatorWidth: number[] = [];
  let widest = 0;
  for (let k = 0; k < count; k += 1) {
    const total = naturalSlotWidths(k, input, count).reduce((sum, w) => sum + w, 0);
    if (total > widest) widest = total;
  }
  const fill = widest <= input.rowWidth;
  const contentWidth = fill ? input.rowWidth : widest;
  const { rtl, iconSize, gap } = input;

  for (let k = 0; k < count; k += 1) {
    const widths = slotWidths(k, input, count, contentWidth, fill);
    widthsAt.push(widths);
    inputRange.push(k);
    let start = 0;
    for (let i = 0; i < count; i += 1) {
      const w = widths[i];
      const x = rtl ? contentWidth - start - w : start;
      start += w;
      const center = x + w / 2;
      const label = Math.max(0, input.labelWidths[i] ?? 0);
      let icon: number;
      if (i === k) {
        const group = iconSize + gap + label;
        icon = rtl ? center + group / 2 - iconSize : center - group / 2;
        indicatorCenter.push(center);
        // Hairline under the icon + label only, never the spare slot width.
        indicatorWidth.push(iconSize + (label > 0 ? gap + label : 0));
      } else {
        icon = center - iconSize / 2;
      }
      iconX[i].push(icon);
      labelX[i].push(rtl ? icon - gap - label : icon + iconSize + gap);
    }
  }

  if (count === 1) {
    inputRange.push(1);
    iconX[0].push(iconX[0][0]);
    labelX[0].push(labelX[0][0]);
    indicatorCenter.push(indicatorCenter[0]);
    indicatorWidth.push(indicatorWidth[0]);
  }
  return { inputRange, widthsAt, iconX, labelX, indicatorCenter, indicatorWidth, contentWidth };
}

/** Label / selected-glyph visibility of tab `i` against the progress (crisp crossfade). */
export function profileTabRevealRange(i: number): { inputRange: number[]; outputRange: number[] } {
  return { inputRange: [i - 0.5, i, i + 0.5], outputRange: [0, 1, 0] };
}
