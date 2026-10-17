import {
  SARH_OFFICIAL_EMAIL,
  SARH_OFFICIAL_SITE,
  sarhListingShareUrl,
  sarhProfileShareUrl,
} from '@/constants/sarhOfficial';
import { readFileSync } from 'fs';
import { join } from 'path';

const identityFiles = [
  'app/info/contact.tsx',
  'app/info/terms.tsx',
  'app/info/privacy.tsx',
  'app/info/about.tsx',
  'app/info/refund.tsx',
  'app/(tabs)/profile.tsx',
  'app/users/[id].tsx',
  'app/listing/[id].tsx',
  'components/feature/StoryViewer.tsx',
  'constants/sarhOfficial.ts',
];

describe('Sarh official identity', () => {
  it('exports the approved email and site', () => {
    expect(SARH_OFFICIAL_EMAIL).toBe('sarh@sarhsa.online');
    expect(SARH_OFFICIAL_SITE).toBe('https://getsarh.com');
    expect(sarhListingShareUrl('abc')).toBe('https://getsarh.com/l/abc');
    expect(sarhProfileShareUrl('user1')).toBe('https://getsarh.com/u/user1');
  });

  it('does not keep alsfat contact identity in user-facing app pages', () => {
    for (const relative of identityFiles) {
      const source = readFileSync(join(__dirname, '..', relative), 'utf8');
      expect(source).not.toMatch(/info@alsfat\.com/);
      expect(source).not.toMatch(/https:\/\/alsfat\.com/);
      expect(source).not.toMatch(/support@safat\.app/);
    }
  });
});
