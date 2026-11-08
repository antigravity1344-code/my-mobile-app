import { apiFetch } from '../api/apiClient';
import { parseDisabledServiceIds, parseUnavailableServiceIds, setServiceAvailability } from './serviceAvailability';

/** وضعیت خدمت‌ها را از سرور می‌گیرد؛ در خطا یا پیش‌نمایش وضعیت فعلی دست‌نخورده می‌ماند. */
export async function refreshServiceAvailability(): Promise<void> {
  try {
    const response = await apiFetch('/services/enabled');
    const disabledIds = parseDisabledServiceIds(response);
    if (disabledIds) setServiceAvailability(disabledIds, parseUnavailableServiceIds(response));
  } catch {
    /* وضعیت قبلی می‌ماند */
  }
}
