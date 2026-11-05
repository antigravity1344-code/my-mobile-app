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
export function quoteLineLabel(id: string, kind: 'surcharge' | 'discount'): string {
  if (PERSIAN.test(id)) return id;
  const known = inputLabels().get(id);
  if (known) return known;
  return kind === 'discount' ? 'تخفیف' : 'هزینهٔ افزوده';
}
