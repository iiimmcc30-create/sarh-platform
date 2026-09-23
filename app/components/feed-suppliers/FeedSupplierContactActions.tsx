import { AppIcon } from '@/components/ui/FlaticonIcon';
import { colors, functional, motion, radius, space } from '@/design-system';
import { AppText, SarhButton } from '@/design-system/components';
import { Row } from '@/design-system/layout';
import { mailtoUrl, mapsUrl, telUrl, websiteUrl, whatsappUrl } from '@/lib/feedSuppliers';
import { showToast } from '@/lib/toast';
import { Pressable, StyleSheet } from 'react-native';
import { Linking } from 'react-native';

export type FeedSupplierContact = {
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  lat?: number | null;
  lng?: number | null;
  addressAr?: string | null;
  cityAr?: string | null;
};

type FeedSupplierContactActionsProps = {
  supplier: FeedSupplierContact;
  /** Larger labeled buttons for the supplier profile. */
  labeled?: boolean;
};

function openLink(url: string | null, fallback: string) {
  if (!url) {
    showToast(fallback, 'error');
    return;
  }
  void Linking.openURL(url);
}

const WHATSAPP_GREEN = '#25D366';

function ContactIconButton({
  icon,
  label,
  onPress,
  whatsapp = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  whatsapp?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={space[4]}
      style={({ pressed }) => [
        styles.iconBtn,
        whatsapp && styles.iconBtnWhatsapp,
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} size={18} color={whatsapp ? '#FFFFFF' : colors.primary} />
    </Pressable>
  );
}

export function FeedSupplierContactActions({
  supplier,
  labeled = false,
}: FeedSupplierContactActionsProps) {
  const callUrl = telUrl(supplier.phone);
  const waUrl = whatsappUrl(supplier.whatsapp);
  const mailUrl = mailtoUrl(supplier.email);
  const webUrl = websiteUrl(supplier.website);
  const mapUrl = mapsUrl(supplier);

  if (!callUrl && !waUrl && !mailUrl && !webUrl && !mapUrl) return null;

  if (labeled) {
    return (
      <Row gap="sm" wrap>
        {callUrl ? (
          <SarhButton
            title="اتصال"
            variant="primary"
            size="sm"
            leftIcon="call-outline"
            onPress={() => openLink(callUrl, 'رقم الهاتف غير متوفر')}
          />
        ) : null}
        {waUrl ? (
          <SarhButton
            title="WhatsApp"
            variant="primary"
            size="sm"
            leftIcon="whatsapp"
            onPress={() => openLink(waUrl, 'رقم واتساب غير متوفر')}
            style={{ backgroundColor: WHATSAPP_GREEN, borderColor: WHATSAPP_GREEN }}
          />
        ) : null}
        {mailUrl ? (
          <SarhButton
            title="البريد"
            variant="secondary"
            size="sm"
            leftIcon="mail-outline"
            onPress={() => openLink(mailUrl, 'البريد الإلكتروني غير متوفر')}
          />
        ) : null}
        {webUrl ? (
          <SarhButton
            title="الموقع الإلكتروني ↗"
            variant="ghost"
            size="sm"
            leftIcon="globe-outline"
            onPress={() => openLink(webUrl, 'الموقع الإلكتروني غير متوفر')}
          />
        ) : null}
        {mapUrl ? (
          <SarhButton
            title="الموقع الجغرافي"
            variant="ghost"
            size="sm"
            onPress={() => openLink(mapUrl, 'موقع المورد غير متوفر')}
          />
        ) : null}
      </Row>
    );
  }

  return (
    <Row gap="sm" wrap>
      {callUrl ? (
        <ContactIconButton
          icon="call-outline"
          label="اتصال"
          onPress={() => openLink(callUrl, 'رقم الهاتف غير متوفر')}
        />
      ) : null}
      {waUrl ? (
        <ContactIconButton
          icon="whatsapp"
          label="WhatsApp"
          onPress={() => openLink(waUrl, 'رقم واتساب غير متوفر')}
          whatsapp
        />
      ) : null}
      {mailUrl ? (
        <ContactIconButton
          icon="mail-outline"
          label="البريد"
          onPress={() => openLink(mailUrl, 'البريد الإلكتروني غير متوفر')}
        />
      ) : null}
      {webUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="الموقع الإلكتروني"
          onPress={() => openLink(webUrl, 'الموقع الإلكتروني غير متوفر')}
          style={({ pressed }) => [styles.webBtn, pressed && styles.pressed]}
        >
          <AppText variant="caption" color="primary">
            الموقع الإلكتروني ↗
          </AppText>
        </Pressable>
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: space[40],
    height: space[40],
    borderRadius: radius[12],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: functional.primaryMuted,
  },
  iconBtnWhatsapp: {
    backgroundColor: WHATSAPP_GREEN,
  },
  webBtn: {
    minHeight: space[40],
    paddingHorizontal: space[12],
    borderRadius: radius[12],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: functional.primaryMuted,
  },
  pressed: {
    opacity: motion.opacity.pressed,
  },
});
