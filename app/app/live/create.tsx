// app/live/create.tsx — إعداد البث المباشر (معاينة + عنوان + فئة + تعهد)
import { AppIcon } from '@/components/ui/FlaticonIcon';

import { LinearGradient } from '@/components/ui/AppLinearGradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { navigateToCreateListing } from '@/lib/navigateToCreateListing';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SarhButton } from '@/design-system/components';
import { AgoraVideoView } from '@/components/live/AgoraVideoView';
import { LiveBroadcastPledgeModal } from '@/components/live/LiveBroadcastPledgeModal';
import { VideoSourceType } from '@/lib/agora';
import { useLiveStream } from '@/hooks/useLiveStream';
import { colors, radius, spacing, typography, type ThemeColors } from '@/constants/theme';
import { FILTER_CHIP } from '@/components/ui/filterChipTokens';
import { getRtlText, rtlInputText } from '@/lib/rtl';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/services/api';
import { showLiveBroadcastComingSoonAlert, showLiveStreamEligibilityDeniedAlert } from '@/lib/liveStreamAccess';
import { SarhBackButton, SarhChip } from '@/design-system/components';
import { useThemedStyles } from '@/hooks/useThemedStyles';

const AGORA_APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
/** Disabled until app launch — see liveStreamAccess.ts */
const LIVE_BROADCAST_ENABLED = false;

const CATEGORIES = [
  { id: 'camels', ar: 'إبل' },
  { id: 'sheep', ar: 'أغنام' },
  { id: 'goats', ar: 'ماعز' },
  { id: 'cattle', ar: 'أبقار' },
  { id: 'horses', ar: 'خيل' },
  { id: 'falcons', ar: 'طيور' },
  { id: 'feed', ar: 'أعلاف' },
  { id: 'equipment', ar: 'معدات' },
  { id: 'general_other', ar: 'أخرى' },
];

function mapCategory(id: string): string {
  if (id === 'general_other' || id === 'equipment') return 'general';
  return id;
}

export default function CreateStreamScreen() {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  const router = useRouter();
  const params = useLocalSearchParams<{ listingId?: string; listingTitle?: string }>();
  const { accessToken } = useAuth();

  const [arabicTitle, setArabicTitle] = useState(params.listingTitle ?? '');
  const [category, setCategory] = useState('camels');
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(LIVE_BROADCAST_ENABLED);
  const [accessDenied, setAccessDenied] = useState(!LIVE_BROADCAST_ENABLED);
  const [showPledge, setShowPledge] = useState(false);
  const [pledgeChecked, setPledgeChecked] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [micOff, setMicOff] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  const {
    isJoined,
    localUid,
    error: agoraError,
    startLocalPreview,
    stopLocalPreview,
    switchCamera,
    muteAudio,
    muteVideo,
    destroy,
  } = useLiveStream({
    role: 'host',
    onError: () => setPermissionError(true),
  });

  useEffect(() => {
    if (!LIVE_BROADCAST_ENABLED) {
      showLiveBroadcastComingSoonAlert();
      return;
    }

    let active = true;

    (async () => {
      if (!accessToken) {
        if (active) {
          setAccessDenied(true);
          setCheckingAccess(false);
        }
        return;
      }

      const { fetchLiveStreamEligibility, showLiveStreamEligibilityDeniedAlert } = await import(
        '@/lib/liveStreamAccess'
      );
      const eligibility = await fetchLiveStreamEligibility(accessToken);
      if (!active) return;

      if (!eligibility.canStream) {
        setAccessDenied(true);
        showLiveStreamEligibilityDeniedAlert(router, eligibility);
      }
      setCheckingAccess(false);
    })();

    return () => {
      active = false;
    };
  }, [accessToken, router]);

  const requestPreview = useCallback(async () => {
    if (!AGORA_APP_ID) {
      setPermissionError(true);
      return;
    }
    setPermissionError(false);
    const ok = await startLocalPreview(AGORA_APP_ID);
    setPreviewReady(ok);
    if (!ok) setPermissionError(true);
  }, [startLocalPreview]);

  useEffect(() => {
    if (!checkingAccess && !accessDenied && AGORA_APP_ID) {
      requestPreview();
    }
    return () => {
      destroy().catch(() => {});
    };
  }, [checkingAccess, accessDenied]);

  const toggleCam = () => {
    const next = !camOff;
    setCamOff(next);
    muteVideo(next);
  };

  const toggleMic = () => {
    const next = !micOff;
    setMicOff(next);
    muteAudio(next);
  };

  const titleReady = arabicTitle.trim().length >= 3;
  const canStart = titleReady && !accessDenied;

  const handleStartPress = () => {
    if (!canStart) return;
    setPledgeChecked(false);
    setShowPledge(true);
  };

  const handlePledgeConfirm = async () => {
    if (!accessToken || !pledgeChecked) return;
    setLoading(true);

    try {
      const titleEn = arabicTitle.trim();
      const resp = await fetch(`${API_BASE}/api/livestreams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          arabicTitle: titleEn,
          title: titleEn,
          category: mapCategory(category),
          topic: params.listingId ? `listing:${params.listingId}` : undefined,
        }),
      });

      const json = await resp.json();

      if (!json.success) {
        const msg = json.messageAr ?? json.message ?? 'حدث خطأ';
        if (['listing_required', 'plan_required', 'weekly_limit', 'live_minutes_limit'].includes(json.error)) {
          showLiveStreamEligibilityDeniedAlert(router, {
            reason: json.reason ?? json.error,
            messageAr: msg,
          });
          setAccessDenied(true);
        } else {
          Alert.alert('خطأ', msg);
        }
        setLoading(false);
        setShowPledge(false);
        return;
      }

      const { streamId, agoraAppId, agoraChannel, agoraToken, agoraUid } = json.data;

      await destroy();

      router.replace({
        pathname: '/live/broadcast',
        params: {
          streamId,
          agoraAppId,
          agoraChannel,
          agoraToken,
          agoraUid: String(agoraUid ?? 0),
          arabicTitle: titleEn,
          category: mapCategory(category),
          autoStart: '1',
          camOff: camOff ? '1' : '0',
          micOff: micOff ? '1' : '0',
        },
      });
    } catch {
      Alert.alert('خطأ في الاتصال', 'تأكد من الإنترنت وحاول مجدداً');
      setLoading(false);
      setShowPledge(false);
    }
  };

  if (checkingAccess) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={colors.liveRed} />
        <Text style={styles.muted}>جاري التحقق...</Text>
      </SafeAreaView>
    );
  }

  if (accessDenied) {
    if (!LIVE_BROADCAST_ENABLED) {
      return (
        <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
          <Text style={styles.blockedIcon}>📡</Text>
          <Text style={styles.blockedTitle}>البث المباشر — قريباً</Text>
          <Text style={styles.muted}>
            ميزة بدء البث المباشر ستتوفر قريباً مع إطلاق التطبيق. يمكنك مشاهدة البثوث الحية من تبويب البث.
          </Text>
          <SarhButton
            title="مشاهدة البث المباشر"
            fullWidth
            onPress={() => router.replace('/(tabs)/live')}
            style={styles.primaryCta}
          />
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>رجوع</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <Text style={styles.blockedIcon}>📋</Text>
        <Text style={styles.blockedTitle}>إعلان مطلوب للبث</Text>
        <Text style={styles.muted}>انشر إعلاناً واحداً على الأقل في السوق، ثم يمكنك بدء بث مباشر.</Text>
        <SarhButton
          title="إنشاء إعلان"
          fullWidth
          onPress={() => void navigateToCreateListing()}
          style={styles.primaryCta}
        />
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
          <Text style={styles.link}>رجوع</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <SarhBackButton onPress={() => { destroy(); router.back(); }} color={colors.textPrimary} style={styles.backBtn} />
          <Text style={styles.topTitle}>إعداد البث المباشر</Text>
          <View style={{ width: 38 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Preview */}
          <View style={styles.previewBox}>
            {isJoined && !camOff ? (
              <AgoraVideoView
                local
                canvas={{ uid: 0, sourceType: VideoSourceType.VideoSourceCamera }}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <View style={styles.previewPlaceholder}>
                <AppIcon name="broadcast" size={40} color={colors.electricBright} />
                {!previewReady && !permissionError ? (
                  <ActivityIndicator color={colors.electricBright} style={{ marginTop: spacing.md }} />
                ) : null}
              </View>
            )}

            <View style={styles.previewTop}>
              <View style={styles.viewerPill}>
                <AppIcon name="eye-outline" size={14} color="#fff" />
                <Text style={styles.viewerPillText}>0</Text>
              </View>
              <View style={styles.previewBadge}>
                <Text style={styles.previewBadgeText}># معاينة</Text>
              </View>
            </View>

            <View style={styles.previewSide}>
              <Pressable style={styles.sideBtn} onPress={() => switchCamera()}>
                <AppIcon name="camera-reverse-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.sideBtn, camOff && styles.sideBtnOff]}
                onPress={toggleCam}
              >
                <AppIcon name={camOff ? 'videocam-off' : 'videocam'} size={20} color="#fff" />
              </Pressable>
              <Pressable
                style={[styles.sideBtn, micOff && styles.sideBtnOff]}
                onPress={toggleMic}
              >
                <AppIcon name={micOff ? 'mic-off' : 'mic'} size={20} color="#fff" />
              </Pressable>
            </View>

            {(permissionError || agoraError) && !previewReady ? (
              <View style={styles.previewCenter}>
                <Pressable style={styles.allowBtn} onPress={requestPreview}>
                  <AppIcon name="broadcast" size={22} color="#fff" />
                  <Text style={styles.allowBtnText}>السماح بالكاميرا والميكروفون</Text>
                </Pressable>
              </View>
            ) : null}

            {(permissionError || agoraError) ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  تعذّر الوصول للكاميرا/الميكروفون. يمكنك البدء بدونهما أو السماح من إعدادات الجهاز.
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.hint}>
            الكاميرا والميكروفون اختياريان — يمكنك إغلاقهما قبل البدء أو البدء بدونهما
          </Text>

          <TextInput
            style={[styles.titleInput, rtlInputText]}
            placeholder="عنوان البث (مثال: مزاد المغانيم المباشر)"
            placeholderTextColor={colors.textMuted}
            value={arabicTitle}
            onChangeText={setArabicTitle}
            maxLength={100}
          />

          <View style={styles.catHeader}>
            <AppIcon name="pricetag-outline" size={16} color={colors.textMuted} />
            <Text style={styles.catHeaderText}>فئة البث</Text>
          </View>
          <View style={styles.catGrid}>
            {CATEGORIES.map((cat) => (
              <SarhChip appearance="filter"
                key={cat.id + cat.ar}
                label={cat.ar}
                selected={category === cat.id}
                onPress={() => setCategory(cat.id)}
              />
            ))}
          </View>

          <View style={styles.statusRow}>
            <StatusPill
              label="كاميرا (اختياري)"
              ok={previewReady && !camOff}
            />
            <StatusPill
              label="ميكروفون (اختياري)"
              ok={previewReady && !micOff}
            />
            <StatusPill label="العنوان" ok={titleReady} />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
            onPress={handleStartPress}
            disabled={!canStart || loading}
          >
            <LinearGradient
              colors={canStart ? ['#7F1D1D', '#991B1B'] : [colors.bgSurface, colors.bgSurface]}
              style={styles.startBtnInner}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <AppIcon name="broadcast" size={20} color="#fff" />
                  <Text style={styles.startBtnText}>ابدأ البث المباشر</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <LiveBroadcastPledgeModal
          visible={showPledge}
          checked={pledgeChecked}
          onToggleCheck={() => setPledgeChecked((v) => !v)}
          onConfirm={handlePledgeConfirm}
          onClose={() => !loading && setShowPledge(false)}
          confirming={loading}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  const styles = useThemedStyles(({ colors }) => createStyles(colors));
  return (
    <View style={[styles.statusPill, ok && styles.statusPillOk]}>
      <Text style={[styles.statusPillText, ok && styles.statusPillTextOk]}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenRoot },
  centered: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  muted: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  blockedIcon: { fontSize: 48 },
  blockedTitle: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  primaryCta: { marginTop: spacing.md },
  link: { ...typography.caption, color: colors.textMuted },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bgGlass,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  topTitle: { ...typography.h3, color: colors.textPrimary },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  previewBox: {
    height: 220,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  previewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
  previewTop: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  viewerPillText: { ...typography.badge, color: '#fff' },
  previewBadge: {
    backgroundColor: colors.electric,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  previewBadgeText: { ...typography.badge, color: '#fff' },
  previewSide: {
    position: 'absolute',
    left: spacing.md,
    top: '30%',
    gap: spacing.sm,
  },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  sideBtnOff: { backgroundColor: colors.liveRed },
  previewCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  allowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.electric,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
  },
  allowBtnText: { ...typography.button, color: '#fff' },
  errorBanner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.liveRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorBannerText: { ...typography.caption, color: '#fff', textAlign: 'center' },
  hint: { ...typography.caption, color: colors.textMuted, ...getRtlText(), lineHeight: 18 },
  titleInput: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    color: colors.textPrimary,
    ...typography.body,
  },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  catHeaderText: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FILTER_CHIP.gap,
    justifyContent: 'flex-end',
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  statusPillOk: { borderColor: `${colors.success}55`, backgroundColor: `${colors.success}15` },
  statusPillText: { ...typography.micro, color: colors.textMuted },
  statusPillTextOk: { color: colors.textBrandSuccess },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  startBtn: { borderRadius: radius.xl, overflow: 'hidden' },
  startBtnDisabled: { opacity: 0.45 },
  startBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 16,
    borderRadius: radius.xl,
  },
  startBtnText: { ...typography.button, color: '#fff' },
});
}
