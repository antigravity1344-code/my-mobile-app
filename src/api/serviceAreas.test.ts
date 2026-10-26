import { describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./apiClient', () => ({ apiFetch: mock.api }));
import { addressCityFields, defaultCityForBlankAddress, loadServiceAreaCatalog, parseServiceAreaCatalog, type ServiceAreaCatalog } from './serviceAreas';
import { formatSubmittedAddress } from '../features/orders/services/orderPayload';
import { bookingSelectionFingerprint } from '../features/orders/services/clientRequestId';
const catalog: ServiceAreaCatalog = { version: 2, defaultCityId: 'yazd', cities: [
  { id: 'tehran', name: 'تهران', neighborhoods: ['ونک'] }, { id: 'yazd', name: 'یزد', neighborhoods: ['صفائیه'] },
] };
describe('company cities in customer addresses', () => {
  it('accepts a valid catalog and rejects malformed/defaultless/duplicate catalog data', () => {
    expect(parseServiceAreaCatalog(catalog)).toEqual(catalog);
    for (const value of [null, {}, { ...catalog, version: -1 }, { ...catalog, cities: [] },
      { ...catalog, defaultCityId: 'missing' }, { ...catalog, cities: [catalog.cities[0], catalog.cities[0]] },
      { ...catalog, cities: [{ ...catalog.cities[0], neighborhoods: [null] }] }]) expect(parseServiceAreaCatalog(value)).toBeNull();
  });
  it('applies the current default only to a blank address, never to legacy or already selected addresses', () => {
    expect(defaultCityForBlankAddress({}, catalog)?.id).toBe('yazd');
    for (const old of [{ fullAddress: 'نشانی قدیمی' }, { district: 'محله قبلی' }, { city: 'شهر قدیمی' }, { cityId: 'tehran' }]) {
      expect(defaultCityForBlankAddress(old, catalog)).toBeNull();
    }
    expect(defaultCityForBlankAddress({}, null)).toBeNull();
  });
  it('preserves the legacy address and fingerprint shape; explicit city changes distinguish booking attempts', () => {
    expect(addressCityFields({ district: 'ونک' })).toEqual({});
    expect(formatSubmittedAddress({ district: 'ونک', fullAddress: 'خیابان', plaque: '۱۲' })).toBe('ونک، خیابان، پلاک ۱۲');
    expect(formatSubmittedAddress({ city: 'تهران', district: 'ونک', fullAddress: 'خیابان', plaque: '۱۲' })).toBe('ونک، تهران، خیابان، پلاک ۱۲');
    const selection = { serviceId: 'home', options: {}, durationHours: 3, date: 'date', time: 'time',
      address: { fullAddress: 'خیابان' }, genderPreference: 'NO_PREFERENCE', recurringFrequency: 'ONE_TIME', notes: '' };
    expect(bookingSelectionFingerprint({ ...selection, address: { ...selection.address, ...addressCityFields({}) } })).toBe(bookingSelectionFingerprint(selection));
    const first = bookingSelectionFingerprint({ ...selection, address: { ...selection.address, ...addressCityFields({ city: 'تهران', cityId: 'tehran' }) } });
    const second = bookingSelectionFingerprint({ ...selection, address: { ...selection.address, ...addressCityFields({ city: 'یزد', cityId: 'yazd' }) } });
    expect(first).not.toBe(second);
  });
  it('reads the current server catalog; failures do not create a guessed default', async () => {
    mock.api.mockResolvedValueOnce({ success: true, catalog });
    expect((await loadServiceAreaCatalog()).catalog).toEqual(catalog);
    mock.api.mockRejectedValueOnce(new Error('offline'));
    expect((await loadServiceAreaCatalog()).catalog).toBeNull();
    mock.api.mockResolvedValueOnce({ success: true, catalog: {} });
    expect((await loadServiceAreaCatalog()).message).toBeTruthy();
    let deliver!: (value: unknown) => void;
    mock.api.mockImplementationOnce(() => new Promise(resolve => { deliver = resolve; }));
    const pending = loadServiceAreaCatalog();
    vi.stubGlobal('__DEV__', true); vi.stubEnv('EXPO_PUBLIC_PAKSHO_UI_PREVIEW', '1');
    try {
      const preview = await import('../components/native/previewRuntime'); preview.beginPreview('customer');
      deliver({ success: true, catalog });
      expect((await pending).catalog).toBeNull();
      preview.beginPreviewShutdown();
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });
});
