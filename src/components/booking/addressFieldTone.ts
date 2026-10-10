import type { AddressValidationErrors } from '../../utils/bookingValidation';

export type AddressFieldTone = 'neutral' | 'error' | 'ok';

/**
 * Border tone of a step-3 address field. An empty field stays neutral (the user hasn't typed yet;
 * «ادامه» is disabled and a grey hint says what is missing). Red only for a filled but invalid value.
 */
export function addressFieldTone(value: unknown, hasError: boolean): AddressFieldTone {
  const filled = typeof value === 'string' ? value.trim() !== '' : Boolean(value);
  if (!filled) return 'neutral';
  return hasError ? 'error' : 'ok';
}

const FIELD_ORDER: (keyof AddressValidationErrors)[] = ['district', 'fullAddress', 'plaque', 'recipientName', 'contactPhone'];

/** First validation message in form order, or null when the address is complete. */
export function firstAddressHint(errors: AddressValidationErrors): string | null {
  for (const key of FIELD_ORDER) {
    if (errors[key]) return errors[key] as string;
  }
  return null;
}
