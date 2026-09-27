import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SidebarBookmarks } from '@/components/feature/SidebarBookmarks';
import { Screen, ScreenBody } from '@/design-system/layout';

/**
 * "العلامات المرجعية" as a standalone screen (Home quick access "المحفوظات").
 * Renders the same SidebarBookmarks section used in the sidebar; items open
 * with a normal push here since there is no sidebar to close first.
 */
export default function BookmarksScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title="العلامات المرجعية" showBack />
      <ScreenBody>
        <SidebarBookmarks presentation="screen" />
      </ScreenBody>
    </Screen>
  );
}