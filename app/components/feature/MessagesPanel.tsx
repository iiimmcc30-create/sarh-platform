// SAFAT — Messages inbox (Premium · RTL · Mobile-first)
import { SkeletonCircle, SkeletonPulse, SkeletonRegion, SkeletonText } from '@/components/ui/skeleton';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { Image } from '@/components/ui/AppImage';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { typography as dsType } from '@/design-system';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { Row, Stack } from '@/design-system/layout';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { radius, type ThemeColors } from '@/constants/theme';
import { space } from '@/design-system/tokens';
import { confirmDestructive } from '@/lib/actionSheet';
import type { ConversationAnchor } from '@/lib/conversationActions';
import { useLayout } from '@/hooks/useLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { AppFlatList } from '@/components/ui/AppFlatList';
import { ConversationContextMenu } from '@/components/feature/ConversationContextMenu';
import { ConversationSwipeRow } from '@/components/feature/ConversationSwipeRow';
import {
  filterMessageThreads,
  useMessageThreads,
  type MessageThreadFilter,
  type MessageThreadItem,
} from '@/hooks/useMessageThreads';
import { UserProfileLink } from '@/components/feature/UserProfileLink';
import { NewMessageSheet } from '@/components/feature/NewMessageSheet';
import { VerifiedInlineName } from '@/components/ui/VerifiedInlineName';
import type { ChatContact } from '@/services/chatApi';
import { AppRefreshControl } from '@/components/ui/AppRefreshControl';

function formatThreadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('ar-SA', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return 'أمس';
  }
  return date.toLocaleDateString('ar-SA', { day: 'numeric', month: 'short' });
}

interface MessagesPanelProps {
  variant?: 'embedded' | 'standalone';
  showHeader?: boolean;
  showSearch?: boolean;
  search?: string;
  onSearchChange?: (value: string) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** "رسالة جديدة" sheet + empty-state button (default on). */
  showNewMessage?: boolean;
  /**
   * Controlled sheet state — the Chats tab opens it from its header button
   * (the old floating button was removed to avoid a duplicate entry point).
   */
  newMessageOpen?: boolean;
  onNewMessageOpenChange?: (open: boolean) => void;
}

export function MessagesPanel({
  variant = 'standalone',
  showHeader = true,
  showSearch = true,
  search: searchProp,
  onSearchChange,
  onScroll,
  showNewMessage = true,
  newMessageOpen: newMessageOpenProp,
  onNewMessageOpenChange,
}: MessagesPanelProps) {
  const { colors } = useTheme();
  const { gutter } = useLayout();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const router = useRouter();
  const listBottomPadding = variant === 'embedded' ? space[16] : space[24];
  const { accessToken } = useAuth();
  const { threads, loading, error, refetch, hideThread, pinThread } =
    useMessageThreads(accessToken, 'ALL');
  const filter: MessageThreadFilter = 'all';
  const [searchInner, setSearchInner] = useState('');
  const search = searchProp ?? searchInner;
  const setSearch = onSearchChange ?? setSearchInner;
  const [refreshing, setRefreshing] = useState(false);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    id: string;
    isPinned: boolean;
    anchor: ConversationAnchor;
  } | null>(null);
  const [newMessageOpenInner, setNewMessageOpenInner] = useState(false);
  const newMessageOpen = newMessageOpenProp ?? newMessageOpenInner;
  const setNewMessageOpen = onNewMessageOpenChange ?? setNewMessageOpenInner;
  const threadsLenRef = useRef(threads.length);
  const loadingRef = useRef(loading);
  const skipFirstFocusRef = useRef(true);
  threadsLenRef.current = threads.length;
  loadingRef.current = loading;

  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      const forceEmpty = threadsLenRef.current === 0 && !loadingRef.current;
      void refetch(forceEmpty);
    }, [refetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch(true);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const filteredChats = useMemo(
    () => filterMessageThreads(threads, filter, search),
    [threads, filter, search],
  );

  const openChat = useCallback((chat: MessageThreadItem) => {
    if (menu) return;
    const p = chat.participant;
    if (!p) return;
    router.push({
      pathname: '/chat',
      params: {
        threadId: chat.id,
        receiverId: p.id,
        receiverName: p.arabicName,
        receiverAvatar: p.avatar ?? '',
        receiverVerified: p.verified ? '1' : '0',
        threadType: chat.type,
      },
    } as never);
  }, [menu, router]);

  /** New message: open (or lazily create on first send) the 1:1 with that person. */
  const startChatWith = useCallback(
    (contact: ChatContact) => {
      setNewMessageOpen(false);
      const existing = threads.find((t) => t.participant?.id === contact.id);
      router.push({
        pathname: '/chat',
        params: {
          ...(existing ? { threadId: existing.id } : {}),
          receiverId: contact.id,
          receiverName: contact.arabicName || contact.displayName,
          receiverAvatar: contact.avatar ?? '',
          receiverVerified: contact.verified ? '1' : '0',
          threadType: 'DIRECT',
        },
      } as never);
    },
    [router, setNewMessageOpen, threads],
  );

  const handleDeleteConversation = useCallback(
    async (threadId: string) => {
      setMenu(null);
      const confirmed = await confirmDestructive(
        'حذف المحادثة؟',
        'هل أنت متأكد من حذف هذه المحادثة؟',
      );
      if (!confirmed) {
        setOpenSwipeId(null);
        return;
      }
      setOpenSwipeId(null);
      await hideThread(threadId);
    },
    [hideThread],
  );

  const handlePinConversation = useCallback(
    async (threadId: string, pinned: boolean) => {
      setMenu(null);
      setOpenSwipeId(null);
      await pinThread(threadId, pinned);
    },
    [pinThread],
  );

  const listData = useMemo(
    () => filteredChats.filter((chat) => Boolean(chat.participant)),
    [filteredChats],
  );

  const renderThread = useCallback(
    ({ item: chat }: { item: MessageThreadItem }) => {
      const p = chat.participant;
      if (!p) return null;
      const title = p.arabicName;
      const avatarUri = p.avatar;
      const menuOpen = Boolean(menu);

      return (
        <ConversationSwipeRow
          id={chat.id}
          openId={openSwipeId}
          onOpenChange={setOpenSwipeId}
          onPress={() => openChat(chat)}
          onLongPress={(anchor) => {
            setOpenSwipeId(null);
            setMenu({
              id: chat.id,
              isPinned: Boolean(chat.isPinned),
              anchor,
            });
          }}
          onDelete={() => void handleDeleteConversation(chat.id)}
          disabled={menuOpen}
        >
          <View
            style={[
              styles.chatRow,
              { paddingHorizontal: gutter },
            ]}
          >
          <Row gap="md" align="center">
            <Row gap="sm" align="center">
              <UserProfileLink userId={p.id} disabled={menuOpen}>
                <View style={styles.avatarWrap}>
                  <Image
                    source={{ uri: avatarUri }}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                </View>
              </UserProfileLink>
            </Row>

            <Stack gap="xs" style={styles.chatBody}>
              <Row justify="between" align="center" gap="sm">
                <Row gap="xs" align="center" fill>
                  {chat.isPinned ? (
                    <AppIcon name="pin" size={13} color={colors.textMuted} />
                  ) : null}
                  <VerifiedInlineName name={title} verified={p.verified} tier={p.verifiedTier} username={p.username} style={styles.flex}>
                    <AppText variant="label" numberOfLines={1} style={styles.nameText}>
                      {title}
                    </AppText>
                  </VerifiedInlineName>
                  {chat.isMuted ? (
                    <AppIcon
                      name="notifications-off-outline"
                      size={13}
                      color={colors.textMuted}
                    />
                  ) : null}
                </Row>
                <AppText variant="micro" color="textMuted">
                  {formatThreadTime(chat.lastMessageAt)}
                </AppText>
              </Row>

              <Row justify="between" align="center" gap="sm">
                <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.flex}>
                  {chat.isMine ? 'أنت: ' : ''}
                  {chat.lastMessage ?? '—'}
                </AppText>
                {chat.unread > 0 ? (
                  <View style={styles.unreadBadge}>
                    <AppText variant="caption" style={{ color: colors.onElectric }}>
                      {chat.unread > 99 ? '99+' : chat.unread}
                    </AppText>
                  </View>
                ) : null}
              </Row>
            </Stack>
          </Row>
          </View>
        </ConversationSwipeRow>
      );
    },
    [
      colors.textMuted,
      gutter,
      handleDeleteConversation,
      menu,
      openChat,
      openSwipeId,
      styles,
    ],
  );

  const showInitialSpinner =
    (loading && threads.length === 0) ||
    (error === 'fetch_failed' && threads.length === 0);
  const showUnauthorized = error === 'unauthorized' && threads.length === 0;

  return (
    <View style={styles.root}>
      {showHeader ? <ScreenHeader variant="tab" title="الرسائل" /> : null}

      {showSearch ? (
        <View style={[styles.searchWrap, { paddingHorizontal: gutter }]}>
          <SarhInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث..."
            returnKeyType="search"
            trailingIcon="search"
            shape="pill"
            clearButtonMode="while-editing"
            accessibilityRole="search"
            accessibilityLabel="بحث"
          />
        </View>
      ) : null}

      {showInitialSpinner ? (
        // First load: conversation rows built from the real row styles (chatRow,
        // 52px avatar, name/time line, preview line) — no centred spinner.
        <SkeletonRegion style={styles.list}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={[styles.chatRow, { paddingHorizontal: gutter }]}>
              <SkeletonPulse>
                <Row gap="md" align="center">
                  <SkeletonCircle size={52} />
                  <Stack gap="xs" style={styles.chatBody}>
                    <Row justify="between" align="center" gap="sm">
                      <SkeletonText
                        fontSize={dsType.label.fontSize}
                        lineHeight={dsType.label.lineHeight}
                        widths={[i % 2 ? '44%' : '58%']}
                        style={styles.flex}
                      />
                      <SkeletonText
                        fontSize={dsType.micro.fontSize}
                        lineHeight={dsType.micro.lineHeight}
                        widths={[28]}
                        style={styles.skeletonTime}
                      />
                    </Row>
                    <SkeletonText
                      fontSize={dsType.caption.fontSize}
                      lineHeight={dsType.caption.lineHeight}
                      widths={[i % 3 ? '76%' : '62%']}
                    />
                  </Stack>
                </Row>
              </SkeletonPulse>
            </View>
          ))}
        </SkeletonRegion>
      ) : showUnauthorized ? (
        <Stack gap="sm" align="center" style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <AppIcon name="lock-closed-outline" size={28} color={colors.electricBright} />
          </View>
          <AppText variant="heading3" align="center">سجّل الدخول</AppText>
          <AppText variant="caption" color="textMuted" align="center">
            عرض رسائلك يتطلب تسجيل الدخول
          </AppText>
        </Stack>
      ) : (
        <AppFlatList
          style={styles.list}
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={renderThread}
          onScroll={onScroll}
          scrollEnabled={!menu}
          extraData={`${openSwipeId ?? ''}:${menu?.id ?? ''}`}
          contentContainerStyle={{ paddingBottom: listBottomPadding, flexGrow: 1 }}
          refreshControl={
            <AppRefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          ListEmptyComponent={
            <Stack gap="sm" align="center" style={[styles.emptyCard, { marginHorizontal: gutter }]}>
              <View style={styles.emptyIconWrap}>
                <AppIcon name="chatbubbles-outline" size={28} color={colors.electricBright} />
              </View>
              <AppText variant="heading3" align="center">ابدأ محادثة جديدة</AppText>
              <AppText variant="caption" color="textMuted" align="center">
                راسل من تتابعهم أو تواصل مع البائعين عبر الإعلانات
              </AppText>
              {showNewMessage ? (
                <SarhButton
                  title="رسالة جديدة"
                  leftIcon="square-pen"
                  onPress={() => setNewMessageOpen(true)}
                />
              ) : null}
              <SarhButton
                title="استكشف الإعلانات"
                variant="secondary"
                onPress={() => router.push('/(tabs)/market' as never)}
              />
            </Stack>
          }
        />
      )}
      {showNewMessage ? (
        <NewMessageSheet
          visible={newMessageOpen}
          onClose={() => setNewMessageOpen(false)}
          onSelect={startChatWith}
        />
      ) : null}
      <ConversationContextMenu
        target={menu}
        onClose={() => setMenu(null)}
        onPin={(threadId, pinned) => void handlePinConversation(threadId, pinned)}
        onDelete={(threadId) => void handleDeleteConversation(threadId)}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Chats list page: exactly #FFFFFF in light mode (screenRoot), calm rows.
    root: { flex: 1, backgroundColor: colors.screenRoot },
    list: { flex: 1, backgroundColor: colors.screenRoot },
    searchWrap: {
      paddingBottom: space[12],
    },
    chatRow: {
      paddingVertical: space[12],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSoft,
      backgroundColor: colors.screenRoot,
    },
    avatarWrap: { position: 'relative' },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.bgElevated,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    chatBody: { flex: 1, minWidth: 0 },
    skeletonTime: { alignSelf: 'auto', width: 28 },
    flex: { flex: 1, minWidth: 0 },
    nameText: { flexShrink: 1 },
    unreadBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: colors.electricBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    empty: {
      paddingVertical: space[48],
      paddingHorizontal: space[24],
    },
    emptyCard: {
      marginTop: space[24],
      paddingVertical: space[32],
      paddingHorizontal: space[24],
      borderRadius: radius.xl,
      backgroundColor: colors.bgSurface,
      borderWidth: 1,
      borderColor: colors.borderSoft,
    },
    emptyIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.emerald}24`,
      marginBottom: space[8],
    },
  });
}
