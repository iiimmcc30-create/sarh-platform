import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COMMISSION_REMINDER_TITLE,
  commissionReminderNote,
  listingCommissionPercent,
  shouldShowCommissionReminder,
} from '@/lib/listingDeleteReminder';
import { calculateCommission } from '@/services/commissions';

const root = join(__dirname, '..');
const dialog = readFileSync(join(root, 'components/listing/ListingDeleteDialog.tsx'), 'utf8');
const screen = readFileSync(join(root, 'app/listing/[id].tsx'), 'utf8');

describe('listing delete commission reminder', () => {
  it('shows only when sold and fees apply', () => {
    const base = { feesEnabled: true, managedListing: false };
    expect(shouldShowCommissionReminder({ ...base, sold: true })).toBe(true);
    expect(shouldShowCommissionReminder({ ...base, sold: false })).toBe(false);
    expect(shouldShowCommissionReminder({ ...base, sold: null })).toBe(false);
    expect(shouldShowCommissionReminder({ ...base, sold: true, feesEnabled: false })).toBe(false);
    expect(shouldShowCommissionReminder({ ...base, sold: true, managedListing: true })).toBe(false);
    expect(shouldShowCommissionReminder({ ...base, sold: true, feePaid: true })).toBe(false);
  });

  it('reads the commission percent from calculateCommission (not hardcoded)', () => {
    expect(listingCommissionPercent('camels')).toBe(calculateCommission('camels', 100).commission);
    expect(listingCommissionPercent(undefined)).toBe(calculateCommission('sheep', 100).commission);
    expect(commissionReminderNote(1)).toContain('1٪');
    expect(commissionReminderNote(1)).toContain('اختيارية');
  });

  it('dialog routes sold + reminder to the reminder step; not-sold deletes directly', () => {
    expect(COMMISSION_REMINDER_TITLE).toBe('إذا بعت، لا تنسى عمولة سرح — ذمة وأمانة 🤍');
    expect(dialog).toMatch(/if \(sold === true && commissionReminder\) \{\s*setStep\('reminder'\);\s*return;/);
    expect(dialog).toMatch(/onConfirm\(\{ sold, reason: reason\.trim\(\) \}\)/);
    expect(dialog).toContain('COMMISSION_REMINDER_TITLE');
    expect(dialog).toContain('Animated.timing(reminderAnim');
    expect(dialog).toContain('SheetModal');
  });

  it('«لاحقاً» proceeds to delete as sold', () => {
    expect(dialog).toMatch(/const handleLater = \(\) => \{\s*onConfirm\(\{ sold: true, reason: reason\.trim\(\) \}\);/);
    expect(dialog).toMatch(/title="لاحقاً"[\s\S]*?onPress=\{handleLater\}/);
  });

  it('«سدّد الآن» opens the existing fee sheet', () => {
    expect(dialog).toMatch(/title="سدّد الآن" onPress=\{handlePayNow\}/);
    expect(dialog).toMatch(/const handlePayNow = \(\) => \{[\s\S]*?onPayCommission\?\.\(\);/);
    expect(screen).toMatch(/onPayCommission=\{\(\) => \{[\s\S]*?setFeeModalVisible\(true\)/);
    expect(screen).toContain('feesEnabled: paidFlags.listingFeesEnabled');
    expect(screen).toContain('managedListing: isManagedListing(listing)');
    expect(screen).toContain('listingCommissionPercent(listing.category)');
  });
});
