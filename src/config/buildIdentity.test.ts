import { describe, expect, it } from 'vitest';
import { BUILD_IDENTITY, describeSourceIdentity } from './buildIdentity';

describe('source identity display', () => {
  it('keeps an unstamped bundle explicitly unknown', () => {
    expect(BUILD_IDENTITY).toEqual({ commit: null, branch: null, detached: null, dirty: null });
    const shown = describeSourceIdentity();
    expect(shown.shortCommit).toBe('نامشخص');
    expect(shown.state).toBe('منبع نامشخص');
    expect(shown.details).toContain('شاخه: نامشخص');
  });

  it('shows the captured commit, branch and uncommitted status without hiding changes', () => {
    const shown = describeSourceIdentity({ commit: 'a'.repeat(40), branch: 'fixture-branch', detached: false, dirty: true });
    expect(shown.shortCommit).toBe('aaaaaaa');
    expect(shown.state).toBe('تغییرات ثبت‌نشده');
    expect(shown.details).toContain('a'.repeat(40));
    expect(shown.details).toContain('fixture-branch');
    expect(shown.details).toContain('هنگام شروع یا ساخت');
  });

  it('distinguishes detached and invalid identity instead of substituting a claim', () => {
    const detached = describeSourceIdentity({ commit: 'b'.repeat(40), branch: null, detached: true, dirty: false });
    expect(detached.details).toContain('بدون شاخه (detached)');
    const invalid = describeSourceIdentity({ commit: 'claimed-sha', branch: 'claimed-branch', detached: false, dirty: false });
    expect(invalid.state).toBe('منبع نامشخص');
    expect(invalid.details).not.toContain('claimed');
  });
});
