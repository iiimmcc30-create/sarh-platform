import { readFileSync } from 'fs';
import path from 'path';
import { councilHandle } from '@/services/councils';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('councils UI polish', () => {
  it('renders handles as "@user" in RTL (LRM + LTR writing direction)', () => {
    expect(councilHandle('faisal_gh')).toBe('\u200E@faisal_gh');
    for (const f of ['components/councils/CouncilRequestsSheet.tsx', 'components/councils/CouncilInviteSheet.tsx']) {
      const code = src(f);
      expect(code).toContain('councilHandle(');
      expect(code).not.toMatch(/>\s*@\{/);
      expect(code).toMatch(/handle: \{ writingDirection: 'ltr', alignSelf: 'flex-start' \}/);
    }
    expect(src('app/councils/[id].tsx')).toContain('message: councilHandle(target.user.username)');
  });

  it('keeps the speaker avatar stack inside its own box (symmetric overlap, gap to label)', () => {
    const card = src('components/councils/CouncilCard.tsx');
    expect(card).not.toContain('marginStart: -');
    expect(card).toContain('marginHorizontal: -AVATAR_OVERLAP / 2');
    expect(card).toContain('paddingHorizontal: AVATAR_OVERLAP / 2');
    expect(card).toContain('marginEnd: spacing.xs');
  });

  it('create form: readable disabled add pill, carded toggle rows, explicit switch thumb on web', () => {
    const form = src('app/councils/create.tsx');
    const add = form.slice(form.indexOf('title="إضافة"') - 80, form.indexOf('testID="council-add-rule"'));
    expect(add).not.toContain("variant=\"secondary\"");
    const toggle = form.slice(form.indexOf('toggleRow: {'), form.indexOf('},', form.indexOf('toggleRow: {')));
    expect(toggle).toContain('borderColor: colors.borderSoft');
    expect(form).toContain("Platform.OS === 'web' ? ({ activeThumbColor: onThumb }");
    expect(form).toContain('{...webActiveThumbProps(colors.onElectric)}');
    expect(form).toContain("thumbColor={mods[t.key] ? colors.onElectric : '#fff'}");
  });

  it('room: 4 × 3 grid stays, stage block fills and centres the free height', () => {
    const room = src('app/councils/[id].tsx');
    expect(room).toContain('<SpeakerGrid');
    expect(room).toContain('contentContainerStyle={styles.bodyContent}');
    expect(room).toMatch(/bodyContent: \{ flexGrow: 1 \}/);
    expect(room).toMatch(/stage: \{ flexGrow: 1, justifyContent: 'center'/);
    expect(room).toContain('styles.listenersPill');
    expect(src('components/councils/SpeakerSeat.tsx')).toContain('const AVATAR = 64;');
    expect(src('services/councils.ts')).toContain('export const COUNCIL_GRID_COLUMNS = 4;');
  });
});
