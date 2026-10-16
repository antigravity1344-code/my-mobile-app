import { describe, expect, it } from 'vitest';
import { GPS_UNAVAILABLE_MESSAGE, messageForGpsResult } from './gpsFeedback';

describe('messageForGpsResult', () => {
  it('is silent when coordinates were found', () => {
    expect(messageForGpsResult(true)).toBeNull();
  });

  it('asks the user to continue without GPS when coordinates are missing', () => {
    expect(messageForGpsResult(false)).toBe(GPS_UNAVAILABLE_MESSAGE);
  });
});
