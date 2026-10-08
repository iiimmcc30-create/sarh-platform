// «المجالس» — create a council, or edit its settings (owner) when `id` is passed.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, View, type SwitchProps } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { AppIcon } from '@/components/ui/FlaticonIcon';
import { CouncilNotice } from '@/components/councils/CouncilNotice';
import { radius, spacing, type ThemeColors } from '@/constants/theme';
import { AppText, SarhButton, SarhInput } from '@/design-system/components';
import { BottomAction, Row, Screen, ScreenBody, Stack } from '@/design-system/layout';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { useTheme } from '@/hooks/useTheme';
import { safePush, safeReplace } from '@/lib/safeNavigate';
import { showToast } from '@/lib/toast';
import {
  COUNCIL_DESCRIPTION_MAX,
  COUNCIL_NAME_MAX,
  COUNCIL_RULE_MAX,
  COUNCIL_RULES_MAX,
  COUNCIL_WEB_TEXT,
  COUNCIL_FOLLOWERS_ONLY_LABEL,
  CouncilApiError,
  DEFAULT_COUNCIL_RULES,
  councilDayLabel,
  councilErrorMessage,
  councilScheduleDays,
  councilScheduleSlots,
  councilTimeLabel,
  createCouncil,
  fetchCouncil,
  fetchCouncilPerks,
  isValidCouncilName,
  isValidCouncilSchedule,
  normalizeCouncilRules,
  updateCouncil,
  type CouncilPerks,
  type CouncilVisibility,
} from '@/services/councils';

type StartMode = 'now' | 'later';
const SCHEDULE_LOCKED_TEXT = 'جدولة المجالس متاحة لمشتركي Blue+ وGold';
const FOLLOWERS_LOCKED_TEXT = 'مجالس المتابعين متاحة لمشتركي Gold';

const VISIBILITY: { value: CouncilVisibility; label: string; hint: string }[] = [
  { value: 'PUBLIC', label: 'عام', hint: 'يظهر في قائمة المجالس للجميع' },
  { value: 'PRIVATE', label: 'خاص', hint: 'بالدعوة أو الرابط فقط' },
];

/**
 * Native paints both states with `thumbColor`; react-native-web paints the "on" thumb with
 * `activeThumbColor` (teal by default) instead, so set it explicitly on web only — native is unchanged.
 */
function webActiveThumbProps(onThumb: string): Partial<SwitchProps> {
  return Platform.OS === 'web' ? ({ activeThumbColor: onThumb } as Partial<SwitchProps>) : {};
}

type ModKey = 'modCanManageRequests' | 'modCanMute' | 'modCanRemove' | 'modCanBan';
const MOD_TOGGLES: { key: ModKey; label: string }[] = [
  { key: 'modCanManageRequests', label: 'قبول ورفض طلبات التحدث' },
  { key: 'modCanMute', label: 'كتم المتحدثين' },
  { key: 'modCanRemove', label: 'إزالة المتحدثين والمستمعين' },
  { key: 'modCanBan', label: 'حظر المستخدمين' },
];

export default function CouncilFormScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(({ colors: c }) => createStyles(c));
  const params = useLocalSearchParams<{ id?: string }>();
  const editId = typeof params.id === 'string' ? params.id : '';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<CouncilVisibility>('PUBLIC');
  const [rules, setRules] = useState<string[]>(DEFAULT_COUNCIL_RULES);
  const [newRule, setNewRule] = useState('');
  const [mods, setMods] = useState<Record<ModKey, boolean>>({
    modCanManageRequests: true,
    modCanMute: true,
    modCanRemove: true,
    modCanBan: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(!editId);
  // Subscriber perks (server-decided; the server re-checks on create).
  const [perks, setPerks] = useState<CouncilPerks | null>(null);
  const [followersOnly, setFollowersOnly] = useState(false);
  const [startMode, setStartMode] = useState<StartMode>('now');
  const scheduleDays = useMemo(() => councilScheduleDays(), []);
  const [scheduleDay, setScheduleDay] = useState<Date>(() => scheduleDays[0]);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const slots = useMemo(() => councilScheduleSlots(scheduleDay), [scheduleDay]);

  useEffect(() => {
    if (editId || Platform.OS === 'web') return;
    void fetchCouncilPerks()
      .then(setPerks)
      .catch(() => setPerks({ tier: null, canFollowersOnly: false, canSchedule: false }));
  }, [editId]);

  // Keep the picked slot valid when the day changes (first free slot of that day).
  useEffect(() => {
    setScheduleAt((prev) =>
      prev && slots.some((s) => s.getTime() === prev.getTime()) ? prev : (slots[0] ?? null),
    );
  }, [slots]);

  const openPlans = useCallback(() => safePush('/verification', undefined, router), [router]);

  useEffect(() => {
    if (!editId || Platform.OS === 'web') return;
    void fetchCouncil(editId)
      .then((s) => {
        setName(s.council.name);
        setDescription(s.council.description ?? '');
        setVisibility(s.council.visibility);
        setRules(s.council.rules);
        setMods({
          modCanManageRequests: s.council.moderatorPermissions.canManageRequests,
          modCanMute: s.council.moderatorPermissions.canMute,
          modCanRemove: s.council.moderatorPermissions.canRemove,
          modCanBan: s.council.moderatorPermissions.canBan,
        });
        setLoaded(true);
      })
      .catch((err) => {
        void showToast(councilErrorMessage(err), 'error');
        router.back();
      });
  }, [editId, router]);

  const scheduling = !editId && startMode === 'later';
  const canSubmit =
    loaded &&
    isValidCouncilName(name) &&
    !submitting &&
    (!scheduling || isValidCouncilSchedule(scheduleAt));

  const addRule = useCallback(() => {
    const t = newRule.trim();
    if (!t || rules.length >= COUNCIL_RULES_MAX) return;
    setRules((r) => [...r, t.slice(0, COUNCIL_RULE_MAX)]);
    setNewRule('');
  }, [newRule, rules.length]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      visibility,
      rules: normalizeCouncilRules(rules),
      ...mods,
    };
    try {
      if (editId) {
        await updateCouncil(editId, { ...payload, description: description.trim() });
        void showToast('تم حفظ إعدادات المجلس', 'success');
        router.back();
        return;
      }
      const res = await createCouncil({
        ...payload,
        ...(followersOnly && visibility === 'PUBLIC' ? { followersOnly: true } : {}),
        ...(scheduling && scheduleAt ? { scheduledFor: scheduleAt.toISOString() } : {}),
      });
      if (res.state.council.status === 'SCHEDULED') {
        void showToast('تمت جدولة المجلس — سيظهر في «قادمة»', 'success');
        router.back();
        return;
      }
      safeReplace({ pathname: '/councils/[id]', params: { id: res.state.council.id } }, undefined, router);
    } catch (err) {
      if (err instanceof CouncilApiError && err.code === 'council_exists') {
        const existing = (err.details as { councilId?: string } | undefined)?.councilId;
        void showToast('لديك مجلس مباشر بالفعل', 'info');
        if (existing) {
          safeReplace({ pathname: '/councils/[id]', params: { id: existing } }, undefined, router);
        }
        return;
      }
      void showToast(councilErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, description, editId, followersOnly, mods, name, router, rules, scheduleAt, scheduling, visibility]);

  const visibilityControl = useMemo(
    () => (
      <Row gap="sm" style={styles.segment}>
        {VISIBILITY.map((v) => {
          const active = visibility === v.value;
          return (
            <Pressable
              key={v.value}
              onPress={() => setVisibility(v.value)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={v.label}
            >
              <AppText variant="label" color={active ? 'textPrimary' : 'textMuted'} align="center">
                {v.label}
              </AppText>
            </Pressable>
          );
        })}
      </Row>
    ),
    [styles, visibility],
  );

  if (Platform.OS === 'web') {
    return (
      <Screen edges={['top', 'bottom']}>
        <ScreenHeader variant="screen" title="المجالس" showBack />
        <CouncilNotice title="المجالس في التطبيق" message={COUNCIL_WEB_TEXT} />
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']} keyboard>
      <ScreenHeader variant="screen" title={editId ? 'إعدادات المجلس' : 'بدء مجلس'} showBack />
      <ScreenBody bottomInset="action" gap="lg">
        <SarhInput
          label="اسم المجلس"
          value={name}
          onChangeText={setName}
          placeholder="مثال: مجلس الشعر النبطي"
          maxLength={COUNCIL_NAME_MAX}
          appearance="theme"
        />
        <SarhInput
          label="وصف المجلس"
          value={description}
          onChangeText={setDescription}
          placeholder="عن ماذا سيكون الحديث؟"
          multiline
          maxLength={COUNCIL_DESCRIPTION_MAX}
          appearance="theme"
          style={styles.description}
        />

        <Stack gap="sm">
          <AppText variant="label" color="textPrimary">
            نوع المجلس
          </AppText>
          {visibilityControl}
          <AppText variant="caption" color="textMuted">
            {VISIBILITY.find((v) => v.value === visibility)?.hint}
          </AppText>
          {!editId && visibility === 'PUBLIC' && perks ? (
            <Pressable
              onPress={perks.canFollowersOnly ? () => setFollowersOnly((v) => !v) : openPlans}
              accessibilityRole="switch"
              accessibilityState={{ checked: followersOnly, disabled: !perks.canFollowersOnly }}
              style={styles.toggleRow}
              testID="council-followers-only"
            >
              <Row gap="md" align="center">
                <Stack gap="xs" style={{ flex: 1 }}>
                  <AppText variant="bodySmall" color="textPrimary">
                    {COUNCIL_FOLLOWERS_ONLY_LABEL}
                  </AppText>
                  <AppText
                    variant="caption"
                    color="textMuted"
                    style={perks.canFollowersOnly ? undefined : { color: colors.tierGold }}
                  >
                    {perks.canFollowersOnly ? 'يظهر للجميع، والانضمام لمتابعيك والمدعوين فقط' : FOLLOWERS_LOCKED_TEXT}
                  </AppText>
                </Stack>
                {perks.canFollowersOnly ? (
                  <Switch
                    value={followersOnly}
                    onValueChange={setFollowersOnly}
                    trackColor={{ false: colors.bgDeep, true: colors.electric }}
                    thumbColor={followersOnly ? colors.onElectric : '#fff'}
                    {...webActiveThumbProps(colors.onElectric)}
                  />
                ) : (
                  <AppIcon name="lock-closed-outline" size={16} color={colors.textMuted} />
                )}
              </Row>
            </Pressable>
          ) : null}
        </Stack>

        {!editId && perks ? (
          <Stack gap="sm">
            <AppText variant="label" color="textPrimary">
              موعد المجلس
            </AppText>
            <Row gap="sm" style={styles.segment}>
              {(
                [
                  { value: 'now' as const, label: 'الآن' },
                  { value: 'later' as const, label: 'لاحقاً' },
                ]
              ).map((m) => {
                const active = startMode === m.value;
                const locked = m.value === 'later' && !perks.canSchedule;
                return (
                  <Pressable
                    key={m.value}
                    onPress={() => {
                      if (locked) {
                        void showToast(SCHEDULE_LOCKED_TEXT, 'info');
                        return;
                      }
                      setStartMode(m.value);
                    }}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: locked }}
                    accessibilityLabel={m.label}
                    testID={`council-start-${m.value}`}
                  >
                    <Row gap="xs" align="center">
                      {locked ? <AppIcon name="lock-closed-outline" size={13} color={colors.textMuted} /> : null}
                      <AppText variant="label" color={active ? 'textPrimary' : 'textMuted'} align="center">
                        {m.label}
                      </AppText>
                    </Row>
                  </Pressable>
                );
              })}
            </Row>
            {!perks.canSchedule ? (
              <Pressable onPress={openPlans} hitSlop={6}>
                <AppText variant="caption" color="textMuted">
                  {SCHEDULE_LOCKED_TEXT}
                </AppText>
              </Pressable>
            ) : startMode === 'later' ? (
              <Stack gap="sm">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {scheduleDays.map((d) => {
                    const active = d.getTime() === scheduleDay.getTime();
                    return (
                      <Pressable
                        key={d.getTime()}
                        onPress={() => setScheduleDay(d)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <AppText variant="label" color={active ? 'textPrimary' : 'textSecondary'}>
                          {councilDayLabel(d)}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {slots.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {slots.map((t) => {
                      const active = scheduleAt?.getTime() === t.getTime();
                      return (
                        <Pressable
                          key={t.getTime()}
                          onPress={() => setScheduleAt(t)}
                          style={[styles.chip, active && styles.chipActive]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <AppText variant="label" color={active ? 'textPrimary' : 'textSecondary'}>
                            {councilTimeLabel(t)}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <AppText variant="caption" color="textMuted">
                    لا توجد أوقات متاحة اليوم، اختر يوماً آخر
                  </AppText>
                )}
                <AppText variant="caption" color="textMuted">
                  {scheduleAt
                    ? `يبدأ ${councilDayLabel(scheduleAt)} الساعة ${councilTimeLabel(scheduleAt)} — ونرسل تنبيهاً لمن طلب التذكير`
                    : 'اختر الوقت'}
                </AppText>
              </Stack>
            ) : null}
          </Stack>
        ) : null}

        <Stack gap="sm">
          <AppText variant="label" color="textPrimary">
            قواعد المجلس
          </AppText>
          <AppText variant="caption" color="textMuted">
            يوافق عليها كل من يدخل المجلس لأول مرة
          </AppText>
          {rules.map((rule, i) => (
            <Row key={`${i}-${rule}`} gap="sm" align="center" style={styles.ruleRow}>
              <AppText variant="bodySmall" color="textPrimary" style={{ flex: 1 }}>
                {rule}
              </AppText>
              <Pressable
                onPress={() => setRules((r) => r.filter((_, j) => j !== i))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="حذف القاعدة"
              >
                <AppIcon name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </Row>
          ))}
          {rules.length < COUNCIL_RULES_MAX ? (
            <Row gap="sm" align="center">
              <View style={{ flex: 1 }}>
                <SarhInput
                  value={newRule}
                  onChangeText={setNewRule}
                  placeholder="أضف قاعدة"
                  maxLength={COUNCIL_RULE_MAX}
                  appearance="theme"
                  onSubmitEditing={addRule}
                  returnKeyType="done"
                />
              </View>
              {/* Primary pill: its disabled state is the standard grey pill, readable in light and dark. */}
              <SarhButton
                title="إضافة"
                size="sm"
                shape="pill"
                disabled={!newRule.trim()}
                onPress={addRule}
                testID="council-add-rule"
              />
            </Row>
          ) : null}
        </Stack>

        <Stack gap="sm">
          <AppText variant="label" color="textPrimary">
            صلاحيات المشرفين
          </AppText>
          {MOD_TOGGLES.map((t) => (
            <Row key={t.key} gap="md" align="center" style={styles.toggleRow}>
              <AppText variant="bodySmall" color="textPrimary" style={{ flex: 1 }}>
                {t.label}
              </AppText>
              <Switch
                value={mods[t.key]}
                onValueChange={(v) => setMods((m) => ({ ...m, [t.key]: v }))}
                trackColor={{ false: colors.bgDeep, true: colors.electric }}
                thumbColor={mods[t.key] ? colors.onElectric : '#fff'}
                {...webActiveThumbProps(colors.onElectric)}
              />
            </Row>
          ))}
        </Stack>
      </ScreenBody>

      <BottomAction>
        <SarhButton
          title={editId ? 'حفظ' : scheduling ? 'جدولة المجلس' : 'بدء المجلس'}
          onPress={() => void onSubmit()}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
          shape="pill"
        />
      </BottomAction>
    </Screen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    description: { minHeight: 88, textAlignVertical: 'top' },
    segment: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
      borderRadius: radius.pill,
      padding: 3,
      backgroundColor: colors.bgField,
    },
    segmentBtn: {
      flex: 1,
      minHeight: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    segmentBtnActive: {
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderMid,
    },
    ruleRow: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    chips: { gap: spacing.sm, paddingVertical: 2 },
    chip: {
      minHeight: 34,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgField,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
    chipActive: {
      backgroundColor: colors.bgSurface,
      borderColor: colors.electric,
    },
    /** Same card as `ruleRow` so the rows read as cards in light (white page) and dark alike. */
    toggleRow: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: colors.bgSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSoft,
    },
  });
}
