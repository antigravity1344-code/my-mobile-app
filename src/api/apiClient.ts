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
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    return { success: false, message: 'خطا در ارتباط با سرور محلی' };
  }
}
