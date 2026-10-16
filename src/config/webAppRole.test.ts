import { describe, expect, it } from 'vitest';
import { webAppRoleFromSearch } from './webAppRole';

describe('webAppRoleFromSearch', () => {
  it('reads worker and customer from the query string', () => {
    expect(webAppRoleFromSearch('?role=worker')).toBe('worker');
    expect(webAppRoleFromSearch('role=customer')).toBe('customer');
  });

  it('ignores unknown or empty values', () => {
    expect(webAppRoleFromSearch('')).toBeNull();
    expect(webAppRoleFromSearch('?role=admin')).toBeNull();
  });
});
