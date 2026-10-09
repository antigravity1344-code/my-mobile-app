import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');

function resolveImport(fromFile: string, spec: string): string | null {
  const base = normalize(join(dirname(fromFile), spec));
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableFiles(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+'(\.[^']+)'/g)) {
      const resolved = resolveImport(file, match[1]!);
      if (resolved) stack.push(resolved);
    }
  }
  return [...seen];
}

describe('worker app providers (F11)', () => {
  const entry = join(ROOT, 'App.worker.tsx');

  it('does not mount the customer OrdersProvider (it reads the customer token/user)', () => {
    expect(readFileSync(entry, 'utf8')).not.toMatch(/OrdersProvider/);
  });

  it('nothing reachable from the worker app calls useOrders()', () => {
    const callers = reachableFiles(entry).filter((file) => /\buseOrders\(/.test(readFileSync(file, 'utf8')));
    expect(callers).toEqual([]);
  });
});
