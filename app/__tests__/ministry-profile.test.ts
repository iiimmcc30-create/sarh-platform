import { readFileSync } from 'fs';
import path from 'path';
import {
  formatServiceCountLabel,
  inferServiceDeliveryChannel,
} from '@/services/officialServices';

const root = path.join(__dirname, '..');

function src(rel: string) {
  return readFileSync(path.join(root, rel), 'utf8');
}

describe('MEWA ministry profile wiring', () => {
  it('formats service counts and infers delivery channel from the real URL', () => {
    expect(formatServiceCountLabel(6)).toBe('6 خدمة');
    expect(inferServiceDeliveryChannel('https://naama.sa/services/details/abc')).toBe(
      'تطبيق نما',
    );
    expect(
      inferServiceDeliveryChannel(
        'https://anaam.mewa.gov.sa/anaam/ClinicRequestCardIssues/index',
      ),
    ).toBe('منصة أنعام');
    expect(inferServiceDeliveryChannel('')).toBeNull();
  });

  it('reuses official services, posts, and follow APIs without a chat button', () => {
    const profile = src('app/ministry/index.tsx');
    expect(profile).toContain('fetchMinistryAccount');
    expect(profile).toContain('fetchOfficialServices');
    expect(profile).toContain('fetchMinistryPosts');
    expect(src('services/officialServices.ts')).toContain('fetchUserPosts');
    expect(profile).toContain('setFollowUser');
    expect(profile).toContain('PostItem');
    expect(profile).toContain('MinistryServiceCard');
    expect(profile).toContain('متابعة');
    expect(profile).not.toContain('مراسلة');
    expect(profile).not.toContain('onMessage');
    expect(profile).not.toContain('/butchers/chat');
  });

  it('opens service details from cards and starts the official URL', () => {
    const details = src('app/ministry/services/[id].tsx');
    expect(details).toContain('fetchOfficialService');
    expect(details).toContain('بدء الخدمة');
    expect(details).toContain('Linking.openURL');
    expect(details).toContain('الخطوات');
    expect(details).toContain('الشروط');
    expect(details).toContain('المستندات المطلوبة');
    expect(details).toContain('resolveServiceChannel');
    expect(details).toContain('resolveServiceFeeLabel');
    expect(details).toContain('splitServiceLines');
  });

  it('keeps the legacy services route as a redirect into the ministry profile', () => {
    const legacy = src('app/sarh-services.tsx');
    expect(legacy).toContain('Redirect');
    expect(legacy).toContain('/ministry?tab=services');
  });
});
