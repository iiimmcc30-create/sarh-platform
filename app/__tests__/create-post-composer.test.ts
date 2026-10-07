import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const create = readFileSync(path.join(root, 'app/create/post.tsx'), 'utf8');

describe('create post composer (X-style)', () => {
  it('is the screen every compose entry point opens', () => {
    const fab = readFileSync(path.join(root, 'components/feature/CreatePostFab.tsx'), 'utf8');
    const layout = readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
    expect(fab).toContain("router.push('/create/post')");
    expect(layout).toContain('<Stack.Screen name="create/post"');
  });

  it('has a close X at the start and a pill post button at the end of the header', () => {
    const header = create.slice(create.indexOf('styles.header'), create.indexOf('<ScrollView'));
    const close = header.indexOf('accessibilityLabel="إغلاق"');
    const post = header.indexOf('testID="create-post-submit"');
    expect(close).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(close);
    expect(create).toContain("borderRadius: radius.pill");
    expect(create).toContain("{isEditing ? 'حفظ' : 'نشر'}");
    expect(create).toContain('postBtnDisabled: { opacity: 0.45 }');
    expect(create).toContain('<ActivityIndicator size="small" color={colors.onElectric} />');
  });

  it('enables posting with text or media and blocks double submit', () => {
    expect(create).toContain('text.length > 0 || draftMedia.length > 0');
    expect(create).toContain('const canPost = hasContent && remaining >= 0 && !submitting;');
    expect(create).toContain('if (!canPost || !accessToken || submittingRef.current) return;');
    expect(create).toContain('disabled={!canPost}');
  });

  it('shows the avatar with the ماذا يحدث؟ field, autofocused', () => {
    const row = create.slice(create.indexOf('styles.composeRow'));
    expect(row.indexOf('styles.avatar')).toBeLessThan(row.indexOf('<TextInput'));
    expect(create).toContain('placeholder="ماذا يحدث؟"');
    expect(create).toContain('autoFocus');
    expect(create).toContain('borderRadius: AVATAR_SIZE / 2');
  });

  it('keeps the gallery/camera toolbar above the keyboard with a hairline divider', () => {
    expect(create).toContain('<ComposerKeyboardView>');
    expect(create).toContain('useComposerKeyboardPad');
    expect(create).toContain('borderTopWidth: StyleSheet.hairlineWidth');
    expect(create).toContain('name="image-outline"');
    expect(create).toContain('name="camera-outline"');
    expect(create).toContain('launchCameraAsync');
    expect(create).toContain('requestCameraPermissionsAsync');
    expect(create).toContain('selectionLimit: mediaSlots');
  });

  it('keeps the existing upload pipeline and avoids gradients', () => {
    expect(create).toContain("uploadMediaFromUri(");
    expect(create).toContain('media: uploaded');
    expect(create).toContain('await addPost(payload)');
    expect(create).toContain('await updatePost(editId, payload)');
    expect(create).not.toContain('LinearGradient');
    expect(create).not.toContain('shadowOpacity');
  });
});
