import { readFileSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('Fee payment (سداد الرسوم) redesign', () => {
  const sheet = src('components/listing/ListingFeePaymentSheet.tsx');
  const logos = src('components/payment/PaymentBrandLogos.tsx');
  const fees = src('app/fees.tsx');

  it('keeps the payment flow untouched: quote → initiate → hosted checkout', () => {
    expect(sheet).toContain('const quoted = await quoteListingFee({ listingId, saleAmount: parsed });');
    expect(sheet).toContain('amount: quoted.data.commission,');
    expect(sheet).toContain("context: 'commission',");
    expect(sheet).toContain('returnParams: { listingId },');
    expect(sheet).toContain("if (outcome === 'paid' || outcome === 'opened') {");
    expect(sheet).toContain("const [method, setMethod] = useState<NIPaymentMethod>('mada');");
    expect(fees).toContain("const paid = fee.status === 'paid';");
    expect(fees).toContain('onPress={() => setPayListingId(fee.listingId)}');
    expect(fees).toContain("authFetch(`${API_BASE}/api/fees`)");
  });

  it('is an iOS checkout sheet: shared SheetModal, grouped radio list, pinned capsule CTA, no gradient', () => {
    expect(sheet).toContain('<SheetModal');
    expect(sheet).not.toContain('<Modal');
    expect(sheet).not.toContain('LinearGradient');
    expect(sheet).toContain('dismissible={!processing}');
    expect(sheet).toContain('accessibilityRole="radio"');
    expect(sheet).toContain('shape="pill"');
    expect(sheet).toContain('lock-closed-outline');
    expect(sheet).toContain('onElectric');
  });

  it('draws the official brand marks as vectors (react-native-svg, no new deps)', () => {
    expect(logos).toContain("from 'react-native-svg'");
    for (const hex of ['#259BD6', '#84B740', '#1A1F71', '#EB001B', '#F79E1B', '#FF5F00', '#4F008C', '#03BB86']) {
      expect(logos).toContain(hex);
    }
    expect(logos).toContain('APPLE_PAY_PATH');
    expect(logos).not.toMatch(/<Text/);
    const pkg = JSON.parse(src('package.json'));
    expect(pkg.dependencies['react-native-svg']).toBeDefined();
  });

  it('offers the same payment methods as before', () => {
    const ids = [...logos.matchAll(/\{ id: '([a-z_]+)', labelAr:/g)].map((m) => m[1]);
    expect(ids).toEqual(['mada', 'visa', 'apple_pay', 'stc_pay']);
  });
});
