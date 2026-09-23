import { View } from 'react-native';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { AppText } from '@/components/ui/AppText';
import { getRtlRow } from '@/lib/rtl';
import { SarhButton, SarhInput } from '@/design-system/components';

/**
 * Architecture fixture — AppText / SarhInput / getRtlRow.
 * Must stay free of physical-edge textAlign, LTR islands, and reversed rows.
 */
export function RtlPolicyFixture() {
  return (
    <View>
      <AppText>عنوان القسم</AppText>
      <AppText>نص عربي</AppText>
      <SarhInput appearance="theme" label="عنوان الحقل" placeholder="اكتب هنا" />
      <View style={getRtlRow()}>
        <AppIcon name="location-outline" size={16} color="#1B4D3E" />
        <AppText>أيقونة مع نص</AppText>
      </View>
      <SarhButton title="زر" onPress={() => undefined} />
    </View>
  );
}
