/** تعداد اعلان‌های خوانده‌نشده از پاسخ GET /notifications؛ اگر معلوم نباشد ۰ (نقطه زنگ نمایش داده نمی‌شود). */
export function unreadCountFromResponse(res: unknown): number {
  const r = (res && typeof res === 'object' ? res : {}) as {
    success?: unknown;
    unreadCount?: unknown;
    notifications?: unknown;
  };
  if (r.success !== true) return 0;
  if (typeof r.unreadCount === 'number' && Number.isFinite(r.unreadCount)) return Math.max(0, r.unreadCount);
  if (Array.isArray(r.notifications)) {
    return r.notifications.filter((item) => item && typeof item === 'object' && !(item as { readAt?: unknown }).readAt).length;
  }
  return 0;
}

/** شناسه سفارشی که اعلان به آن مربوط است، یا null. */
export function notificationOrderTarget(item: { orderId?: unknown }): string | null {
  return typeof item.orderId === 'string' && item.orderId.trim() ? item.orderId.trim() : null;
}
