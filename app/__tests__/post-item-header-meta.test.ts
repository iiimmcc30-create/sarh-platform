import { readFileSync } from 'fs';
import path from 'path';
import {
  POST_HANDLE_FLEX_SHRINK,
  POST_HANDLE_MIN_WIDTH,
  POST_META_FONT_SIZE,
  POST_META_LINE_HEIGHT,
} from '@/components/feature/postItemLayout';
import { INTERACTION_COUNT_FONT_SIZE } from '@/lib/interactionActions';

const src = readFileSync(path.join(__dirname, '../components/feature/PostItem.tsx'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const meta = src.slice(src.indexOf('const authorMeta = ('), src.indexOf('</UserProfileLink>', src.indexOf('const authorMeta = (')));

function style(name: string) {
  const start = src.indexOf(`    ${name}: {`);
  return src.slice(start, src.indexOf('    },', start));
}

describe('feed post header: name whole, handle shrinks, clearer meta', () => {
  it('@username + time: 13px (one step above the 12px caption), textSecondary like the counts', () => {
    expect(POST_META_FONT_SIZE).toBe(13);
    expect(POST_META_FONT_SIZE).toBeGreaterThanOrEqual(INTERACTION_COUNT_FONT_SIZE);
    expect(POST_META_LINE_HEIGHT).toBe(18);
    for (const name of ['feedHandle', 'feedTime']) {
      const s = style(name);
      expect(s).toContain('fontSize: POST_META_FONT_SIZE');
      expect(s).toContain('lineHeight: POST_META_LINE_HEIGHT');
      expect(s).toContain('color: colors.textSecondary');
    }
  });

  it('one row: the handle absorbs overflow down to «@…»; dot + time never shrink', () => {
    expect(style('feedNameRow')).toContain("flexWrap: 'nowrap'");
    expect(POST_HANDLE_FLEX_SHRINK).toBeGreaterThanOrEqual(1000);
    expect(POST_HANDLE_MIN_WIDTH).toBeGreaterThanOrEqual(20);
    const handle = style('feedHandle');
    expect(handle).toContain('flexShrink: POST_HANDLE_FLEX_SHRINK');
    expect(handle).toContain('minWidth: POST_HANDLE_MIN_WIDTH');
    expect(meta).toContain('<AppText style={styles.feedHandle} numberOfLines={1} ellipsizeMode="tail">');
    expect(style('feedTime')).toContain('flexShrink: 0');
    expect(style('metaDot')).toContain('flexShrink: 0');
    // Name: shrink factor 1 vs 1000, so it only ellipsizes when it alone overflows the row.
    expect(style('feedName')).toContain('flexShrink: 1');
    expect(meta).toContain('<AppText style={styles.feedName} numberOfLines={1}>');
    expect(meta).toContain('<View style={[styles.feedNameRow, getRtlRow()]}>');
  });

  it('keeps the detail header styles (meta line is the X-style detailMetaText)', () => {
    expect(style('handle')).toContain('color: colors.textMuted');
    expect(style('detailMetaText')).toContain('color: colors.textSecondary');
    expect(style('nameRow')).toContain("flexWrap: 'wrap'");
  });

  it('post divider: one step stronger (borderStrong) in both themes', () => {
    const wrap = style('rowWrap');
    expect(wrap).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(wrap).toContain('borderBottomColor: colors.borderStrong');
    expect(wrap).not.toContain('borderBottomColor: colors.borderHairline');
  });
});
