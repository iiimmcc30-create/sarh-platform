import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, SarhAvatar } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useTheme } from '@/hooks/useTheme';
import { resolveMediaUrl } from '@/services/media';
import type { CouncilParticipant } from '@/services/councils';
import { CouncilSheet } from './CouncilSheet';

import {
  COUNCIL_PEOPLE_TABS as TABS,
  filterCouncilPeople,
  type CouncilPeopleTab,
} from '@/lib/councilPeople';

function roleLabel(p: CouncilParticipant): string {
  if (p.role === 'OWNER') return 'المضيف';
  if (p.role === 'MODERATOR') return 'مشرف';
  if (p.onStage) return 'متحدث';
  return 'مستمع';
}

function displayName(p: CouncilParticipant): string {
  const u = p.user as { arabicName?: string | null; displayName?: string | null; username?: string | null };
  return u.arabicName || u.displayName || u.username || 'مستخدم';
}

type Props = {
  visible: boolean;
  people: readonly CouncilParticipant[];
  total?: number;
  onPress: (p: CouncilParticipant) => void;
  onClose: () => void;
};

/** Everyone in the council, grouped by tabs: all · host · speakers · listeners. */
export function CouncilPeopleSheet({ visible, people, total, onPress, onClose }: Props) {
  const { colors } = useTheme();
  const [tab, setTab] = useState<CouncilPeopleTab>('all');
  const rows = useMemo(() => filterCouncilPeople(people, tab), [people, tab]);
  const counts = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.key, filterCouncilPeople(people, t.key).length])),
    [people],
  ) as Record<CouncilPeopleTab, number>;

  return (
    <CouncilSheet
      visible={visible}
      title="الحضور"
      subtitle={`${total ?? people.length} في المجلس`}
      onClose={onClose}
    >
      <Row gap="xs" align="center" style={styles.tabs} testID="council-people-tabs">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`council-people-tab-${t.key}`}
              style={[
                styles.tab,
                active
                  ? { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }
                  : { borderColor: colors.borderSoft },
              ]}
            >
              <AppText
                variant="caption"
                style={{ color: active ? colors.screenRoot : colors.textPrimary, fontWeight: '700' }}
              >
                {t.label} {counts[t.key]}
              </AppText>
            </Pressable>
          );
        })}
      </Row>
      {rows.length === 0 ? (
        <AppText variant="bodySmall" color="textMuted" align="center" style={styles.empty}>
          لا يوجد أحد هنا الآن
        </AppText>
      ) : (
        rows.map((p) => (
          <Pressable
            key={p.userId}
            onPress={() => onPress(p)}
            accessibilityRole="button"
            style={styles.row}
          >
            <Row gap="md" align="center">
              <SarhAvatar
                uri={p.user.avatar ? resolveMediaUrl(p.user.avatar) : null}
                name={displayName(p)}
                size="md"
              />
              <View style={{ flex: 1 }}>
                <AppText variant="label" color="textPrimary" numberOfLines={1}>
                  {displayName(p)}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {roleLabel(p)}
                </AppText>
              </View>
            </Row>
          </Pressable>
        ))
      )}
    </CouncilSheet>
  );
}

const styles = StyleSheet.create({
  tabs: { flexWrap: 'wrap', marginBottom: 12 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  row: { paddingVertical: 8 },
  empty: { paddingVertical: 24 },
});

export default CouncilPeopleSheet;
