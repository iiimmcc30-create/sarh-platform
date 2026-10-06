import { StyleSheet, View } from 'react-native';
import { radius, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { CouncilSheet } from './CouncilSheet';

type Props = {
  visible: boolean;
  councilName: string;
  rules: string[];
  /** Read-only view (rules already accepted). */
  readOnly?: boolean;
  loading?: boolean;
  onAccept: () => void;
  onClose: () => void;
};

export function CouncilRulesSheet({ visible, councilName, rules, readOnly, loading, onAccept, onClose }: Props) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <CouncilSheet
      visible={visible}
      title="قواعد المجلس"
      subtitle={councilName}
      onClose={onClose}
      footer={
        readOnly ? null : (
          <>
            <SarhButton title="أوافق وأدخل المجلس" onPress={onAccept} loading={loading} fullWidth shape="pill" />
            <SarhButton title="ليس الآن" variant="ghost" onPress={onClose} fullWidth shape="pill" />
          </>
        )
      }
    >
      {rules.map((rule, i) => (
        <Row key={`${i}-${rule}`} gap="md" align="start">
          <View style={styles.index}>
            <AppText variant="micro" color="textSecondary">
              {i + 1}
            </AppText>
          </View>
          <AppText variant="body" color="textPrimary" style={{ flex: 1 }}>
            {rule}
          </AppText>
        </Row>
      ))}
    </CouncilSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    index: {
      width: 24,
      height: 24,
      borderRadius: radius.pill,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
  });
}
