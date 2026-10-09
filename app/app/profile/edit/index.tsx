import { AppIcon } from '@/components/ui/FlaticonIcon';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Image } from '@/components/ui/AppImage';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Pressable, StyleSheet, View } from 'react-native';
import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAppUser } from '@/hooks/useApp';
import { copyToClipboard } from '@/lib/clipboard';
import { sarhProfileShareUrl } from '@/constants/sarhOfficial';
import { showToast } from '@/lib/toast';
import { rtlForwardIcon } from '@/lib/rtl';
import { safePush } from '@/lib/safeNavigate';
import { presentActionSheet } from '@/lib/actionSheet';
import { profileLinksSummary } from '@/lib/profileLinks';
import { AppText, SarhCard, SarhDivider } from '@/design-system/components';
import { FullBleed, Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { avatarUrl } from '@/lib/listingMedia';
import { showAlert } from '@/lib/confirmDialog';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const { me, updateMe } = useAppUser();
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const displayName = me.arabicName || me.displayName || '';
  const username = me.username || '';
  const profileUrl = sarhProfileShareUrl(username);
  const bio = me.bio?.trim() ?? '';
  const linksSummary = profileLinksSummary(me.links);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('إذن مطلوب', 'يرجى السماح للتطبيق بالوصول إلى مكتبة الصور');
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

  /** Saves through the existing updateMe flow (Cloudinary upload, 'avatars' folder). '' removes. */
  const saveCover = async (next: string) => {
    setCoverBusy(true);
    setCoverPreview(next || null);
    const save = await updateMe({ coverImage: next });
    setCoverBusy(false);
    setCoverPreview(null);
    if (save.ok && !save.error) {
      void showToast(next ? 'تم تحديث الغلاف' : 'تمت إزالة الغلاف', 'success');
    } else {
      void showToast(save.error || 'فشل حفظ التغييرات، يرجى المحاولة مجدداً.', save.ok ? 'warning' : 'error');
    }
  };

  const pickCover = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert('إذن مطلوب', 'يرجى السماح للتطبيق بالوصول إلى مكتبة الصور');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    await saveCover(result.assets[0].uri);
  };

  const handleCover = async () => {
    if (!me.coverImage) {
      await pickCover();
      return;
    }
    const key = await presentActionSheet({
      title: 'غلاف الملف الشخصي',
      items: [
        { key: 'replace', label: 'استبدال الغلاف', icon: 'image-outline' },
        { key: 'remove', label: 'إزالة الغلاف', icon: 'trash-outline', destructive: true },
        { key: 'cancel', label: 'إلغاء', cancel: true },
      ],
    });
    if (key === 'replace') await pickCover();
    if (key === 'remove') await saveCover('');
  };

  const coverUri = coverPreview ?? me.coverImage ?? null;

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
          onPress={() => void handleCover()}
          disabled={coverBusy}
          accessibilityRole="button"
          accessibilityLabel="تغيير غلاف الملف الشخصي"
          style={styles.coverBlock}
        >
          {/* Edge to edge like the profile page cover: escapes the form gutter, no rounded card corners. */}
          <FullBleed testID="edit-profile-cover">
            <View style={styles.coverFrame}>
              {coverUri ? (
                <Image source={{ uri: coverUri }} style={styles.coverImage} contentFit="cover" />
              ) : (
                <View style={[styles.coverImage, styles.coverDefault]} />
              )}
              <View style={styles.coverIcon} pointerEvents="none">
                <AppIcon name="image-outline" size={20} color={colors.textPrimary} />
              </View>
            </View>
          </FullBleed>
          <AppText variant="label" color="primary" align="center">
            {coverBusy ? 'جارٍ حفظ الغلاف…' : 'تغيير غلاف الملف الشخصي'}
          </AppText>
        </Pressable>

        <Pressable
          onPress={() => void handlePickAvatar()}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel="تعديل الصورة أو الأفاتار"
          style={styles.avatarBlock}
        >
          <View style={styles.avatarWrap}>
            <Image source={{ uri: avatarUrl(me.avatar, 'large') }} style={styles.avatar} contentFit="cover" />
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
            value={linksSummary}
            placeholder="إضافة رابط"
            ltr={Boolean(linksSummary)}
            onPress={() => safePush('/profile/edit/links', undefined, router)}
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
    coverBlock: {
      gap: spacing.sm,
    },
    /** Full screen width: no side borders or corner radius, hairlines only above and below. */
    coverFrame: {
      height: 104,
      width: '100%',
      overflow: 'hidden',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    coverImage: {
      ...StyleSheet.absoluteFillObject,
    },
    /** Same quiet default as the profile page cover. */
    coverDefault: {
      backgroundColor: colors.electric,
      opacity: 0.08,
    },
    coverIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
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
