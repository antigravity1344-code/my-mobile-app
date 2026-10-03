import { SERVICES_CATALOG } from '../../config/servicesData';

const GENDER_LABELS: Record<string, string> = {
  FEMALE: 'خانم',
  MALE: 'آقا',
  NO_PREFERENCE: 'بدون ترجیح',
};

export type WorkerServiceCategory = 'cleaner' | 'hourly_laborer' | 'painter' | 'sofa_cleaner';

export function categoryForServiceId(serviceId: string): WorkerServiceCategory {
  if (serviceId === 'hourly_labor') return 'hourly_laborer';
  if (serviceId === 'building_painting') return 'painter';
  if (serviceId === 'sofa_carpet_washing') return 'sofa_cleaner';
  return 'cleaner';
}

export function classifyWorkerOrder(order: {
  serviceId?: string | null;
  serviceTitle?: string | null;
}): { category: WorkerServiceCategory | null; badge: string } {
  const serviceId = typeof order.serviceId === 'string' ? order.serviceId.trim() : '';
  if (serviceId) {
    const service = SERVICES_CATALOG.find((item) => item.id === serviceId);
    return {
      category: categoryForServiceId(serviceId),
      badge: service?.badge || '',
    };
  }

  const title = typeof order.serviceTitle === 'string' ? order.serviceTitle : '';
  const matched = SERVICES_CATALOG.find((item) => item.title === title);
  if (!matched) {
    return { category: null, badge: '' };
  }
  return {
    category: categoryForServiceId(matched.id),
    badge: matched.badge || '',
  };
}

function optionLabel(serviceId: string, key: string): string {
  const service = SERVICES_CATALOG.find((item) => item.id === serviceId);
  const input = service?.configuration.inputs?.find((item) => item.id === key);
  return input?.label || key;
}

function optionValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
}

export function describeWorkerServiceFacts(order: {
  serviceId?: string | null;
  durationHours?: number | null;
  genderPreference?: string | null;
  serviceOptions?: Record<string, unknown> | null;
  notes?: string | null;
  addressNotes?: string | null;
}): string {
  const lines: string[] = [];
  if (typeof order.durationHours === 'number' && order.durationHours > 0) {
    lines.push(`مدت: ${order.durationHours} ساعت`);
  }
  const serviceId = typeof order.serviceId === 'string' ? order.serviceId : '';
  if (order.serviceOptions && typeof order.serviceOptions === 'object') {
    for (const [key, value] of Object.entries(order.serviceOptions)) {
      const text = optionValue(value);
      if (text) lines.push(`${optionLabel(serviceId, key)}: ${text}`);
    }
  }
  const gender = typeof order.genderPreference === 'string' ? GENDER_LABELS[order.genderPreference] : '';
  const optionGender = optionValue(order.serviceOptions?.gender);
  if (gender && !optionGender) lines.push(`جنسیت متخصص: ${gender}`);
  const notes = typeof order.notes === 'string' ? order.notes.trim() : '';
  const addressNotes = typeof order.addressNotes === 'string' ? order.addressNotes.trim() : '';
  if (notes) lines.push(`یادداشت سفارش: ${notes}`);
  if (addressNotes) lines.push(`یادداشت آدرس: ${addressNotes}`);
  return lines.join('\n');
}
