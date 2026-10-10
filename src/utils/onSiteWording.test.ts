import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Product decision (11 Oct 2026, user's final choice): no «تحویل‌گیرنده/گیرنده» in a cleaning service.
// User-visible wording is «مشتری». Rejected interim wordings must not appear either.
// Identifiers (recipientName, contactPhone…) stay unchanged.
const root = join(__dirname, '..', '..');
const BANNED = /گیرنده|تحویل‌دهنده|تحویل دهنده|فرد حاضر در محل|هماهنگ‌کننده/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|js)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('«مشتری» instead of «تحویل‌گیرنده/گیرنده»', () => {
  const files = [
    ...walk(join(root, 'src')),
    ...walk(join(root, 'server')),
    ...readdirSync(root).filter((n) => /^App.*\.tsx$/.test(n)).map((n) => join(root, n)),
  ];
  it('no source file (customer, worker, admin, server) uses the old or rejected terms', () => {
    const hits = files.filter((f) => BANNED.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1));
    expect(hits).toEqual([]);
  });
  it('key labels use «مشتری»', () => {
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    expect(read('src/features/orders/components/OrderDetailModal.tsx')).toContain('>مشتری:<');
    const wizard = read('src/components/booking/NativeBookingWizard.tsx');
    expect(wizard).toContain('>آدرس و مشخصات مشتری<');
    expect(wizard).toContain('>نام مشتری<');
    expect(wizard).toContain('>موبایل مشتری<');
    const sheet = read('src/features/profile/components/NativeAddressManagerModal.tsx');
    expect(sheet).toContain('>نام مشتری<');
    expect(sheet).toContain('>موبایل مشتری<');
    expect(read('src/features/profile/components/AddressManagerModal.tsx')).toContain('>موبایل مشتری<');
  });
});
