import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Skills from './workerSkills';

const spy = vi.hoisted(() => ({ network: vi.fn(), read: vi.fn(), write: vi.fn(), remove: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { hostUri: '' } } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: spy.read, setItem: spy.write, removeItem: spy.remove },
}));

let skills: typeof Skills;
beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('__DEV__', true);
  vi.stubEnv('EXPO_PUBLIC_PAKSHO_UI_PREVIEW', '');
  vi.stubGlobal('fetch', spy.network);
  spy.network.mockReset();
  spy.read.mockReset();
  spy.write.mockReset();
  spy.remove.mockReset();
  spy.read.mockResolvedValue(JSON.stringify('worker-test-token'));
  skills = await import('./workerSkills');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('worker skills client', () => {
  it('loads and saves only the skills array from the own-skills endpoint', async () => {
    spy.network.mockResolvedValueOnce(reply({ success: true, skills: ['home_unit_cleaning', ' home '] }));
    expect(await skills.loadWorkerSkills()).toEqual({ ok: true, skills: ['home_unit_cleaning', 'home'] });
    expect(spy.network.mock.calls[0][0]).toMatch(/\/api\/workers\/me\/skills$/);
    expect(spy.network.mock.calls[0][1].headers.Authorization).toBe('Bearer worker-test-token');
    spy.network.mockResolvedValueOnce(reply({ success: true, skills: ['staircase_common_areas'] }));
    expect(await skills.saveWorkerSkills(['  staircase_common_areas  ', 'staircase_common_areas'])).toEqual({
      ok: true,
      skills: ['staircase_common_areas'],
    });
    expect(JSON.parse(spy.network.mock.calls[1][1].body)).toEqual({ skills: ['staircase_common_areas'] });
    expect(spy.write).not.toHaveBeenCalled();
  });

  it('does not treat a malformed success as saved skills', async () => {
    for (const body of [{ success: true }, { success: true, skills: 'home' }, { success: false, message: 'قطع' }, null]) {
      spy.network.mockResolvedValueOnce(reply(body));
      expect((await skills.saveWorkerSkills(['home_unit_cleaning'])).ok).toBe(false);
    }
  });

  it('keeps the draft on save failure and only commits an acknowledged list', () => {
    const reduce = skills.workerSkillsReducer;
    let state = reduce(skills.initialSkillsState, { type: 'loaded', result: { ok: true, skills: ['home_unit_cleaning'] } });
    state = reduce(state, { type: 'toggle', serviceId: 'staircase_common_areas' });
    expect(state.draft).toEqual(['home_unit_cleaning', 'staircase_common_areas']);
    state = reduce(state, { type: 'save' });
    state = reduce(state, { type: 'saved', result: { ok: false, message: 'قطع ارتباط' } });
    expect(state).toMatchObject({
      phase: 'ready',
      draft: ['home_unit_cleaning', 'staircase_common_areas'],
      saved: ['home_unit_cleaning'],
      error: true,
    });
    state = reduce(state, { type: 'saved', result: { ok: true, skills: ['home_unit_cleaning', 'staircase_common_areas'] } });
    expect(state).toMatchObject({
      phase: 'ready',
      saved: ['home_unit_cleaning', 'staircase_common_areas'],
      message: skills.SKILLS_SAVED_MESSAGE,
      error: false,
    });
  });

  it('blocks preview writes before any request', async () => {
    vi.stubEnv('EXPO_PUBLIC_PAKSHO_UI_PREVIEW', '1');
    vi.resetModules();
    const runtime = await import('./previewRuntime');
    runtime.beginPreview('worker');
    const preview = await import('./workerSkills');
    spy.network.mockClear();
    expect(await preview.saveWorkerSkills(['home_unit_cleaning'])).toEqual({
      ok: false,
      message: preview.SKILLS_PREVIEW_BLOCKED,
    });
    expect(spy.network).not.toHaveBeenCalled();
    runtime.endPreview();
  });
});
