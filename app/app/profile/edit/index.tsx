import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Image } from '@/components/ui/AppImage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { copyToClipboard } from '@/lib/clipboard';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { showToast } from '@/lib/toast';
import { rtlForwardIcon } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { AppText, SarhCard, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { me, updateMe } = useAppUser();
  const [avatarBusy, setAvatarBusy] = useState(false);

  const displayName = me.arabicName || me.displayName || '';
  const username = me.username || '';
  const profileUrl = sarhProfileShareUrl(username);
  const bio = me.bio?.trim() ?? '';

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('إذن مطلوب', 'يرجى السماح للتطبيق بالوصول إلى مكتبة الصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setAvatarBusy(true);
    const save = await updateMe({ avatar: result.assets[0].uri });
    setAvatarBusy(false);
    if (save.ok) {
      if (save.error) {
        void showToast(save.error, 'warning');
      } else {
        void showToast('تم حفظ التغييرات بنجاح', 'success');
      }
    } else {
      void showToast(save.error || 'فشل حفظ التغييرات، يرجى المحاولة مجدداً.', 'error');
    }
  };

  const handleCopyUrl = () => {
    copyToClipboard(profileUrl);
    void showToast('تم نسخ الرابط', 'success');
  };

  const openField = (field: 'name' | 'username' | 'bio') => {
    safePush(`/profile/edit/${field}`, undefined, router);
  };

  return (
    <Screen edges={['top']}>
      <ScreenHeader variant="screen" title="تعديل الملف الشخصي" showBack />
      <ScreenBody padTop="lg" gap="md" width="form">
        <Pressable
          onPress={() => void handlePickAvatar()}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel="تعديل الصورة أو الأفاتار"
          style={styles.avatarBlock}
        >
          <View style={styles.avatarWrap}>
            <Image source={{ uri: me.avatar }} style={styles.avatar} contentFit="cover" />
            <View style={styles.avatarCamera} pointerEvents="none">
              <AppIcon name="camera" size={22} color={colors.textPrimary} />
            </View>
          </View>
          <AppText variant="label" color="primary" align="center">
            تعديل الصورة أو الأفاتار
          </AppText>
        </Pressable>

        <SarhCard variant="default" padding="none" style={styles.card}>
          <ProfileInfoRow
            label="الاسم"
            value={displayName}
            valueAlign="center"
            onPress={() => openField('name')}
            styles={styles}
            colors={colors}
          />
          <SarhDivider inset />
          <ProfileInfoRow
            label="اسم المستخدم"
            value={username ? `@${username}` : ''}
            placeholder="@username"
            ltr
            inline
            onPress={() => openField('username')}
            styles={styles}
            colors={colors}
          />
          <SarhDivider inset />
          <ProfileInfoRow
            label="رابط الملف الشخصي"
            value={profileUrl}
            ltr
            trailing="copy"
            onPress={handleCopyUrl}
            styles={styles}
            colors={colors}
          />
        </SarhCard>

        <AppText variant="caption" color="textMuted" style={styles.sectionLabel}>
          معلومات أساسية
        </AppText>

        <SarhCard variant="default" padding="none" style={styles.card}>
          <ProfileInfoRow
            label="السيرة الذاتية"
            value={bio}
            placeholder=""
            valueAlign="center"
            onPress={() => openField('bio')}
            styles={styles}
            colors={colors}
          />
          <SarhDivider inset />
          <ProfileInfoRow
            label="روابط"
            value=""
            placeholder="إضافة رابط"
            styles={styles}
            colors={colors}
          />
        </SarhCard>
      </ScreenBody>
    </Screen>
  );
}

function ProfileInfoRow({
  label,
  value,
  placeholder,
  ltr,
  inline,
  valueAlign = 'start',
  trailing = 'chevron',
  onPress,
  styles,
  colors,
}: {
  label: string;
  value: string;
  placeholder?: string;
  ltr?: boolean;
  inline?: boolean;
  valueAlign?: 'start' | 'center';
  trailing?: 'chevron' | 'copy';
  onPress?: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const shown = value || placeholder || '';
  const muted = !value;
  const centered = valueAlign === 'center';
  const valueText = shown ? (
    <AppText
      variant="label"
      color={muted ? 'textMuted' : 'textPrimary'}
      align={centered ? 'center' : 'auto'}
      numberOfLines={1}
      style={[styles.infoValue, ltr ? styles.latin : null]}
    >
      {shown}
    </AppText>
  ) : (
    <View style={styles.infoValue} />
  );
  const chevron = (
    <AppIcon
      name={trailing === 'copy' ? 'copy' : rtlForwardIcon()}
      size={16}
      color={colors.textMuted}
    />
  );
  const body = centered ? (
    <Row align="center" style={styles.infoRow} gap="sm">
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <View style={styles.infoValueCenter}>{valueText}</View>
      {chevron}
    </Row>
  ) : inline ? (
    <Row align="center" style={styles.infoRow} gap="sm">
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      {valueText}
      <View style={styles.infoRowSpacer} />
      {chevron}
    </Row>
  ) : (
    <Row justify="between" align="center" style={styles.infoRow} gap="sm">
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <Row align="center" gap="sm" style={styles.infoValueCluster}>
        {valueText}
        {chevron}
      </Row>
    </Row>
  );

  if (!onPress) return body;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={trailing === 'copy' ? `نسخ ${label}` : `تعديل ${label}`}
    >
      {body}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    avatarBlock: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    avatarWrap: {
      width: 108,
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: colors.bgElevated,
    },
    avatarCamera: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    card: {
      overflow: 'hidden',
    },
    sectionLabel: {
      paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    infoRow: {
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    infoValueCluster: {
      flexShrink: 1,
      minWidth: 0,
    },
    infoRowSpacer: {
      flex: 1,
      minWidth: 8,
    },
    infoValueCenter: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    infoValue: {
      flexShrink: 1,
      minWidth: 0,
      maxWidth: '100%',
    },
    latin: {
      writingDirection: 'ltr',
    },
  });
}
