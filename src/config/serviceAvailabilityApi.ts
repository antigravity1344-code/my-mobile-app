import { apiFetch } from '../api/apiClient';
import { parseDisabledServiceIds, setDisabledServiceIds } from './serviceAvailability';

/** وضعیت خدمت‌ها را از سرور می‌گیرد؛ در خطا یا پیش‌نمایش وضعیت فعلی دست‌نخورده می‌ماند. */
export async function refreshServiceAvailability(): Promise<void> {
  try {
    const ids = parseDisabledServiceIds(await apiFetch('/services/enabled'));
    if (ids) setDisabledServiceIds(ids);
  } catch {
    /* وضعیت قبلی می‌ماند */
  }
}
