import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

/** User-visible Arabic in a file, ignoring code comments. */
function visibleArabic(rel: string): string {
  return src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('notifications are named التنبيهات in user-facing copy', () => {
  const surfaces = [
    'app/notifications/index.tsx',
    'app/settings/notifications.tsx',
    'components/notifications/NotificationBellButton.tsx',
    'components/feature/chat/ChatActionsSheet.tsx',
    'lib/settingsRows.ts',
    'services/userSettings.ts',
  ];

  it('does not show الإشعارات or إشعار on those surfaces', () => {
    for (const file of surfaces) {
      expect(visibleArabic(file)).not.toMatch(/الإشعارات|إشعار/);
    }
  });

  it('names the inbox, the bell, and push settings التنبيهات', () => {
    const inbox = src('app/notifications/index.tsx');
    expect(inbox).toContain("const PAGE_TITLE = 'التنبيهات'");
    expect(inbox).toContain('لا توجد تنبيهات');
    expect(inbox).toContain('تعذّر تحميل التنبيهات');
    expect(inbox).toContain('<WebDocumentMeta title={PAGE_TITLE}');
    expect(src('app/_layout.tsx')).toContain("options={{ title: 'التنبيهات' }}");
    expect(src('components/notifications/NotificationBellButton.tsx')).toContain(
      'accessibilityLabel="التنبيهات"',
    );
    const settings = src('app/settings/notifications.tsx');
    expect(settings).toContain("const PAGE_TITLE = 'التنبيهات'");
    expect(settings).toContain('السماح بالتنبيهات');
    expect(settings).toContain('التنبيهات الفورية');
    expect(settings).toContain('تبقى التنبيهات داخل التطبيق');
    expect(src('lib/notifications.ts')).toContain("name: 'تنبيهات سرح'");
  });

  it('keeps routes and identifiers', () => {
    expect(src('app/notifications/index.tsx')).toContain('useRouter');
    expect(src('components/notifications/NotificationBellButton.tsx')).toContain("router.push('/notifications')");
    expect(src('lib/settingsRows.ts')).toContain("route: '/settings/notifications'");
    expect(src('lib/settingsRows.ts')).toContain("key: 'notifications'");
  });
});
