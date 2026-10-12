export const calls = { read: 0, write: 0, remove: 0 };
export const records = new Map<string, string>();
export default {
  async getItem(key: string) { calls.read += 1; return records.get(key) ?? null; },
  async setItem(key: string, value: string) { calls.write += 1; records.set(key, value); },
  async removeItem(key: string) { calls.remove += 1; records.delete(key); },
};
