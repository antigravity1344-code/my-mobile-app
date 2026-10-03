import AsyncStorage from '@react-native-async-storage/async-storage';

class StorageService {
  private memoryFallback: Map<string, string> = new Map();

  private async readRaw(key: string): Promise<string | null> {
    const cached = this.memoryFallback.get(key);
    if (cached !== undefined) return cached;

    const stored = await AsyncStorage.getItem(key);
    if (stored !== null) this.memoryFallback.set(key, stored);
    return stored;
  }

  async getItem<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const item = await this.readRaw(key);
      if (item !== null) return JSON.parse(item) as T;
    } catch {
      // در صورت بروز هرگونه خطای پارس، مقدار پیش‌فرض بازگردانده می‌شود
    }
    return defaultValue;
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      this.memoryFallback.set(key, serialized);
      await AsyncStorage.setItem(key, serialized);
    } catch {
      // چشم‌پوشی از خطاهای احتمالی ذخیره‌سازی
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      this.memoryFallback.delete(key);
      await AsyncStorage.removeItem(key);
    } catch {
      // خطا نادیده گرفته می‌شود
    }
  }
}

export const appStorage = new StorageService();
