import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('blocked account → dialog + logout wiring', () => {
  for (const app of ['NativeWorkerApp.tsx', 'NativeCustomerApp.tsx']) {
    it(`${app} logs out through its existing handleLogout after the blocked dialog`, () => {
      const src = read(app);
      const call = src.indexOf('useAccountBlockedLogout(isLoggedIn, handleLogout)');
      expect(call).toBeGreaterThan(-1);
      // قبل از اولین return زودهنگام (قانون هوک‌ها)
      const firstEarlyReturn = src.search(/\n {2}if \([^)]*\) \{?\s*\n?\s*return/);
      expect(firstEarlyReturn === -1 || call < firstEarlyReturn).toBe(true);
    });
  }

  it('the hook shows a native dialog with the server message and logs out on OK, once per burst', () => {
    const hook = read('useAccountBlockedLogout.ts');
    expect(hook).toMatch(/onAccountBlocked\(/);
    expect(hook).toMatch(/Alert\.alert\(/);
    expect(hook).toMatch(/tryEnter\(\)/);
    expect(hook).toMatch(/onPress: [^\n]*logout/);
  });

  it('the worker portal does not ask for /orders once the account is blocked', () => {
    expect(read('NativeWorkerPortal.tsx')).toMatch(/available\.kind !== 'expired' && available\.kind !== 'blocked'/);
  });
});
