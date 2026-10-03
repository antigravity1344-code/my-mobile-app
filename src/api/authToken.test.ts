import { describe, expect, it } from 'vitest';

import { attachStoredAuthToken, getApiAuthToken, setApiAuthToken } from './authToken';

describe('api auth token', () => {
  it('clears a previous token when the requested session is missing', async () => {
    setApiAuthToken('worker-token');
    await attachStoredAuthToken(
      {
        async getItem() {
          return '';
        },
      },
      'PAKSHO_CUSTOMER_TOKEN',
    );
    expect(getApiAuthToken()).toBe('');
  });
});
