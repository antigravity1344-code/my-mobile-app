import { apiFetch } from '../../api/apiClient';
import { attachStoredAuthToken } from '../../api/authToken';
import { appStorage } from '../../utils/storage';
import { previewActive } from './previewRuntime';
import { WORKER_TOKEN_KEY } from './workerLoginStorage';
import { normalizeWorkerSkills, toggleWorkerSkill } from './workerHomeCards';

export const WORKER_SKILLS_ENDPOINT = '/workers/me/skills';
export const SKILLS_LOAD_ERROR = 'دریافت خدمات انجام نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export const SKILLS_SAVE_ERROR = 'تأیید ذخیره دریافت نشد. اتصال را بررسی کنید و دوباره تلاش کنید.';
export const SKILLS_SAVED_MESSAGE = 'فهرست خدمات ذخیره شد.';
export const SKILLS_PREVIEW_BLOCKED = 'ذخیره خدمات در پیش‌نمایش انجام نمی‌شود.';
export const SKILLS_VALIDATION_MESSAGE = 'فهرست خدمات معتبر نیست.';

export type SkillsResult =
  | { ok: true; skills: string[] }
  | { ok: false; message: string; sessionExpired?: boolean };

async function requestSkills(options: RequestInit): Promise<SkillsResult> {
  const fallback = options.method === 'PUT' ? SKILLS_SAVE_ERROR : SKILLS_LOAD_ERROR;
  try {
    await attachStoredAuthToken(appStorage, WORKER_TOKEN_KEY);
    if (options.signal?.aborted) return { ok: false, message: fallback };
    const result: unknown = await apiFetch(WORKER_SKILLS_ENDPOINT, options);
    if (result && typeof result === 'object') {
      const data = result as Record<string, unknown>;
      if (data.success === true && Array.isArray(data.skills)) {
        return { ok: true, skills: normalizeWorkerSkills(data.skills) };
      }
      return {
        ok: false,
        message: typeof data.message === 'string' && data.message ? data.message : fallback,
        sessionExpired: data.httpStatus === 401 || data.httpStatus === 403,
      };
    }
  } catch {
    // Keep the draft; transport or storage failure is not a successful save.
  }
  return { ok: false, message: fallback };
}

export function loadWorkerSkills(signal?: AbortSignal): Promise<SkillsResult> {
  return requestSkills({ signal });
}

export function saveWorkerSkills(skills: readonly string[], signal?: AbortSignal): Promise<SkillsResult> {
  if (previewActive()) return Promise.resolve({ ok: false, message: SKILLS_PREVIEW_BLOCKED });
  return requestSkills({ method: 'PUT', body: JSON.stringify({ skills: normalizeWorkerSkills(skills) }), signal });
}

export type SkillsState = {
  draft: string[];
  saved: string[] | null;
  phase: 'loading' | 'ready' | 'saving' | 'loadError';
  message: string | null;
  error: boolean;
  sessionExpired: boolean;
};

export const initialSkillsState: SkillsState = {
  draft: [], saved: null, phase: 'loading', message: null, error: false, sessionExpired: false,
};

export type SkillsAction =
  | { type: 'load' }
  | { type: 'save' }
  | { type: 'toggle'; serviceId: string }
  | { type: 'loaded' | 'saved'; result: SkillsResult };

export function workerSkillsReducer(state: SkillsState, action: SkillsAction): SkillsState {
  if (action.type === 'load' || action.type === 'save') {
    return { ...state, phase: action.type === 'load' ? 'loading' : 'saving', message: null, error: false };
  }
  if (action.type === 'toggle') {
    return { ...state, draft: toggleWorkerSkill(state.draft, action.serviceId), message: null, error: false };
  }
  if (!action.result.ok) {
    return {
      ...state,
      phase: action.type === 'loaded' ? 'loadError' : 'ready',
      message: action.result.message,
      error: true,
      sessionExpired: !!action.result.sessionExpired,
    };
  }
  return {
    draft: action.result.skills,
    saved: action.result.skills,
    phase: 'ready',
    message: action.type === 'saved' ? SKILLS_SAVED_MESSAGE : null,
    error: false,
    sessionExpired: false,
  };
}
