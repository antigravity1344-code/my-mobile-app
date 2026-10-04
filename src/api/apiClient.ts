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
        message: response.ok ? 'پاسخ خالی از سرور' : `خطای سرور (${response.status})`,
      };
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        success: false,
        message: `پاسخ نامعتبر از سرور (${response.status})`,
      };
    }
  } catch (error) {
    // console.error باعث RedBox/LogBox مزاحم روی گوشی می‌شود؛ warn کافی است.
    console.warn(`API Error on ${endpoint}:`, error);
    return { success: false, message: 'خطا در ارتباط با سرور محلی' };
  }
}
