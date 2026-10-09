/**
 * «التوثيق» hub (/settings/verification) — pure model, unit-tested.
 *
 * X Premium-style settings for the verification subscription: a tier header,
 * the billing line, «إدارة الاشتراك», then one flat row per real perk with its
 * live usage, and the two visibility switches. Non-subscribers get «غير موثّق»,
 * the trial offer, a compact Blue / Blue+ / Gold comparison and «ترقية».
 *
 * Store rules: App Store / Google Play subscriptions are managed in the store
 * (never the N-Genius cancel). When digital purchases are switched off
 * (lib/storePurchases.ts) every upgrade / comparison / trial / price row is
 * dropped; status, usage and switches stay for existing subscribers.
 */
import {
  VERIFICATION_TIER_COPY,
  VERIFICATION_TIER_ORDER,
  formatArabicDate,
  isStoreBillingSource,
  type BillingSource,
  type VerificationPlan,
  type VerificationStatus,
  type VerificationTierId,
} from '@/services/verification';

export const VERIFICATION_HUB_TITLE = 'التوثيق';
export const VERIFICATION_HUB_ROUTE = '/settings/verification';

export type HubAction =
  | 'manage-store'
  | 'renew'
  | 'cancel-renewal'
  | 'payments'
  | 'free-boosts'
  | 'daily-listings'
  | 'profile-views'
  | 'support'
  | 'councils'
  | 'gold-document'
  | 'upgrade-gold'
  | 'upgrade'
  | 'trial'
  | 'toggle-hide-badge'
  | 'toggle-hide-gold-label';

export type HubRow = {
  key: string;
  icon: string;
  title: string;
  description?: string;
  value?: string;
  /** Inline switch rows. */
  switchValue?: boolean;
  action?: HubAction;
  tone?: 'default' | 'danger';
};

export type HubSection = { key: string; title?: string; rows: HubRow[]; footer?: string };

export type HubHeader = {
  /** null = «غير موثّق» (no badge mark). */
  badge: 'blue' | 'gold' | null;
  title: string;
  stateLine: string;
};

export type HubModel = {
  subscribed: boolean;
  tier: VerificationTierId | null;
  header: HubHeader;
  sections: HubSection[];
  /** Primary pill under the header («ترقية» / «جرّب مجاناً»), or null. */
  cta: { title: string; action: HubAction } | null;
};

export type HubInput = {
  status: VerificationStatus | null;
  /** Build flag: digital purchases visible (upgrade / comparison / trial / price). */
  purchasesEnabled: boolean;
  /** Store-localized monthly prices by tier (native), when known. */
  storePrices?: Partial<Record<VerificationTierId, string>>;
  /** Native app (prices come from the store, purchases through IAP). */
  storeBilling?: boolean;
};

const STORE_NAME: Record<'app_store' | 'google_play', string> = {
  app_store: 'App Store',
  google_play: 'Google Play',
};

/** Latin labels / "+N" inside RTL text keep their order. */
const ltr = (text: string) => `\u2066${text}\u2069`;

function arabicCount(n: number): string {
  return n.toLocaleString('ar-SA');
}

/** «Blue» / «Blue+» / «Gold». */
export function tierLabel(tier: VerificationTierId): string {
  return VERIFICATION_TIER_COPY[tier].label;
}

/** Billing source the hub acts on (older API builds: infer web for paid plans). */
export function billingSourceOf(status: VerificationStatus | null): BillingSource {
  const source = status?.billing?.source;
  if (source) return source;
  const sub = status?.subscription;
  if (!sub?.tier) return 'none';
  return sub.isTrial ? 'trial' : 'ngenius';
}

/** Subscribed for the hub: active, cancelled-but-running, grace, or trial. */
export function hubSubscribedTier(status: VerificationStatus | null): VerificationTierId | null {
  const sub = status?.subscription;
  if (!sub?.tier) return null;
  if (sub.state === 'active' || sub.state === 'canceled' || sub.state === 'grace_period') return sub.tier;
  return null;
}

function priceFor(
  tier: VerificationTierId,
  plans: VerificationPlan[],
  input: HubInput,
): string | null {
  if (input.storeBilling) return input.storePrices?.[tier] ?? null;
  const plan = plans.find((p) => p.tier === tier);
  if (!plan?.priceConfigured) return null;
  const amount = Number.isInteger(plan.monthlyPrice) ? String(plan.monthlyPrice) : plan.monthlyPrice.toFixed(2);
  return `${amount} ر.س`;
}

/** One-line perk summary per tier for the comparison rows (real perks only). */
export function tierComparisonLine(tier: VerificationTierId, plan?: VerificationPlan): string {
  const extra = plan?.extraDailyListings ?? VERIFICATION_TIER_COPY[tier].defaultExtraDaily;
  const parts = [
    tier === 'gold' ? 'شارة ذهبية' : 'شارة زرقاء',
    `${ltr(`+${extra}`)} إعلانات يومياً`,
    'من شاهد ملفك',
  ];
  if (tier === 'blue_plus') parts.push('تمييزان مجانيان أسبوعياً', 'جدولة المجالس');
  if (tier === 'gold') parts.push('٤ تمييزات مجانية أسبوعياً', '«بائع ذهبي» وأولوية في منطقتك', 'دعم بأولوية');
  return parts.join(' · ');
}

function stateLine(status: VerificationStatus, source: BillingSource): string {
  const sub = status.subscription;
  const until = formatArabicDate(status.billing?.expiresAt ?? sub.renewDate);
  if (source === 'trial' || sub.isTrial) {
    const days = status.trial?.daysLeft;
    return days != null ? `تجربة مجانية · باقي ${arabicCount(days)} ${days === 1 ? 'يوم' : 'أيام'}` : 'تجربة مجانية';
  }
  if (sub.state === 'grace_period') return 'انتهت الفترة · مهلة التجديد قبل إيقاف المزايا';
  if (sub.state === 'canceled') return until ? `ملغى · المزايا فعّالة حتى ${until}` : 'ملغى';
  return 'فعّال';
}

function billingLine(status: VerificationStatus, source: BillingSource): string | null {
  const sub = status.subscription;
  const until = formatArabicDate(status.billing?.expiresAt ?? sub.renewDate);
  if (!until) return null;
  if (isStoreBillingSource(source)) {
    const autoRenew = status.billing?.autoRenew ?? sub.autoRenew;
    return autoRenew
      ? `يتجدد تلقائياً في ${until} عبر ${STORE_NAME[source]}`
      : `ينتهي في ${until} · التجديد التلقائي متوقف في ${STORE_NAME[source]}`;
  }
  if (source === 'trial') return `تنتهي التجربة في ${until} بلا أي خصم`;
  if (sub.state === 'grace_period') return `انتهى في ${until} · جدّد للاحتفاظ بالشارة والمزايا`;
  if (sub.state === 'canceled') return `ينتهي في ${until} · لن يتجدد`;
  return `ينتهي في ${until} · التجديد يدوي بدفعة جديدة`;
}

function remainingBoostsLabel(n: number): string {
  if (n === 0) return 'لا يوجد';
  if (n === 1) return 'تمييز واحد';
  if (n === 2) return 'تمييزان';
  return `${arabicCount(n)} تمييزات`;
}

export function buildVerificationHub(input: HubInput): HubModel {
  const { status, purchasesEnabled } = input;
  const plans = status?.plans ?? [];
  const tier = hubSubscribedTier(status);
  const source = billingSourceOf(status);

  if (!status || !tier) {
    return buildNonSubscriber(input, plans);
  }

  const sub = status.subscription;
  const badgeVisible = status.badge?.visible ?? true;
  const badgeColor: 'blue' | 'gold' =
    status.badge?.color === 'gold' || (status.badge?.color == null && tier === 'gold' && status.verification?.approvedTier === 'gold')
      ? 'gold'
      : 'blue';
  const perks = status.perks ?? null;
  const prefs = status.preferences ?? { hideVerifiedBadge: false, hideGoldSellerLabel: false };

  // ── Subscription ──
  const subRows: HubRow[] = [];
  const line = billingLine(status, source);
  if (isStoreBillingSource(source)) {
    subRows.push({
      key: 'manage',
      icon: 'card-outline',
      title: 'إدارة الاشتراك',
      description: line ?? `أدِر اشتراكك أو ألغه من ${STORE_NAME[source]}.`,
      value: STORE_NAME[source],
      action: 'manage-store',
    });
  } else if (source === 'trial') {
    subRows.push({
      key: 'manage',
      icon: 'time-outline',
      title: 'التجربة المجانية',
      description: line ?? 'تنتهي وحدها بلا أي خصم.',
    });
    if (purchasesEnabled) {
      subRows.push({
        key: 'subscribe-after-trial',
        icon: 'badge-check',
        title: `اشترك في ${ltr('Blue+')} للاستمرار`,
        description: 'احتفظ بالشارة والمزايا بعد انتهاء التجربة.',
        action: 'upgrade',
      });
    }
  } else {
    subRows.push({
      key: 'manage',
      icon: 'card-outline',
      title: 'إدارة الاشتراك',
      description: line ?? 'اشتراك شهري بتجديد يدوي.',
    });
    if (purchasesEnabled && (sub.state === 'grace_period' || sub.state === 'canceled')) {
      subRows.push({
        key: 'renew',
        icon: 'refresh',
        title: 'جدّد الآن',
        description: 'ادفع الشهر القادم لتبقى الشارة والمزايا.',
        action: 'renew',
      });
    }
    if (sub.state === 'active') {
      subRows.push({
        key: 'cancel-renewal',
        icon: 'close-circle-outline',
        title: 'إلغاء التجديد',
        description: 'تبقى الشارة والمزايا حتى نهاية الفترة المدفوعة، ولن نرسل تذكيرات.',
        action: 'cancel-renewal',
        tone: 'danger',
      });
    }
  }
  subRows.push({
    key: 'payments',
    icon: 'receipt-outline',
    title: 'سجل المدفوعات',
    description: 'فواتير الاشتراك وكل مدفوعاتك في سرح.',
    action: 'payments',
  });
  if (purchasesEnabled && tier !== 'gold') {
    subRows.push({
      key: 'upgrade-gold',
      icon: 'trending-up-outline',
      title: `ترقية إلى ${ltr('Gold')}`,
      description: 'شارة ذهبية و«بائع ذهبي» وأعلى أولوية ظهور و٤ تمييزات مجانية أسبوعياً.',
      action: 'upgrade-gold',
    });
  }

  // ── Perks (live usage) ──
  const perkRows: HubRow[] = [];
  const boosts = perks?.freeBoosts;
  if (boosts && boosts.limit > 0) {
    const reset = formatArabicDate(boosts.nextResetAt);
    perkRows.push({
      key: 'free-boosts',
      icon: 'rocket-outline',
      title: 'التمييز المجاني الأسبوعي',
      description:
        boosts.remaining > 0
          ? `متبقٍ ${remainingBoostsLabel(boosts.remaining)} من ${arabicCount(boosts.limit)} هذا الأسبوع · تمييز ٢٤ ساعة لأي إعلان.`
          : `استخدمت ${arabicCount(boosts.limit)} من ${arabicCount(boosts.limit)}${reset ? ` · يتجدد ${reset}` : ''}.`,
      value: `${arabicCount(boosts.remaining)}/${arabicCount(boosts.limit)}`,
      action: 'free-boosts',
    });
  }
  const daily = perks?.dailyListings;
  perkRows.push({
    key: 'daily-listings',
    icon: 'add-circle-outline',
    title: 'الإعلانات اليومية',
    description: daily
      ? `نشرت ${arabicCount(daily.used)} من ${arabicCount(daily.limit)} خلال آخر ٢٤ ساعة.`
      : `${ltr(`+${VERIFICATION_TIER_COPY[tier].defaultExtraDaily}`)} إعلانات فوق الحد الأساسي كل ٢٤ ساعة.`,
    value: daily ? `${arabicCount(daily.used)}/${arabicCount(daily.limit)}` : undefined,
    action: 'daily-listings',
  });
  perkRows.push({
    key: 'visibility',
    icon: 'trending-up-outline',
    title: 'أولوية الظهور',
    description:
      tier === 'gold'
        ? 'أعلى ترتيب لإعلاناتك، وتتصدّر نتائج منطقتك عند البحث فيها.'
        : tier === 'blue_plus'
          ? `إعلاناتك قبل مشتركي ${ltr('Blue')} والحسابات العادية في الترتيب ونتائج البحث.`
          : 'إعلاناتك قبل الحسابات العادية في الترتيب ونتائج البحث.',
    value: VERIFICATION_TIER_COPY[tier].visibilityShort,
  });
  const views = perks?.profileViews30d;
  perkRows.push({
    key: 'profile-views',
    icon: 'eye-outline',
    title: 'من شاهد ملفك',
    description: views
      ? `${arabicCount(views.count)} ${views.count === 1 ? 'زائر' : 'زوار'} خلال آخر ٣٠ يوماً.`
      : 'اطّلع على زوار ملفك خلال آخر ٣٠ يوماً.',
    value: views ? arabicCount(views.count) : undefined,
    action: 'profile-views',
  });
  if (tier === 'gold') {
    perkRows.push({
      key: 'priority-support',
      icon: 'lifebuoy',
      title: 'دعم بأولوية',
      description: 'تذاكرك تصل لفريق الدعم بأولوية عالية.',
      action: 'support',
    });
  }
  const councils = perks?.councils ?? {
    canSchedule: tier !== 'blue',
    canFollowersOnly: tier === 'gold',
  };
  if (councils.canSchedule || councils.canFollowersOnly) {
    perkRows.push({
      key: 'councils',
      icon: 'mic',
      title: 'المجالس',
      description: councils.canFollowersOnly
        ? 'جدولة مجالسك مسبقاً، ومجالس للمتابعين فقط.'
        : 'جدولة مجالسك مسبقاً.',
      action: 'councils',
    });
  }
  if (tier === 'gold' && status.verification?.approvedTier !== 'gold') {
    perkRows.push({
      key: 'gold-document',
      icon: 'document-text-outline',
      title: 'توثيق التاجر',
      description: 'تظهر الشارة الذهبية بعد قبول السجل التجاري.',
      action: 'gold-document',
    });
  }

  // ── Visibility switches ──
  const switchRows: HubRow[] = [
    {
      key: 'hide-badge',
      icon: 'badge-check',
      title: 'إخفاء الشارة',
      description: 'لا تظهر شارة التوثيق للآخرين في ملفك وإعلاناتك ومنشوراتك. تبقى أولوية الظهور وكل المزايا.',
      switchValue: prefs.hideVerifiedBadge,
      action: 'toggle-hide-badge',
    },
  ];
  if (badgeColor === 'gold' && tier === 'gold') {
    switchRows.push({
      key: 'hide-gold-label',
      icon: 'ribbon',
      title: 'إخفاء «بائع ذهبي»',
      description: 'تبقى الشارة الذهبية، ويختفي وصف «بائع ذهبي» تحت اسمك.',
      switchValue: prefs.hideGoldSellerLabel,
      action: 'toggle-hide-gold-label',
    });
  }

  const tierName = tierLabel(tier);
  return {
    subscribed: true,
    tier,
    header: {
      badge: badgeVisible || prefs.hideVerifiedBadge ? badgeColor : null,
      title: tierName,
      stateLine: stateLine(status, source),
    },
    sections: [
      { key: 'subscription', title: 'الاشتراك', rows: subRows },
      { key: 'perks', title: 'المزايا', rows: perkRows },
      {
        key: 'visibility',
        title: 'الظهور',
        rows: switchRows,
        footer: 'تُطبَّق على ما يراه الآخرون فقط، وتبقى الشارة ظاهرة لك.',
      },
    ],
    cta: null,
  };
}

function buildNonSubscriber(input: HubInput, plans: VerificationPlan[]): HubModel {
  const { status, purchasesEnabled } = input;
  const sections: HubSection[] = [];
  const trialEligible = purchasesEnabled && !!status?.trial?.eligible;
  const expiredTier =
    status?.subscription?.state === 'expired' && status.subscription.tier ? status.subscription.tier : null;

  if (purchasesEnabled) {
    if (trialEligible) {
      sections.push({
        key: 'trial',
        rows: [
          {
            key: 'trial',
            icon: 'gift-outline',
            title: `جرّب ${ltr('Blue+')} مجاناً لأسبوع`,
            description: 'بدون بطاقة ولا أي خصم، وتنتهي وحدها. مرة واحدة لكل حساب.',
            action: 'trial',
          },
        ],
      });
    }
    sections.push({
      key: 'compare',
      title: 'قارن الباقات',
      rows: VERIFICATION_TIER_ORDER.map((t) => {
        const plan = plans.find((p) => p.tier === t);
        const price = priceFor(t, plans, input);
        return {
          key: `compare-${t}`,
          icon: 'badge-check',
          title: tierLabel(t),
          description: tierComparisonLine(t, plan),
          value: price ? `${price} / شهر` : undefined,
          action: 'upgrade' as const,
        };
      }),
      footer: input.storeBilling
        ? 'اشتراك شهري يتجدد تلقائياً عبر المتجر حتى تلغيه.'
        : 'اشتراك شهري بتجديد يدوي، بدون أي خصم تلقائي.',
    });
  }
  sections.push({
    key: 'account',
    rows: [
      {
        key: 'payments',
        icon: 'receipt-outline',
        title: 'سجل المدفوعات',
        description: 'كل مدفوعاتك في سرح.',
        action: 'payments',
      },
    ],
  });

  return {
    subscribed: false,
    tier: null,
    header: {
      badge: null,
      title: 'غير موثّق',
      stateLine: expiredTier
        ? `انتهى اشتراك ${tierLabel(expiredTier)}`
        : purchasesEnabled
          ? 'وثّق حسابك لتظهر الشارة وتزيد إعلاناتك وظهورك.'
          : 'التوثيق غير متاح في هذا الإصدار من التطبيق.',
    },
    sections,
    cta: purchasesEnabled
      ? trialEligible
        ? { title: `جرّب ${ltr('Blue+')} مجاناً`, action: 'trial' }
        : { title: expiredTier ? 'جدّد الاشتراك' : 'ترقية', action: 'upgrade' }
      : null,
  };
}
