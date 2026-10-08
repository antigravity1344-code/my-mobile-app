import Constants from 'expo-constants';
import { getApiAuthToken } from './authToken';

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) {
    return fromEnv.endsWith('/api') ? fromEnv : `${fromEnv}/api`;
  }

  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost || '';
  const host = hostUri.split(':')[0];

  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:3000/api`;
  }

  return 'http://192.168.1.2:3000/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

/** پیام‌های عمومی و غیرفنی برای نمایش به کاربر. */
export const CONNECTION_ERROR_MESSAGE = 'ارتباط برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.';
export const GENERIC_ERROR_MESSAGE = 'مشکلی پیش آمد. لطفاً دوباره تلاش کنید.';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  try {
    const token = getApiAuthToken();
    const { headers: optionHeaders, ...rest } = options;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    // فقط وقتی body رشته/JSON است Content-Type بگذار؛ برای FormData نباید ست شود.
    if (typeof rest.body === 'string') {
      headers['Content-Type'] = 'application/json';
    }

    if (optionHeaders) {
      new Headers(optionHeaders).forEach((value, key) => {
        headers[key] = value;
      });
    }

    // headers را بعد از rest می‌گذاریم تا Authorization با options.headers پاک نشود.
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...rest,
      headers,
    });

    const text = await response.text();
    if (!text) {
      return {
        success: false,
        message: GENERIC_ERROR_MESSAGE,
      };
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: GENERIC_ERROR_MESSAGE,
      };
    }
  } catch (error) {
    // console.error باعث RedBox/LogBox مزاحم روی گوشی می‌شود؛ warn کافی است.
    console.warn(`API Error on ${endpoint}:`, error);
    return { success: false, message: CONNECTION_ERROR_MESSAGE };
  }
}
