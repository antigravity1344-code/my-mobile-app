export interface SourceIdentity {
  commit: string | null;
  branch: string | null;
  detached: boolean | null;
  dirty: boolean | null;
}

// Babel replaces only this literal with the Git snapshot captured for this bundle.
export const BUILD_IDENTITY: SourceIdentity = { commit: null, branch: null, detached: null, dirty: null };

export function describeSourceIdentity(identity: SourceIdentity = BUILD_IDENTITY) {
  const commit = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(identity.commit || '') ? identity.commit : null;
  const branch = commit ? (identity.detached ? 'بدون شاخه (detached)' : identity.branch || 'نامشخص') : 'نامشخص';
  const state = !commit || identity.dirty == null ? 'منبع نامشخص'
    : identity.dirty ? 'تغییرات ثبت‌نشده' : 'بدون تغییر ثبت‌نشده';
  return {
    shortCommit: commit?.slice(0, 7) || 'نامشخص',
    state,
    details: `نسخه: ${commit || 'نامشخص'}\nشاخه: ${branch}\nوضعیت: ${state}\nشناسه هنگام شروع یا ساخت ثبت شده است.`,
  };
}
