import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// OrdersContext به React Native وابسته است و در محیط node رندر نمی‌شود؛ این تست‌ها سیم‌کشی را در متن فایل بررسی می‌کنند.
const source = readFileSync(join(__dirname, 'OrdersContext.tsx'), 'utf8');

function fetchOrdersDeps(): string {
  const start = source.indexOf('const fetchOrders = useCallback(');
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start);
  const end = body.indexOf('\n  }, [');
  return body.slice(end + 5, body.indexOf(']', end) + 1);
}

describe('OrdersContext wiring (F2)', () => {
  it('does not refetch from the server when the search text, tab or sort changes', () => {
    const deps = fetchOrdersDeps();
    expect(deps).not.toMatch(/searchQuery|filterTab|sortOption/);
  });

  it('filters/sorts the already-loaded list on the client', () => {
    expect(source).toMatch(/useMemo\(\s*\(\)\s*=>\s*selectCustomerOrders\(allOrders,\s*filterTab,\s*searchQuery,\s*sortOption\)/);
  });
});

describe('OrdersContext logout → login (regression review)', () => {
  it('reset forgets in-flight fetches of the previous user so the next silent refresh is not skipped', () => {
    const start = source.indexOf('const resetOrders = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('}, []);', start));
    expect(body).toMatch(/inFlightCount\.current = 0;/);
  });
});
