import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/design-system/components';
import { GAP, type GapToken } from './metrics';
import { Row } from './Row';
import { Stack } from './Stack';

export type SectionProps = {
  children?: ReactNode;
  title?: string;
  /** Short supporting line. Only when the title alone is not enough. */
  caption?: string;
  /** Trailing control, e.g. a "عرض الكل" button. */
  action?: ReactNode;
  /** Rhythm between the section header and its content. */
  gap?: GapToken;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A titled content block — composition only.
 *
 * A Section is never a card: no background, no radius, no border, no shadow.
 * If a block genuinely needs chrome, wrap its children in `SarhCard` with an
 * explicit `level`; do not put the Section itself in a container.
 *
 * A Section owns no outer spacing. Separation between sections belongs to the
 * parent — `<Stack gap="section">` or `<ScreenBody gap="section">` — so that
 * exactly one component owns each gap.
 */
export function Section({
  children,
  title,
  caption,
  action,
  gap = 'sm',
  style,
  testID,
}: SectionProps) {
  const hasHeader = Boolean(title || caption || action);

  return (
    <View testID={testID} style={[{ gap: GAP[gap] }, style]}>
      {hasHeader ? (
        <Row gap="sm" align="center" justify={action ? 'between' : undefined}>
          <Stack gap="none" style={{ flex: 1, minWidth: 0 }}>
            {title ? (
              <AppText variant="sectionTitle" color="textPrimary" numberOfLines={1}>
                {title}
              </AppText>
            ) : null}
            {caption ? (
              <AppText variant="caption" color="textMuted">
                {caption}
              </AppText>
            ) : null}
          </Stack>
          {action}
        </Row>
      ) : null}
      {children}
    </View>
  );
}

export default Section;
