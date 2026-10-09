import { readFileSync } from 'fs';
import path from 'path';
import {
  VERIFIED_BADGE_COLORS,
  resolveVerifiedTier,
  verifiedBadgeColor,
} from '@/lib/verifiedBadge';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('verification badge tiers', () => {
  it('keeps legacy/unknown tiers blue and only explicit gold is gold', () => {
    expect(resolveVerifiedTier(undefined)).toBe('blue');
    expect(resolveVerifiedTier(null)).toBe('blue');
    expect(resolveVerifiedTier('blue')).toBe('blue');
    expect(resolveVerifiedTier('gold')).toBe('gold');
    expect(verifiedBadgeColor(null)).toBe('#1D9BF0');
    expect(verifiedBadgeColor('gold')).toBe(VERIFIED_BADGE_COLORS.gold);
  });

  it('the existing badge component colours by tier', () => {
    const badge = src('components/ui/VerificationBadge.tsx');
    expect(badge).toContain('tier?: string | null');
    expect(badge).toContain('verifiedBadgeColor(resolved)');
    const inline = src('components/ui/VerifiedInlineName.tsx');
    expect(inline).toContain('<VerificationBadge size={badgeSize} tier={tier} />');
  });

  it('passes the tier everywhere the badge renders for a user', () => {
    const cases: [string, string][] = [
      ['components/feature/PostItem.tsx', 'tier={post.author.verifiedTier}'],
      ['components/feature/ListingCard.tsx', 'tier={seller?.verifiedTier}'],
      ['components/feature/ProfileScreenLayout.tsx', 'tier={user.verifiedTier}'],
      ['components/feature/PostCommentsSection.tsx', 'tier={c.author.verifiedTier}'],
      ['components/feature/ListingCommentRow.tsx', 'tier={c.author.verifiedTier}'],
      ['components/feature/ProfileReplyRow.tsx', 'tier={reply.author.verifiedTier}'],
      ['components/feature/MessagesPanel.tsx', 'tier={p.verifiedTier}'],
      ['components/feature/NewMessageSheet.tsx', 'tier={item.verifiedTier}'],
      ['components/feature/AppSidebar.tsx', 'tier={me.verifiedTier}'],
      ['components/ui/UserIdentityRow.tsx', 'tier={verifiedTier}'],
      ['components/ui/MediaViewerModal.tsx', 'tier={overlay.verifiedTier}'],
      ['app/chat.tsx', 'tier={peerVerifiedTier}'],
      ['app/listing/[id].tsx', 'tier={listing.seller.verifiedTier}'],
    ];
    for (const [file, needle] of cases) {
      expect(src(file)).toContain(needle);
    }
  });
});

describe('verification page + flow', () => {
  const page = src('app/verification.tsx');
  const service = src('services/verification.ts');
  const hero = src('components/verification/VerificationHero.tsx');

  it('offers exactly Blue, Blue+ and Gold (in order) as tabs with one sliding underline', () => {
    expect(service).toContain("export type VerificationTierId = 'blue' | 'blue_plus' | 'gold';");
    expect(service).toContain("VERIFICATION_TIER_ORDER: readonly VerificationTierId[] = ['blue', 'blue_plus', 'gold']");
    expect(page).toContain('const TIERS = VERIFICATION_TIER_ORDER;');
    expect(page).toContain('<SwipeTabIndicator');
    expect(page).toContain('accessibilityRole="tab"');
    expect(service).toContain("label: 'Blue+'");
    expect(service).toContain("name: 'الشارة الزرقاء'");
    expect(service).toContain("name: 'الشارة الذهبية'");
    expect(service).toContain('defaultExtraDaily: 3');
    expect(service).toContain('defaultExtraDaily: 6');
    expect(service).toContain('defaultExtraDaily: 10');
  });

  it('Blue and Blue+ use the blue badge; only Gold is gold', () => {
    expect(service).toContain("return tier === 'gold' ? 'gold' : 'blue';");
    expect(resolveVerifiedTier('blue_plus')).toBe('blue');
    expect(verifiedBadgeColor('blue_plus')).toBe(VERIFIED_BADGE_COLORS.blue);
    expect(page).toContain('<VerificationHero tier={color}');
  });

  it('has no comparison table (removed); price, daily listings and the Gold document stay in the plan/features', () => {
    expect(page).not.toContain('styles.compare');
    expect(page).not.toContain('compareRows');
    expect(page).not.toContain('مقارنة الباقات');
    expect(page).toContain('إعلانات إضافية يومياً');
    expect(page).toContain('مستند مطلوب قبل الدفع');
  });

  it('follows the reference sheet: close, hero badge, headline, list, monthly plan, pill CTA, fine print', () => {
    const order = [
      'accessibilityLabel="إغلاق"',
      '<VerificationHero tier={color}',
      'variant="heading2"',
      'accessibilityRole="tablist"',
      'style={styles.list}',
      'style={[styles.plan, getRtlRow()]}',
      'styles.cta,',
      'styles.finePrint',
    ].map((needle) => page.indexOf(needle));
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(page).toContain("'الاشتراك والدفع'");
    expect(page).toContain('borderRadius: radius.pill');
    expect(page).toContain("name=\"information-circle-outline\"");
    expect(hero).toContain('<TierBadgeMark tier={tier}');
    expect(hero).toMatch(/<Line/);
    expect(hero).not.toMatch(/Gradient/);
  });

  it('is always dark (black) in both themes with AA-contrast text and light status bar', () => {
    expect(page).toContain("bg: '#000000'");
    expect(page).toContain("surface: '#16181C'");
    expect(page).toContain("text: '#E7E9EA'");
    expect(page).toContain("textSecondary: '#8B98A5'");
    expect(page).toContain('screen: { backgroundColor: D.bg }');
    expect(page).toContain("setStatusBarStyle('light')");
    // No theme-driven page colours.
    expect(page).not.toMatch(/colors\.screenRoot|useThemedStyles/);
    expect(page).not.toMatch(/LinearGradient|shadowOpacity|elevation:/);
  });

  it('uses the existing Payment Core checkout and subscription cancel', () => {
    expect(service).toContain('/api/payments/initiate');
    expect(service).toContain("type: 'subscription'");
    expect(service).toContain("billingCycle: 'monthly'");
    expect(service).toContain('/api/subscriptions/cancel');
    expect(page).toContain('launchPaymentCheckout(');
    expect(page).toContain("returnParams: { returnTo: 'verification' }");
  });

  it('reads prices only from the plans API (no hard-coded prices, no placeholder copy)', () => {
    expect(page).toContain('if (!plan || !plan.priceConfigured) return null;');
    expect(page).toContain('plan.monthlyPrice');
    expect(page).toContain('/ الشهر');
    expect(page).not.toContain('السعر يُعلن قريباً');
    expect(page).not.toMatch(/monthlyPrice:\s*\d/);
    expect(page).not.toMatch(/\b(29|59|99)\b/);
    expect(service).not.toMatch(/\b(29|59|99)\b/);
    // No fake reference content.
    expect(page).not.toMatch(/50%|خصم بنسبة|سنوي|Grok|yearly/i);
  });

  it('describes MANUAL monthly renewal (no auto-renew / auto-charge copy)', () => {
    expect(page).toContain('الاشتراك شهري ويُجدَّد يدوياً فقط');
    expect(page).toContain('بدون أي خصم تلقائي');
    expect(page).toContain("'جدّد الآن'");
    expect(page).toContain('إلغاء الاشتراك');
    expect(page).not.toMatch(/يتجدد تلقائي|يتجدّد تلقائي|التجديد التلقائي|اشتراك شهري متجدد/);
    expect(service).toContain('تجديد يدوي');
    expect(service).not.toContain('يتجدد في');
  });

  it('CTA adapts: subscribed / higher plan / renew / upgrade / Gold document', () => {
    expect(page).toContain("title: 'مشترك'");
    expect(page).toContain('مشترك في ${ltr(VERIFICATION_TIER_COPY[sub.tier].label)}');
    expect(page).toContain("title: 'أرفق المستند للمتابعة', onPress: goDocument");
    expect(page).toContain("title: 'المستند قيد المراجعة'");
    expect(page).toContain("title: 'الترقية والدفع'");
  });

  it('shows verification (Gold only) + subscription + badge status', () => {
    expect(page).toContain('VERIFICATION_STATE_LABEL_AR[goldVerificationState]');
    expect(page).toContain('subscriptionStateLabelAr(sub)');
    expect(service).toContain('ملغى · فعّال حتى');
    expect(service).toContain('منتهي');
    expect(service).toContain("pending_review: 'قيد المراجعة'");
  });

  it('registers the route and returns there after payment', () => {
    expect(src('app/_layout.tsx')).toContain('<Stack.Screen name="verification" />');
    expect(src('app/payment/result.tsx')).toContain("params.returnTo === 'verification'");
  });

  it('Gold requires a document before payment; Blue and Blue+ need none', () => {
    const form = src('app/support/verification.tsx');
    expect(form).toContain('GOLD_REQUIREMENTS');
    expect(form).toContain("const tier: Tier = 'gold';");
    expect(form).toContain('requestedTier: tier');
    expect(form).toContain('صورة السجل التجاري');
    expect(form).toContain('باقتا Blue وBlue+ لا تحتاجان أي مستند');
    expect(page).toContain('مستند مطلوب قبل الدفع');
    expect(page).toContain('const docLocked = docRequired && !goldReady;');
    expect(page).toContain("status?.goldDocument?.ready === true");
    expect(page).toContain('بدون مستندات أو تحقق هوية');
    expect(service).toContain('return plan?.documentRequired ?? plan?.verificationRequired ?? tier === \'gold\';');
    // The API error code for a missing Gold document reaches the page.
    expect(service).toContain("code: typeof json.error === 'string' ? json.error : undefined");
    expect(page).toContain("res.code?.startsWith('gold_')");
  });
});
