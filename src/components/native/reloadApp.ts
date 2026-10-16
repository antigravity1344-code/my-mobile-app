import { DevSettings, Platform } from 'react-native';

/** Preview exit reloads the JS runtime. On web DevSettings is not the device reload path. */
export function reloadApp(): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location?.reload?.();
    return;
  }
  DevSettings.reload();
}
