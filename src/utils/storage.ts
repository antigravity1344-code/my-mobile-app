import { Platform } from 'react-native';

class StorageService {
  private memoryFallback: Map<string, string> = new Map();

  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        const item = window.localStorage.getItem(key);
        if (item !== null) {
          return JSON.parse(item) as T;
        }
      } else {
        const item = this.memoryFallback.get(key);
        if (item !== undefined) {
          return JSON.parse(item) as T;
        }
      }
    } catch {
      // در صورت بروز هرگونه خطای پارس، مقدار پیش‌فرض بازگردانده می‌شود
    }
    return defaultValue;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, serialized);
      } else {
        this.memoryFallback.set(key, serialized);
      }
    } catch {
      // چشم‌پوشی از خطاهای احتمالی ذخیره‌سازی
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      } else {
        this.memoryFallback.delete(key);
      }
    } catch {
      // خطا نادیده گرفته می‌شود
    }
  }
}

export const appStorage = new StorageService();
