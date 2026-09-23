import { readFileSync } from 'fs';
import { join } from 'path';

describe('join public route', () => {
  it('does not proxy a butcher join page on web nginx', () => {
    const web = readFileSync(join(__dirname, '../nginx.web.conf'), 'utf8');
    expect(web).not.toContain('location = /join');
    expect(web).not.toContain('location = /join/success');
  });
});
