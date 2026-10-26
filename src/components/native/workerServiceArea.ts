import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { parseServiceAreaCatalog, type ServiceAreaCatalog } from '../../api/serviceAreas';
import { appStorage } from '../../utils/storage';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { previewActive, previewClosing, previewGeneration, previewCanCommit } from './previewRuntime';

export type WorkerServiceArea = { cityId: string; cityName: string; neighborhoods: string[]; catalogVersion: number; version: number };
type AreaResult = { ok: true; area: WorkerServiceArea | null; catalog: ServiceAreaCatalog } | { ok: false; message: string };
export type AreaInput = { cityId: string; neighborhoods: string[]; catalogVersion: number; expectedVersion: number };
export function validAreaSelection(catalog: ServiceAreaCatalog | null, cityId: string, neighborhoods: string[]): boolean {
  const city = catalog?.cities.find(value => value.id === cityId);
  return !!city && neighborhoods.length > 0 && new Set(neighborhoods).size === neighborhoods.length && neighborhoods.every(name => city.neighborhoods.includes(name));
}
function validSavedArea(value: unknown): value is WorkerServiceArea {
  if (!value || typeof value !== 'object') return false;
  const area = value as WorkerServiceArea;
  return typeof area.cityId === 'string' && !!area.cityId && typeof area.cityName === 'string' && !!area.cityName &&
    Array.isArray(area.neighborhoods) && area.neighborhoods.length > 0 && area.neighborhoods.every(name => typeof name === 'string' && !!name) &&
    Number.isSafeInteger(area.catalogVersion) && area.catalogVersion >= 0 && Number.isSafeInteger(area.version) && area.version > 0;
}
async function requestArea(input?: AreaInput, signal?: AbortSignal): Promise<AreaResult> {
  const fallback = 'دریافت یا تأیید ذخیره محدوده انجام نشد. نوشته‌ها حفظ شدند؛ نتیجه را بازخوانی کنید.';
  const epoch = previewGeneration();
  if (previewClosing() || (input && previewActive())) return { ok: false, message: 'ذخیره محدوده در پیش‌نمایش غیرفعال است.' };
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    if (!previewCanCommit(epoch) || signal?.aborted || (input && previewActive())) return { ok: false, message: fallback };
    const result = await apiFetch('/workers/me/service-area', { signal, ...(input ? { method: 'PUT', body: JSON.stringify({
      cityId: input.cityId, neighborhoods: input.neighborhoods, catalogVersion: input.catalogVersion, expectedVersion: input.expectedVersion,
    }) } : {}) });
    if (!previewCanCommit(epoch)) return { ok: false, message: fallback };
    const catalog = result?.success === true ? parseServiceAreaCatalog(result.catalog) : null;
    if (catalog && (validSavedArea(result.area) || (!input && result.area === null))) return { ok: true, area: result.area, catalog };
    return { ok: false, message: typeof result?.message === 'string' ? result.message : fallback };
  } catch { return { ok: false, message: fallback }; }
}
export function loadWorkerServiceArea(signal?: AbortSignal): Promise<AreaResult> { return requestArea(undefined, signal); }
export function saveWorkerServiceArea(input: AreaInput, signal?: AbortSignal): Promise<AreaResult> { return requestArea(input, signal); }
