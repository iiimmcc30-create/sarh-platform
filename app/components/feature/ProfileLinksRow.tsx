/**
 * X-style profile links under the bio: quiet link glyph (secondary colour) +
 * cleaned URL or label. Tap opens the browser, long press copies the URL.
 * Renders nothing when the profile has no links.
 */
import { Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { copyToClipboard } from '@/lib/clipboard';
import { showToast } from '@/lib/toast';
import {
  displayProfileLinkUrl,
  normalizeProfileLinkUrl,
  profileLinkText,
  type ProfileLink,
} from '@/lib/profileLinks';

export const PROFILE_LINK_ICON = 'link';
export const PROFILE_LINK_ICON_SIZE = 15;

export async function openProfileLink(url: string): Promise<void> {
  const safe = normalizeProfileLinkUrl(url);
  if (!safe) {
    void showToast('الرابط غير صالح', 'warning');
    return;
  }
  try {
    await Linking.openURL(safe);
  } catch {
    void showToast('تعذّر فتح الرابط', 'error');
  }
}

export function ProfileLinksRow({
  links,
  style,
}: {
  links?: ProfileLink[] | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  if (!links?.length) return null;
  return (
    <Row gap="md" align="center" justify="start" wrap style={style} testID="profile-links-row">
      {links.map((link, index) => (
        <Pressable
          key={`${link.url}-${index}`}
          onPress={() => void openProfileLink(link.url)}
          onLongPress={() => {
            copyToClipboard(link.url);
            void showToast('تم نسخ الرابط', 'success');
          }}
          hitSlop={6}
          accessibilityRole="link"
          accessibilityLabel={`فتح الرابط ${link.label?.trim() || displayProfileLinkUrl(link.url)}`}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
          testID={`profile-link-${index}`}
        >
          <Row gap="xs" align="center">
            <View style={styles.icon}>
              <AppIcon name={PROFILE_LINK_ICON} size={PROFILE_LINK_ICON_SIZE} color={colors.textSecondary} />
            </View>
            <AppText variant="caption" color="primary" numberOfLines={1} style={styles.text}>
              {profileLinkText(link)}
            </AppText>
          </Row>
        </Pressable>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  icon: { paddingTop: 1 },
  text: { fontWeight: '500', maxWidth: 220 },
  pressed: { opacity: 0.6 },
});
