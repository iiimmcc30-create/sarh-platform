import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

describe('listing «تواصل» button sits under the price', () => {
  const screen = src('app/listing/[id].tsx');

  it('no sticky bottom bar any more', () => {
    expect(screen).not.toContain('<BottomAction');
    expect(screen).not.toContain("bottomInset={isOwner ? 'none' : 'action'}");
  });

  it('primary pill inside the price section, visitors only, opens the contact sheet', () => {
    const price = screen.indexOf('<View style={styles.priceSection}>');
    const button = screen.indexOf('testID="listing-contact-button"');
    const owner = screen.indexOf('{isOwner ? (\n          <Row wrap gap="sm" style={styles.ownerToolsSection}>');
    expect(price).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(price);
    expect(owner).toBeGreaterThan(button);
    const block = screen.slice(screen.lastIndexOf('{!isOwner ? (', button), button);
    expect(block).toContain('title="تواصل"');
    expect(block).toContain('variant="primary"');
    expect(block).toContain('shape="pill"');
    expect(block).toContain('onPress={() => setContactSheetVisible(true)}');
  });
});

describe('no empty-comments copy', () => {
  const files = [
    'components/feature/ListingCommentsSection.tsx',
    'components/feature/ListingCommentsModal.tsx',
    'components/feature/PostCommentsSection.tsx',
  ];

  it.each(files)('%s renders nothing when there are no comments', (rel) => {
    const s = src(rel);
    expect(s).not.toContain('كن أول من يعلّق');
    expect(s).not.toContain('لا توجد تعليقات بعد');
    expect(s).not.toContain('styles.empty');
  });

  it('post replies list returns null when empty', () => {
    expect(src('components/feature/PostCommentsSection.tsx')).toContain(
      'if (comments.length === 0) return null;',
    );
  });
});
