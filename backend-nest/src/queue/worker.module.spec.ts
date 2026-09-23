import { readFileSync } from 'fs';
import path from 'path';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { QueueModule } from './queue.module';
import { WorkerModule } from './worker.module';

function moduleImports(metatype: object): unknown[] {
  return (Reflect.getMetadata(MODULE_METADATA.IMPORTS, metatype) ??
    []) as unknown[];
}

describe('WorkerModule import graph', () => {
  it('exports defined Nest modules (no circular undefined imports)', () => {
    expect(QueueModule).toBeDefined();
    expect(WorkerModule).toBeDefined();
  });

  it('WorkerModule imports QueueModule without an undefined slot', () => {
    const imports = moduleImports(WorkerModule);
    expect(imports.every((entry) => entry != null)).toBe(true);
    expect(imports).toContain(QueueModule);
  });

  it('does not import butcher Daftra into the worker graph', () => {
    const src = readFileSync(path.join(__dirname, 'worker.module.ts'), 'utf8');
    expect(src).not.toContain('DaftraModule');
  });
});
