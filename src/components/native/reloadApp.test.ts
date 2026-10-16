import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  DevSettings: { reload: vi.fn() },
}));

import { DevSettings } from 'react-native';
import { reloadApp } from './reloadApp';

describe('reloadApp', () => {
  it('does not call native DevSettings on web', () => {
    const reload = vi.fn();
    vi.stubGlobal('window', { location: { reload } });
    reloadApp();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(DevSettings.reload).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
