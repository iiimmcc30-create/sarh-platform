import { readFileSync } from 'fs';
import path from 'path';
import {
  CHAT_BACKGROUND,
  chatBubbleColors,
  compositeOver,
  contrastRatio,
} from '@/lib/chatBubbleTheme';
import { sarh } from '@/constants/sarhTokens';

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe('chat bubble palette (DS tokens, WCAG AA)', () => {
  it('uses a pure white thread background', () => {
    expect(CHAT_BACKGROUND).toBe('#FFFFFF');
    expect(chatBubbleColors.background).toBe('#FFFFFF');
  });

  it('derives every colour from Sarh tokens', () => {
    expect(chatBubbleColors.sentBg).toBe(compositeOver(sarh.color.actionMuted, '#FFFFFF'));
    expect(chatBubbleColors.sentText).toBe(sarh.color.lightText);
    expect(chatBubbleColors.receivedBg).toBe(sarh.color.lightField);
    expect(chatBubbleColors.receivedText).toBe(sarh.color.lightText);
    expect(chatBubbleColors.accent).toBe(sarh.color.actionPressed);
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
