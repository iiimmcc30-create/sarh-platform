import { readFileSync } from 'fs';
import { join } from 'path';

describe('join nginx route', () => {
  it('does not proxy butcher join onto the API', () => {
    const prod = readFileSync(
      join(__dirname, '../../../../nginx/nginx.prod.conf'),
      'utf8',
    );
    expect(prod).not.toContain('location = /join');
    expect(prod).not.toContain('location = /join/success');
    expect(prod).toContain('location /privacy');
  });
});
