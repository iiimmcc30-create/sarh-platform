import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

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

describe('P0 design-system unification', () => {
  it('does not keep Pressable+rtlBackIcon backs outside SarhBackButton', () => {
    const offenders = production.filter((file) => {
      if (rel(file) === 'design-system/components/SarhBackButton.tsx') return false;
      const src = readFileSync(file, 'utf8');
      return src.includes('name={rtlBackIcon()}') || src.includes('icon={rtlBackIcon()}');
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('does not hardcode angle-left chevrons in app UI', () => {
    const offenders = production.filter((file) => {
      const r = rel(file);
      if (r.includes('lucideIconMap') || r.includes('flaticon') || r.includes('constants/')) {
        return false;
      }
      const src = readFileSync(file, 'utf8');
      return src.includes('name="angle-left"') || src.includes("name='angle-left'");
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it('does not keep a PrimaryButton adapter or production imports', () => {
    const usages = production.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return src.includes("from '@/components/ui/PrimaryButton'") || src.includes('<PrimaryButton');
    });
    expect(usages.map(rel)).toEqual([]);
  });

  it('does not import RtlText in production screens', () => {
    const usages = production.filter((file) => {
      return readFileSync(file, 'utf8').includes("from '@/components/ui/RtlText'");
    });
    expect(usages.map(rel)).toEqual([]);
  });

  it('does not change SarhButton wrap policy from PR #200', () => {
    const button = readFileSync(path.join(root, 'design-system/components/SarhButton.tsx'), 'utf8');
    expect(button).toContain('numberOfLines={1}');
    expect(button).toContain("flexWrap: 'nowrap'");
  });

  it('leaves Feed PostItem and tab bar outside this unification', () => {
    const post = readFileSync(path.join(root, 'components/feature/PostItem.tsx'), 'utf8');
    const tabs = readFileSync(path.join(root, 'components/navigation/FloatingTabBar.tsx'), 'utf8');
    expect(post).not.toContain('SarhCard');
    expect(tabs).not.toContain('SarhButton');
    expect(tabs).not.toContain('SarhBackButton');
  });
});
