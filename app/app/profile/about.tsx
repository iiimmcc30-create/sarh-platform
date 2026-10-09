// «عن هذا الحساب» — X-style About this account, pushed from the profile name / @handle.
// Rows come only from data the app already stores and shows: createdAt, User.country
// and the verification approval date (verifiedSince). No IP geolocation, no tracking.
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { VerifiedInfoSheet } from '@/components/ui/VerifiedInfoSheet';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { spacing } from '@/constants/theme';
import { AppText, SarhAvatar, SarhDivider } from '@/design-system/components';
import { Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { fontFamily, fontWeight, motion } from '@/design-system/tokens';
import { useAppUser } from '@/hooks/useApp';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { ABOUT_ACCOUNT_TITLE, aboutAccountRows, type AboutAccountRow } from '@/lib/aboutAccount';
import { rtlForwardIcon } from '@/lib/rtl';
import { fetchUserProfile, getCachedUserProfile } from '@/services/users';

type AboutSubject = {
  id: string;
  username: string;
  name: string;
  avatar?: string;
  verified: boolean;
  verifiedTier?: string | null;
  verifiedSince?: string | null;
  createdAt?: string | null;
  country?: string | null;
};

/** Row icon column (X: 24pt glyph on the inline start). */
export const ABOUT_ROW_ICON = 24;

export default function AboutAccountScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me } = useAppUser();
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(() => createStyles());
  const isOwn = !id || id === me.id;
  const [subject, setSubject] = useState<AboutSubject | null>(() => (isOwn ? null : fromProfile(id)));
  const [verifiedSheetOpen, setVerifiedSheetOpen] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOwn || !id) return;
    let alive = true;
    // Cached by the profile screen (fresh for 60s), so this rarely touches the network.
    void fetchUserProfile(id).then(() => {
      if (alive) setSubject(fromProfile(id));
    });
    return () => {
      alive = false;
    };
  }, [id, isOwn]);

  const current: AboutSubject | null = isOwn
    ? {
        id: me.id,
        username: me.username,
        name: me.arabicName || me.displayName || me.username,
        avatar: me.avatar,
        verified: me.verified === true,
        verifiedTier: me.verifiedTier ?? null,
        verifiedSince: me.verifiedSince ?? null,
        createdAt: me.createdAt ?? null,
        country: me.country ?? null,
      }
    : subject;

  useEffect(() => {
    if (!current) return;
    Animated.timing(fade, { toValue: 1, duration: motion.duration.normal, useNativeDriver: true }).start();
  }, [current != null, fade]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = current ? aboutAccountRows(current) : [];

  const renderRow = (row: AboutAccountRow) => {
    const isVerifiedRow = row.key === 'verified';
    const body = (
      <Row gap="md" align="center" style={[styles.row, { paddingHorizontal: gutter }]} testID={`about-row-${row.key}`}>
        <View style={styles.rowIcon}>
          {isVerifiedRow ? (
            <VerificationBadge size={ABOUT_ROW_ICON} tier={current?.verifiedTier} />
          ) : (
            <AppIcon name={row.icon ?? 'information-outline'} size={ABOUT_ROW_ICON} color={colors.textPrimary} />
          )}
        </View>
        <Stack gap="none" style={styles.rowText}>
          <AppText variant="label" color="textPrimary" style={styles.rowTitle} numberOfLines={1}>
            {row.title}
          </AppText>
          {row.subtitle ? (
            <AppText variant="bodySmall" color="textSecondary" numberOfLines={1}>
              {row.subtitle}
            </AppText>
          ) : null}
        </Stack>
        {isVerifiedRow ? <AppIcon name={rtlForwardIcon()} size={16} color={colors.textSecondary} /> : null}
      </Row>
    );
    if (!isVerifiedRow) return <View key={row.key}>{body}</View>;
    return (
      <Pressable
        key={row.key}
        accessibilityRole="button"
        accessibilityLabel={row.subtitle ? `${row.title} ${row.subtitle}` : row.title}
        onPress={() => setVerifiedSheetOpen(true)}
        style={({ pressed }) => ({ opacity: pressed ? motion.opacity.pressed : 1 })}
      >
        {body}
      </Pressable>
    );
  };

  return (
    <Screen>
      <ScreenHeader variant="screen" title={ABOUT_ACCOUNT_TITLE} showBack />
      <ScreenBody gutter={false} padTop="md">
        {current ? (
          <Animated.View style={{ opacity: fade }}>
            <Stack gap="sm" align="center" style={[styles.identity, { paddingHorizontal: gutter }]}>
              <SarhAvatar uri={current.avatar} name={current.name} size="xl" />
              <Row gap="xs" align="center" justify="center">
                <AppText variant="heading3" color="textPrimary" numberOfLines={1} style={styles.name}>
                  {current.name}
                </AppText>
                {current.verified ? <VerificationBadge size={18} tier={current.verifiedTier} /> : null}
              </Row>
              <AppText variant="label" color="textSecondary" numberOfLines={1} style={styles.handle}>
                @{current.username}
              </AppText>
            </Stack>
            <SarhDivider />
            <View style={styles.rows}>{rows.map(renderRow)}</View>
          </Animated.View>
        ) : null}
      </ScreenBody>
      {current?.verified ? (
        <VerifiedInfoSheet
          visible={verifiedSheetOpen}
          onClose={() => setVerifiedSheetOpen(false)}
          tier={current.verifiedTier}
          verifiedSince={current.verifiedSince}
        />
      ) : null}
    </Screen>
  );
}

function fromProfile(id: string | undefined): AboutSubject | null {
  const p = id ? getCachedUserProfile(id) : null;
  if (!p) return null;
  return {
    id: p.id,
    username: p.username,
    name: p.arabicName || p.displayName || p.username,
    avatar: p.avatar,
    verified: p.verified === true,
    verifiedTier: p.verifiedTier ?? null,
    verifiedSince: p.verifiedSince ?? null,
    createdAt: p.createdAt ?? null,
    country: p.country ?? null,
  };
}

function createStyles() {
  return StyleSheet.create({
    identity: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
    },
    name: {
      flexShrink: 1,
    },
    handle: {
      writingDirection: 'ltr',
    },
    rows: {
      paddingTop: spacing.sm,
    },
    /** X row: 24pt glyph, bold title over a grey subtitle, ≥ 56pt tall. */
    row: {
      minHeight: 64,
      paddingVertical: spacing.md,
    },
    rowIcon: {
      width: ABOUT_ROW_ICON,
      alignItems: 'center',
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowTitle: {
      fontFamily: fontFamily.bold,
      fontWeight: fontWeight.bold,
    },
  });
}
