import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { AppText, SarhSettingsRow, SarhSettingsSection } from '@/design-system/components';
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
  footer?: string;
};

type SettingsMenuScreenProps = {
  title: string;
  items?: SettingsMenuItem[];
  sections?: SettingsMenuSection[];
  footerValue?: { label: string; value: string };
  /** Small centered line under the last group (e.g. app version). */
  footerNote?: string;
  onItemPress?: (item: SettingsMenuItem) => boolean;
};

/** Simple link menus (مركز المعلومات، السياسات): large title + inset-grouped rows. */
export function SettingsMenuScreen({
  title,
  items,
  sections,
  footerValue,
  footerNote,
  onItemPress,
}: SettingsMenuScreenProps) {
  const router = useRouter();

  const resolvedSections: SettingsMenuSection[] =
    sections ??
    (items?.length
      ? [
          {
            title: '',
            items,
          },
        ]
      : []);

  return (
    <SettingsScreen title={title} largeTitle>
      {resolvedSections.map((section, sectionIndex) => (
        <SarhSettingsSection
          key={`${section.title}-${sectionIndex}`}
          grouped
          title={section.title || undefined}
          footer={section.footer}
        >
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
        <SarhSettingsSection grouped>
          <SarhSettingsRow
            icon="information-circle-outline"
            title={footerValue.label}
            value={footerValue.value}
            showDivider={false}
            showChevron={false}
          />
        </SarhSettingsSection>
      ) : null}
      {footerNote ? (
        <AppText variant="caption" color="textMuted" align="center" style={{ paddingTop: 24 }}>
          {footerNote}
        </AppText>
      ) : null}
    </SettingsScreen>
  );
}

export default SettingsMenuScreen;
