import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
import { Screen, ScreenBody } from '@/design-system/layout';
import { safePush } from '@/lib/safeNavigate';
import { useRouter } from 'expo-router';

export type SettingsMenuItem = {
  icon: string;
  label: string;
  route: string;
  value?: string;
};

export type SettingsMenuSection = {
  title: string;
  items: SettingsMenuItem[];
};

type SettingsMenuScreenProps = {
  title: string;
  items?: SettingsMenuItem[];
  sections?: SettingsMenuSection[];
  footerValue?: { label: string; value: string };
  onItemPress?: (item: SettingsMenuItem) => boolean;
};

export function SettingsMenuScreen({
  title,
  items,
  sections,
  footerValue,
  onItemPress,
}: SettingsMenuScreenProps) {
  const router = useRouter();

  const resolvedSections =
    sections ??
    (items?.length
      ? [
          {
            title: title,
            items,
          },
        ]
      : []);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader variant="screen" title={title} showBack />
      {/* Rows are full-width tap targets, so the row pattern owns its own inset. */}
      <ScreenBody gutter={false} padBottom="xxxl">
        {resolvedSections.map((section) => (
          <SarhSettingsSection key={section.title} title={section.title}>
            {section.items.map((item, index) => (
              <SarhSettingsRow
                key={`${item.route}-${index}`}
                icon={item.icon}
                title={item.label}
                value={item.value}
                showDivider={index < section.items.length - 1}
                onPress={() => {
                  if (onItemPress?.(item)) return;
                  safePush(item.route, undefined, router);
                }}
              />
            ))}
          </SarhSettingsSection>
        ))}
        {footerValue ? (
          <SarhSettingsSection title={footerValue.label}>
            <SarhSettingsRow
              title={footerValue.label}
              value={footerValue.value}
              showDivider={false}
              showChevron={false}
            />
          </SarhSettingsSection>
        ) : null}
      </ScreenBody>
    </Screen>
  );
}

export default SettingsMenuScreen;
