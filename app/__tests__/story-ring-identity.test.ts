import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Story ring follows the black & white identity', () => {
  const bar = src('components/feature/StoriesBar.tsx');
  const profile = src('components/feature/ProfileScreenLayout.tsx');

  it('drops the purple/orange gradient everywhere a story ring is drawn', () => {
    for (const text of [bar, profile]) {
      expect(text).not.toContain('LinearGradient');
      expect(text).not.toContain('STORY_GRADIENT');
      expect(text).not.toMatch(/#F58529|#DD2A7B|#8134AF|#515BD4/i);
    }
  });

  it('unseen ring is the single theme accent (white Dark / black Light), seen is the hairline grey', () => {
    expect(bar).toContain('<View style={[styles.ring, styles.ringUnseen]}>');
    expect(bar).toMatch(/ringUnseen: \{\s*backgroundColor: colors\.electric,\s*\}/);
    expect(bar).toMatch(/ringSeen: \{\s*borderWidth: RING_BORDER,\s*borderColor: colors\.borderSoft,/);
    expect(profile).toMatch(/avatarRing: \{[^}]*backgroundColor: colors\.electric,/);
  });

  it('same ring for everyone: no subscriber / tier colours on story rings', () => {
    expect(bar).not.toMatch(/verifiedTier|gold|#C9A227|#1D9BF0/i);
  });

  it('keeps ring geometry and the add-story slot unchanged', () => {
    expect(bar).toContain('const DEFAULT_CIRCLE = 64;');
    expect(bar).toContain('const RING_BORDER = 2;');
    expect(bar).toContain('const INNER = CIRCLE - 8;');
    expect(bar).toContain("borderStyle: 'dashed',");
    expect(bar).toContain('<AppIcon name="add" size={13} color={colors.onElectric} />');
  });
});