import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

const root = path.join(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'contexts', 'hooks', 'lib', 'services', 'constants'];
// Official MEWA service copy (external ministry text) is the only allowed mention.
const ALLOWED = new Set([path.join('services', 'officialServices.ts')]);
const LEGACY = /butcher|malahem|\u0645\u0644\u062D\u0645\u0629|\u0645\u0644\u0627\u062D\u0645|butcher_order|butcher_checkout/i;

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
}

describe('legacy butcher marketplace removed from Sarh app', () => {
  it('does not keep butcher marketplace screens, stores, or join flow', () => {
    for (const rel of [
      'app/butchers',
      'app/join',
      'components/butcher',
      'services/butcherOrders.ts',
      'contexts/ButcherOwnerContext.tsx',
      'lib/butcherLocation.ts',
    ]) {
      expect(existsSync(path.join(root, rel))).toBe(false);
    }
    expect(existsSync(path.join(root, 'lib/mapLocation.ts'))).toBe(true);
  });

  it('has no butcher references left in app source', () => {
    const files: string[] = [];
    for (const dir of SOURCE_DIRS) walk(path.join(root, dir), files);
    const hits = files
      .filter((f) => !ALLOWED.has(path.relative(root, f)))
      .filter((f) => LEGACY.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(root, f));
    expect(hits).toEqual([]);
  });

  it('keeps the shared chat screen on /chat with direct threads only', () => {
    const chat = src('app/chat.tsx');
    expect(chat).toContain('useChatThreadSocket');
    expect(src('app/_layout.tsx')).toContain('name="chat"');
    expect(src('hooks/useMessageThreads.ts')).toContain("'DIRECT'");
  });

  it('does not proxy a join page on web nginx', () => {
    expect(src('nginx.web.conf')).not.toContain('location = /join');
  });

  it('preserves paid listing payment client types and screens', () => {
    const payments = src('services/payments.ts');
    expect(payments).toContain("'boost'");
    expect(payments).toContain("'promotion'");
    expect(payments).toContain('syncPaymentStatus');
    expect(src('app/listing/[id]/promote.tsx')).toContain('initiatePromotePayment');
    expect(src('app/payment/result.tsx')).toContain("context === 'boost'");
  });
});