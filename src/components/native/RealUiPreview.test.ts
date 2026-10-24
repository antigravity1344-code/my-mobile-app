import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'RealUiPreview.tsx'), 'utf8');

describe('preview toolbar (D-76)', () => {
  it('scenario tabs render only for the customer preview', () => {
    expect(src).toContain('{!w ? (');
    expect(src).not.toContain('workerStyles.chip');
  });
  it('worker preview keeps the default pending scenario', () => {
    const runtime = readFileSync(join(__dirname, 'previewRuntime.ts'), 'utf8');
    expect(runtime).toContain("scenario = 'PENDING'");
  });
});
