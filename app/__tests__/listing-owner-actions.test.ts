import { readFileSync } from 'fs';
import path from 'path';

const screen = readFileSync(path.join(__dirname, '..', 'app/listing/[id].tsx'), 'utf8').replace(/\r\n/g, '\n');
const group = screen.slice(
  screen.indexOf('testID="listing-owner-actions"'),
  screen.indexOf('<ListingCommentsSection'),
);

describe('listing owner action group', () => {
  it('«بث مباشر» is hidden but its handler is kept', () => {
    expect(screen).toContain('const SHOW_LISTING_LIVE_ACTION = false;');
    expect(screen).toContain('...(SHOW_LISTING_LIVE_ACTION');
    expect(screen).toContain('const handleStartLive = () => {');
  });

  it('«سداد الرسوم» is the full-width primary pill (electric / onElectric)', () => {
    expect(screen).toContain("ownerActions.find((a) => a.key === 'pay-fee')");
    expect(screen).toMatch(/ownerPrimaryBtn: \{[^}]*backgroundColor: colors\.electric,/);
    expect(screen).toMatch(/ownerPrimaryText: \{[^}]*color: colors\.onElectric,/);
    expect(group).toContain('onPress={ownerPrimaryAction.onPress}');
  });

  it('secondaries: edit / promote, then تفضيل, then حذف last (muted red)', () => {
    const order = screen.slice(screen.indexOf('const ownerSecondaryActions'), screen.indexOf('const showOwnerMenu'));
    const rest = order.indexOf("a.key !== 'pay-fee' && !a.danger");
    const fav = order.indexOf("label: 'تفضيل'");
    const del = order.indexOf('ownerActions.filter((a) => a.danger)');
    expect(rest).toBeGreaterThan(-1);
    expect(fav).toBeGreaterThan(rest);
    expect(del).toBeGreaterThan(fav);
    expect(order).toContain("icon: isFavorited ? 'heart' : 'heart-outline'");
    expect(order).toContain('onPress: () => void handleToggleFavorite()');
    expect(screen).toMatch(/ownerToolChipDanger: \{[^}]*`\$\{colors\.rose\}14`/);
  });

  it('same handlers: fee sheet, promote, edit, delete dialog', () => {
    expect(screen).toContain('onPress: () => setFeeModalVisible(true)');
    expect(screen).toContain('onPress: () => openPromote()');
    expect(screen).toContain('onPress: handleEdit');
    expect(screen).toContain('onPress: handleDelete');
    expect(screen).toContain('<ListingDeleteDialog');
  });

  it('capsules: equal 44pt height, pill radius, subtle border, no shadow', () => {
    expect(screen).toContain('const OWNER_ACTION_HEIGHT = 44;');
    expect(screen).toMatch(/ownerToolChip: \{[^}]*minHeight: OWNER_ACTION_HEIGHT,[^}]*borderRadius: OWNER_ACTION_HEIGHT \/ 2,[^}]*borderWidth: StyleSheet\.hairlineWidth,/);
    expect(group).not.toContain('ambientShadow');
  });
});
