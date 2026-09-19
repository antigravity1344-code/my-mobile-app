// آدرس سرور اصلی روی شبکه وای‌فای محلی
export const API_BASE_URL = 'http://192.168.1.2:3000/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
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
