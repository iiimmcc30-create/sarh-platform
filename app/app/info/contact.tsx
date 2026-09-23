import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { rtlForwardIcon, rtlInputText } from '@/lib/rtl';
import { motion } from '@/design-system';
import { AppText, SarhButton, SarhCard, SarhDivider } from '@/design-system/components';
import { resolveAppTextStyle } from '@/design-system/components/resolvers';
import { Row, Screen, ScreenBody, Section, Stack } from '@/design-system/layout';
import { Alert, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';

const CHANNELS = [
  {
    icon: 'call',
    label: 'الهاتف',
    value: '+966 591 298 136',
    href: 'tel:+966591298136',
  },
  {
    icon: 'whatsapp',
    label: 'واتساب',
    value: '+966 591 298 136',
    href: 'https://wa.me/966591298136',
  },
  {
    icon: 'mail',
    label: 'البريد الإلكتروني',
    value: 'sarh@sarhsa.online',
    href: 'mailto:sarh@sarhsa.online',
  },
  {
    icon: 'globe-outline',
    label: 'الموقع الإلكتروني',
    value: 'sarhsa.online',
    href: 'https://sarhsa.online',
  },
];

export default function ContactScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!name.trim() || !message.trim()) {
      Alert.alert('تنبيه', 'يرجى تعبئة الاسم والرسالة');
      return;
    }
    setSending(true);
    const subject = encodeURIComponent(`رسالة من ${name} - تطبيق سرح`);
    const body = encodeURIComponent(`الاسم: ${name}\n\n${message}`);
    await Linking.openURL(`mailto:sarh@sarhsa.online?subject=${subject}&body=${body}`);
    setSending(false);
  };

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title="تواصل معنا" showBack />
      <ScreenBody padTop="lg" gap="section" padBottom="xxxl">
        <Section title="قنوات التواصل">
          <SarhCard level="card" padding="none">
            {CHANNELS.map((ch, idx) => (
              <View key={ch.href}>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`${ch.label}: ${ch.value}`}
                  onPress={() => Linking.openURL(ch.href)}
                  style={({ pressed }) => [{ opacity: pressed ? motion.press.opacity : 1 }]}
                >
                  <Row gap="md" style={styles.channelRow}>
                    <View style={styles.channelIconWrap}>
                      <AppIcon name={ch.icon} size={18} color={colors.electricBright} />
                    </View>
                    <Stack gap="none" style={styles.fill}>
                      <AppText variant="caption" color="textMuted">{ch.label}</AppText>
                      <AppText variant="bodyMedium" color="textPrimary">{ch.value}</AppText>
                    </Stack>
                    <AppIcon name={rtlForwardIcon()} size={16} color={colors.textMuted} />
                  </Row>
                </Pressable>
                {idx < CHANNELS.length - 1 ? <SarhDivider inset /> : null}
              </View>
            ))}
          </SarhCard>
        </Section>

        <Section title="أرسل رسالة مباشرة" gap="md">
          <SarhCard level="card" padding="none">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="اسمك"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, rtlInputText]}
              returnKeyType="next"
              accessibilityLabel="اسمك"
            />
            <SarhDivider />
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="رسالتك"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, styles.inputMultiline, rtlInputText]}
              multiline
              numberOfLines={4}
              returnKeyType="send"
              textAlignVertical="top"
              accessibilityLabel="رسالتك"
            />
          </SarhCard>
          <SarhButton
            title={sending ? 'جارٍ الإرسال…' : 'إرسال عبر البريد'}
            leftIcon="send"
            fullWidth
            loading={sending}
            disabled={sending}
            onPress={() => void handleSend()}
          />
        </Section>

        <Section title="أوقات العمل">
          <AppText variant="body" color="textSecondary">
            الأحد — الخميس · ٩ص — ٦م (بتوقيت الرياض)
          </AppText>
        </Section>
      </ScreenBody>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    fill: { flex: 1, minWidth: 0 },
    channelRow: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    channelIconWrap: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      backgroundColor: colors.bgElevated,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      flexShrink: 0,
    },
    /** Raw TextInput cannot host AppText, so it borrows the same type token. */
    input: {
      ...resolveAppTextStyle({ variant: 'bodyMedium', color: 'textPrimary' }),
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      minHeight: 44,
    },
    inputMultiline: {
      minHeight: 100,
    },
  });
}
