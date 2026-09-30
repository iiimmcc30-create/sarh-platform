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
      ['components/feature/ListingCommentsSection.tsx', 'tier={c.author.verifiedTier}'],
      ['components/feature/ListingCommentsModal.tsx', 'tier={c.author.verifiedTier}'],
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

  it('offers exactly the Blue and Gold plans', () => {
    expect(page).toContain("const TIERS: VerificationTierId[] = ['blue', 'gold'];");
    expect(service).toContain("name: 'الشارة الزرقاء'");
    expect(service).toContain("name: 'الشارة الذهبية'");
    expect(service).toContain('defaultExtraDaily: 3');
    expect(service).toContain('defaultExtraDaily: 6');
  });

  it('uses the existing Payment Core checkout and subscription cancel', () => {
    expect(service).toContain('/api/payments/initiate');
    expect(service).toContain("type: 'subscription'");
    expect(service).toContain("billingCycle: 'monthly'");
    expect(service).toContain('/api/subscriptions/cancel');
    expect(page).toContain('launchPaymentCheckout(');
    expect(page).toContain("returnParams: { returnTo: 'verification' }");
  });

  it('never invents prices: shows a placeholder when the plan price is not set', () => {
    expect(page).toContain("if (!plan || !plan.priceConfigured) return 'السعر يُعلن قريباً';");
    expect(page).toContain("'الاشتراك غير متاح بعد'");
    expect(page).not.toMatch(/monthlyPrice:\s*\d/);
  });

  it('is typographic: no cards, gradients or heavy shadows', () => {
    expect(page).not.toMatch(/SarhCard|LinearGradient|shadowOpacity|elevation:/);
    expect(page).toContain('<SarhDivider />');
    expect(page).toContain('backgroundColor: colors.screenRoot');
  });

  it('shows verification + subscription status', () => {
    expect(page).toContain('VERIFICATION_STATE_LABEL_AR[verification.state]');
    expect(page).toContain('subscriptionStateLabelAr(sub)');
    expect(service).toContain('ملغى · فعّال حتى');
    expect(service).toContain('منتهي');
    expect(service).toContain("pending_review: 'قيد المراجعة'");
  });

  it('registers the route and returns there after payment', () => {
    expect(src('app/_layout.tsx')).toContain('<Stack.Screen name="verification" />');
    expect(src('app/payment/result.tsx')).toContain("params.returnTo === 'verification'");
  });

  it('gold verification asks for merchant info', () => {
    const form = src('app/support/verification.tsx');
    expect(form).toContain('GOLD_REQUIREMENTS');
    expect(form).toContain('requestedTier: tier');
    expect(form).toContain('صورة السجل التجاري');
  });
});
