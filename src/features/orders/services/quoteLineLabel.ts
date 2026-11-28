import { RATE_LABELS, STAIR_SERVICE } from '../../../../server/pricing/staircase';
import { SERVICES_CATALOG } from '../../../config/servicesData';

const PERSIAN = /[؀-ۿ]/;

function inputLabels(): Map<string, string> {
  const labels = new Map<string, string>();
  for (const service of SERVICES_CATALOG) {
    for (const input of service.configuration?.inputs ?? []) {
      if (input.id && input.label && !labels.has(input.id)) labels.set(input.id, input.label);
    }
  }
  return labels;
}

/** شناسهٔ فنی ردیف تعرفه را به برچسبی قابل‌فهم برای مشتری تبدیل می‌کند. */
export function quoteLineLabel(id: string, kind: 'surcharge' | 'discount', serviceId?: string): string {
  if (serviceId === STAIR_SERVICE && Object.prototype.hasOwnProperty.call(RATE_LABELS, id)) return RATE_LABELS[id as keyof typeof RATE_LABELS];
  if (id === 'worker-offer') return 'قیمت پیشنهادی متخصص';
  if (PERSIAN.test(id)) return id;
  const known = inputLabels().get(id);
  if (known) return known;
  return kind === 'discount' ? 'تخفیف' : 'هزینهٔ افزوده';
}
