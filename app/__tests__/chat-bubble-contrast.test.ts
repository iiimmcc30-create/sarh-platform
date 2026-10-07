import { readFileSync } from 'fs';
import path from 'path';
import {
  CHAT_BACKGROUND,
  CHAT_BACKGROUND_DARK,
  chatBubbleColors,
  chatBubbleColorsDark,
  compositeOver,
  contrastRatio,
  getChatBubbleColors,
} from '@/lib/chatBubbleTheme';
import { sarh } from '@/constants/sarhTokens';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe('chat bubble palette (DS tokens, WCAG AA)', () => {
  it('uses a pure white thread background in Light Mode', () => {
    expect(CHAT_BACKGROUND).toBe('#FFFFFF');
    expect(chatBubbleColors.background).toBe('#FFFFFF');
    expect(getChatBubbleColors('light')).toBe(chatBubbleColors);
  });

  it('derives every colour from Sarh tokens', () => {
    expect(chatBubbleColors.sentBg).toBe(compositeOver(sarh.color.lightActionMuted, '#FFFFFF'));
    expect(chatBubbleColors.sentText).toBe(sarh.color.lightText);
    expect(chatBubbleColors.receivedBg).toBe(sarh.color.lightField);
    expect(chatBubbleColors.receivedText).toBe(sarh.color.lightText);
    expect(chatBubbleColors.accent).toBe(sarh.color.lightActionPressed);
  });

  it('keeps Light Mode sent-bubble controls identical to the shared accent', () => {
    expect(chatBubbleColors.sentBg).toBe('#DCDCDC');
    expect(chatBubbleColors.sentAccent).toBe(chatBubbleColors.accent);
    expect(chatBubbleColors.sentOnAccent).toBe(chatBubbleColors.onAccent);
    expect(chatBubbleColors.sentTrack).toBe(chatBubbleColors.track);
  });

  it('meets AA for message text and timestamps in both bubbles', () => {
    const c = chatBubbleColors;
    expect(contrastRatio(c.sentText, c.sentBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.receivedText, c.receivedBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.sentMeta, c.sentBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.receivedMeta, c.receivedBg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('meets AA non-text contrast for ticks and the voice play control', () => {
    const c = chatBubbleColors;
    expect(contrastRatio(c.sentTickRead, c.sentBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(c.onAccent, c.accent)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('documents why solid brand + white text is not used (fails AA)', () => {
    expect(contrastRatio('#FFFFFF', sarh.color.action)).toBeLessThan(AA_TEXT);
  });

  it('keeps RTL-correct alignment with logical corners and no gradients', () => {
    const chat = readFileSync(path.join(__dirname, '..', 'app', 'chat.tsx'), 'utf8');
    // Sent at inline start (right in Arabic), received at inline end.
    expect(chat).toContain("bubbleWrapMe: { justifyContent: 'flex-start' }");
    expect(chat).toContain("bubbleWrapThem: { justifyContent: 'flex-end' }");
    expect(chat).toContain('borderBottomStartRadius: 6');
    expect(chat).toContain('borderBottomEndRadius: 6');
    expect(chat).not.toContain('row-reverse');
    expect(chat).not.toContain('LinearGradient');
    expect(chat).not.toMatch(/shadowOpacity:\s*0\.[3-9]/);
  });
});

describe('chat thread in Dark Mode (black background)', () => {
  const d = chatBubbleColorsDark;

  it('paints the thread with the brand black #020202', () => {
    expect(CHAT_BACKGROUND_DARK).toBe('#020202');
    expect(CHAT_BACKGROUND_DARK).toBe(sarh.color.bg);
    expect(d.background).toBe('#020202');
    expect(getChatBubbleColors('dark')).toBe(chatBubbleColorsDark);
  });

  it('uses dark DS tokens: lifted received bubble, white primary sent bubble', () => {
    expect(d.receivedBg).toBe(sarh.color.surfaceAlt);
    expect(d.receivedText).toBe(sarh.color.text);
    expect(d.sentBg).toBe(sarh.color.primaryActionButton);
    expect(d.sentText).toBe(sarh.color.primaryActionText);
    // Bubbles stay distinguishable from the thread and from each other.
    expect(d.receivedBg).not.toBe(d.background);
    expect(d.sentBg).not.toBe(d.receivedBg);
  });

  it('meets AA for text and timestamps on both dark-mode bubbles and the date pill', () => {
    expect(contrastRatio(d.sentText, d.sentBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(d.receivedText, d.receivedBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(d.sentMeta, d.sentBg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(d.receivedMeta, d.receivedBg)).toBeGreaterThanOrEqual(AA_TEXT);
    // Thread-level controls (loading spinner, «إلغاء الحظر») read on black.
    expect(contrastRatio(d.accent, d.background)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('keeps ticks and voice controls visible inside each bubble', () => {
    expect(contrastRatio(d.sentTickRead, d.sentBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.sentAccent, d.sentBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.sentOnAccent, d.sentAccent)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.accent, d.receivedBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.onAccent, d.accent)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.danger, d.receivedBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrastRatio(d.danger, d.sentBg)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('chat screen and voice bubble read the scheme palette (no hard-coded white pane)', () => {
    const chat = readFileSync(path.join(__dirname, '..', 'app', 'chat.tsx'), 'utf8');
    const voice = readFileSync(
      path.join(__dirname, '..', 'components', 'feature', 'chat', 'VoiceMessageBubble.tsx'),
      'utf8',
    );
    expect(chat).toContain('const palette = getChatBubbleColors(scheme);');
    expect(chat).toContain('createStyles(colors, getChatBubbleColors(scheme))');
    expect(chat).toContain('createMessageStyles(colors, getChatBubbleColors(scheme))');
    expect(chat).toContain('backgroundColor: palette.background');
    expect(chat).toContain('palette={palette}');
    expect(chat).not.toContain('CHAT_BACKGROUND');
    expect(chat).not.toContain('chatBubbleColors');
    expect(voice).toContain('isMe ? palette.sentAccent : palette.accent');
  });
});
