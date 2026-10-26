import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: () => [state.values.shift(), vi.fn()] };
});
// Use the installed React Native Web renderer, including its real DOM prop mapping.
vi.mock('react-native', async () => {
  const { createRequire } = await import('node:module');
  return createRequire(import.meta.url)('react-native-web');
});
vi.mock('./workerServiceArea', () => ({
  loadWorkerServiceArea: vi.fn(), saveWorkerServiceArea: vi.fn(), validAreaSelection: () => true,
}));
vi.mock('./previewRuntime', () => ({ previewActive: () => false }));
vi.mock('../../api/serviceAreas', () => ({
  loadServiceAreaCatalog: vi.fn(), defaultCityForBlankAddress: () => null,
}));
vi.mock('../../theme/customerHome', () => ({ colors: {}, type: {} }));

import { WorkerServiceAreaScreen } from './WorkerServiceAreaScreen';
import { AddressCityPicker } from '../booking/AddressCityPicker';

const catalog = { version: 1, defaultCityId: 'tehran', cities: [
  { id: 'tehran', name: 'Tehran', neighborhoods: ['Vanak', 'Punak'] },
  { id: 'yazd', name: 'Yazd', neighborhoods: ['Safaeieh'] },
] };
const openingTags = (html: string, role: string) => html.match(new RegExp(`<[^>]+role="${role}"[^>]*>`, 'g')) || [];

beforeEach(() => { state.values = []; });

describe('service area accessibility in the actual web renderer', () => {
  it.each([{ selected: ['Vanak'] }, { selected: ['Punak'] }, { selected: [] as string[] }])('exposes checked and unchecked neighborhoods: $selected', ({ selected }) => {
    state.values = [catalog, null, 'tehran', selected, 'ready', null, false];
    const html = renderToStaticMarkup(createElement(WorkerServiceAreaScreen, { onBack: vi.fn() }));
    const checkboxes = openingTags(html, 'checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toContain(`aria-checked="${selected.includes('Vanak')}"`);
    expect(checkboxes[1]).toContain(`aria-checked="${selected.includes('Punak')}"`);
    const cityButtons = openingTags(html, 'button').filter(tag => tag.includes('aria-pressed'));
    expect(cityButtons).toHaveLength(2);
    expect(cityButtons[0]).toContain('aria-pressed="true"');
    expect(cityButtons[1]).toContain('aria-pressed="false"');
  });

  it('exposes the selected customer city as a pressed button', () => {
    state.values = [catalog, false, null, 0];
    const html = renderToStaticMarkup(createElement(AddressCityPicker, {
      value: { cityId: 'yazd', city: 'Yazd', district: '', fullAddress: '' },
      onSelectCity: vi.fn(), onSelectDistrict: vi.fn(),
    }));
    const cityButtons = openingTags(html, 'button').filter(tag => tag.includes('aria-pressed'));
    expect(cityButtons).toHaveLength(2);
    expect(cityButtons[0]).toContain('aria-pressed="false"');
    expect(cityButtons[1]).toContain('aria-pressed="true"');
    expect(html).not.toContain('aria-selected=');
  });
});
