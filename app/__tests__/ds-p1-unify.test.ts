import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fontWeight } from '@/design-system';

const root = path.join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'e2e') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

function rel(file: string) {
  return path.relative(root, file);
}

const production = walk(root).filter((file) => !rel(file).startsWith('__tests__/'));

function src(fileRel: string) {
  return readFileSync(path.join(root, fileRel), 'utf8');
}

describe('P1 design-system technical debt', () => {
  it('uses official DS font weights 400/500/600/700', () => {
    expect(Object.values(fontWeight)).toEqual(['400', '500', '600', '700']);
  });

  it('has no production FilterChip / AppTextInput / PrimaryButton / RtlText / RtlTextShell imports', () => {
    const offenders = production.filter((file) => {
      const r = rel(file);
      if (r === 'components/ui/filterChipAppearance.tsx') return false;
      const text = readFileSync(file, 'utf8');
      return (
        text.includes("from '@/components/ui/FilterChip'") ||
        text.includes("from '@/components/ui/AppTextInput'") ||
        text.includes("from '@/components/ui/PrimaryButton'") ||
        text.includes("from '@/components/ui/RtlText'") ||
        text.includes("from '@/components/ui/RtlTextShell'") ||
        text.includes('<FilterChip ') ||
        text.includes('<FilterChipRow') ||
        text.includes('<AppTextInput') ||
        text.includes('<PrimaryButton') ||
        text.includes('<RtlTextShell')
      );
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('exposes SarhChipRow as the official chip scroller', () => {
    expect(src('design-system/components/SarhChipRow.tsx')).toContain('getRtlRow()');
    expect(src('design-system/components/index.ts')).toContain('SarhChipRow');
  });

  it('SarhChip covers filter appearance without dropping foundation chips', () => {
    const chip = src('design-system/components/SarhChip.tsx');
    expect(chip).toContain("appearance === 'filter'");
    expect(chip).toContain('FilterChipAppearance');
    expect(chip).toContain('resolveSarhChipColors');
    expect(chip).toContain('compact');
    expect(chip).toContain('chevron');
    expect(chip).toContain('selectedCheck');
  });

  it('SarhInput covers theme fields (ltr / error / hint) used by former AppTextInput', () => {
    const input = src('design-system/components/SarhInput.tsx');
    expect(input).toContain("appearance === 'theme'");
    expect(input).toContain('ltrInputText');
    expect(input).toContain('errorText ?? error');
    expect(input).toContain('helperText ?? hint');
  });

  it('leaves Feed, PostItem, and the tab bar outside this cleanup', () => {
    const post = src('components/feature/PostItem.tsx');
    const feed = src('app/(tabs)/posts.tsx');
    const tabs = src('components/navigation/FloatingTabBar.tsx');
    expect(post).not.toContain('SarhCard');
    expect(feed).not.toContain('SarhChip appearance="filter"');
    expect(tabs).not.toContain('SarhButton');
  });
});
