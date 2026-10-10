import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// LogBox: «two children with the same key `no-order`» — sibling modals shared a fallback key.
const src = readFileSync(join(__dirname, 'components', 'OrdersScreen.tsx'), 'utf8');

describe('OrdersScreen modal keys are unique', () => {
  it('detail and rating modals use distinct fallback keys', () => {
    expect(src).toContain("key={selectedOrder?.id ?? 'no-order-detail'}");
    expect(src).toContain("key={activeRatingOrder?.id ?? 'no-order-rating'}");
    expect(src).not.toContain("'no-order'");
  });
});
