import { apiFetch } from './apiClient';
import { previewClosing, previewGeneration, previewCanCommit } from '../components/native/previewRuntime';

export type ServiceCity = { id: string; name: string; neighborhoods: string[] };
export type ServiceAreaCatalog = { version: number; defaultCityId: string; cities: ServiceCity[] };
export type CityAddress = { cityId?: string; city?: string; district?: string; fullAddress?: string };
export function parseServiceAreaCatalog(value: unknown): ServiceAreaCatalog | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as ServiceAreaCatalog;
  if (!Number.isSafeInteger(data.version) || data.version < 0 || !Array.isArray(data.cities) || !data.cities.length ||
      data.cities.some(city => !city || typeof city.id !== 'string' || !city.id || typeof city.name !== 'string' || !city.name ||
        !Array.isArray(city.neighborhoods) || city.neighborhoods.some(name => typeof name !== 'string' || !name)) ||
      new Set(data.cities.map(city => city.id)).size !== data.cities.length ||
      !data.cities.some(city => city.id === data.defaultCityId)) return null;
  return data;
}
export function defaultCityForBlankAddress(address: CityAddress, catalog: ServiceAreaCatalog | null): ServiceCity | null {
  if (!catalog || address.cityId || address.city?.trim() || address.district?.trim() || address.fullAddress?.trim()) return null;
  return catalog.cities.find(city => city.id === catalog.defaultCityId) ?? null;
}
export function addressCityFields(address: CityAddress): Record<string, string> {
  return address.city?.trim() ? { city: address.city.trim(), cityId: address.cityId || '' } : {};
}
export async function loadServiceAreaCatalog(signal?: AbortSignal): Promise<{ catalog: ServiceAreaCatalog | null; message: string | null }> {
  const epoch = previewGeneration();
  try {
    if (previewClosing() || signal?.aborted) throw new Error('inactive request');
    const result = await apiFetch('/service-areas', { signal });
    if (!previewCanCommit(epoch) || signal?.aborted) throw new Error('retired request');
    const catalog = result?.success === true ? parseServiceAreaCatalog(result.catalog) : null;
    if (catalog) return { catalog, message: null };
  } catch { /* The existing draft remains available when the catalog is offline. */ }
  return { catalog: null, message: 'فهرست شهرها دریافت نشد. اتصال را بررسی و دوباره تلاش کنید.' };
}
