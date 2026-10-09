/**
 * "رسالة جديدة" bottom sheet — pick someone to start / open a 1:1 chat.
 * Lists people from the existing relationships (following / followers) and
 * past chat partners, with instant local filtering + debounced server search.
 * RN Animated only (no new libraries).
 */
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image, uriSource } from '@/components/ui/AppImage';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import { AppText, SarhInput } from '@/design-system/components';
import { radius, space, spring, typography as ds } from '@/design-system';
import { SkeletonCircle, SkeletonPulse, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchMessageContacts,
  filterContactsLocally,
  mergeContacts,
  type ChatContact,
} from '@/services/chatApi';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarUrl } from '@/lib/listingMedia';

/** Contact row avatar (styles.avatar). */
const CONTACT_AVATAR = 44;
const CONTACT_SKELETON_NAME_WIDTHS = ['48%', '62%', '40%', '56%', '44%', '52%'] as const;

const SOURCE_LABEL: Record<ChatContact['source'], string> = {
  recent: 'محادثة سابقة',
  following: 'تتابعه',
  follower: 'يتابعك',
  search: 'نتيجة بحث',
};

export const NEW_MESSAGE_SEARCH_DEBOUNCE_MS = 300;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: ChatContact) => void;
};

export function NewMessageSheet({ visible, onClose, onSelect }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const sheetH = Math.round(windowH * 0.78);
  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [base, setBase] = useState<ChatContact[]>([]);
  const [remote, setRemote] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(visible);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    // Derived during render (no effect cascade): opening resets the list state.
    setPrevVisible(visible);
    if (visible) {
      setMounted(true);
      setLoading(true);
      setError(null);
    }
  }

  useEffect(() => {
    if (!mounted) return;
    // Open: iOS spring; close: quick ease-in.
    (visible
      ? Animated.spring(progress, { toValue: 1, ...spring.ios, useNativeDriver: true })
      : Animated.timing(progress, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        })
    ).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [mounted, progress, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    fetchMessageContacts('')
      .then((rows) => {
        if (!cancelled) setBase(rows);
      })
      .catch(() => {
        if (!cancelled) setError('تعذّر تحميل جهات الاتصال. حاول مرة أخرى لاحقاً.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    const q = query.trim();
    if (!visible || q.length < 2) return undefined;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      fetchMessageContacts(q, controller.signal)
        .then((rows) => setRemote(rows))
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, NEW_MESSAGE_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query, visible]);

  const results = useMemo(() => {
    const local = filterContactsLocally(base, query);
    return query.trim().length >= 2 ? mergeContacts(local, remote) : local;
  }, [base, query, remote]);

  const close = () => {
    setQuery('');
    setRemote([]);
    onClose();
  };

  const pick = (c: ChatContact) => {
    setQuery('');
    setRemote([]);
    onSelect(c);
  };

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetH, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="إغلاق" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          {
            height: sheetH,
            paddingBottom: Math.max(insets.bottom, space[12]),
            backgroundColor: colors.bgElevated,
            borderColor: colors.borderSoft,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
        <View style={styles.headerRow}>
          <AppText variant="heading3" accessibilityRole="header" style={styles.flex}>
            رسالة جديدة
          </AppText>
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            style={styles.closeBtn}
          >
            <AppIcon name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.searchWrap}>
          <SarhInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث بالاسم أو اسم المستخدم"
            trailingIcon="search"
            shape="pill"
            autoFocus={false}
            returnKeyType="search"
            accessibilityRole="search"
            accessibilityLabel="بحث عن شخص"
          />
        </View>
        {loading && base.length === 0 ? (
          <SkeletonRegion style={styles.listContent}>
            {CONTACT_SKELETON_NAME_WIDTHS.map((width, i) => (
              <View key={i} style={[styles.row, { borderBottomColor: colors.borderSoft }]}>
                <SkeletonPulse style={styles.skeletonRowInner}>
                  <SkeletonCircle size={CONTACT_AVATAR} />
                  <View style={styles.flex}>
                    <SkeletonText fontSize={ds.label.fontSize} lineHeight={ds.label.lineHeight} widths={[width]} />
                    <SkeletonText fontSize={ds.caption.fontSize} lineHeight={ds.caption.lineHeight} widths={['34%']} />
                  </View>
                  <SkeletonCircle size={18} />
                </SkeletonPulse>
              </View>
            ))}
          </SkeletonRegion>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              searching ? (
                <ActivityIndicator size="small" color={colors.electricBright} style={styles.searching} />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.center}>
                <AppText variant="caption" color="textMuted" align="center">
                  {error ??
                    (query.trim()
                      ? 'لا توجد نتائج مطابقة'
                      : 'تابع أشخاصاً أو ابحث بالاسم لبدء محادثة')}
                </AppText>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => pick(item)}
                style={({ pressed }) => [
                  styles.row,
                  { borderBottomColor: colors.borderSoft },
                  pressed && { backgroundColor: colors.bgSurface },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`مراسلة ${item.arabicName || item.displayName}`}
              >
                <Image
                  source={uriSource(avatarUrl(item.avatar ?? undefined))}
                  style={[styles.avatar, { backgroundColor: colors.bgSurface }]}
                  contentFit="cover"
                />
                <View style={styles.flex}>
                  <VerifiedInlineName
                    name={item.arabicName || item.displayName}
                    verified={item.verified}
                    tier={item.verifiedTier}
                    username={item.username}
                  >
                    <AppText variant="label" numberOfLines={1} style={styles.shrink}>
                      {item.arabicName || item.displayName}
                    </AppText>
                  </VerifiedInlineName>
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {item.username ? `@${item.username} · ` : ''}
                    {SOURCE_LABEL[item.source]}
                  </AppText>
                </View>
                <AppIcon name="chatbubble-ellipses-outline" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(16, 24, 32, 0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: radius[20],
    borderTopRightRadius: radius[20],
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: space[8],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: space[8],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[16],
    paddingBottom: space[8],
  },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: space[16], paddingBottom: space[8] },
  listContent: { paddingBottom: space[24], flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: CONTACT_AVATAR, height: CONTACT_AVATAR, borderRadius: CONTACT_AVATAR / 2 },
  skeletonRowInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  center: { paddingVertical: space[32], paddingHorizontal: space[24], alignItems: 'center' },
  searching: { marginVertical: space[8] },
});
