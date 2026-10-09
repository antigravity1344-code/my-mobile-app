import { describe, expect, it } from 'vitest';

import { parseSubmittedDate, submittedDateText, submittedTimeText } from './orderPayload';

describe('saved order schedule text (U-new2)', () => {
  it('saves the slot name together with its hours in Persian digits', () => {
    expect(submittedTimeText({ id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود', period: 'MORNING', isAvailable: true }))
      .toBe('صبح زود (۰۸:۰۰ تا ۱۰:۰۰)');
  });

  it('does not add the hours twice when the slot name already has them (web wizard labels)', () => {
    expect(submittedTimeText({ id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود (۸:۰۰ - ۱۰:۰۰)', period: 'MORNING', isAvailable: true }))
      .toBe('صبح زود (۸:۰۰ - ۱۰:۰۰)');
  });

  it('falls back to hours only when the slot has no name', () => {
    expect(submittedTimeText({ id: 'x', startTime: '14:00', endTime: '16:00', label: '', period: 'AFTERNOON', isAvailable: true }))
      .toBe('۱۴:۰۰ تا ۱۶:۰۰');
    expect(submittedTimeText(null)).toBe('');
  });

  it('saves the day in Persian digits before the month', () => {
    expect(submittedDateText({ dateString: '1405-08-21', dayOfWeek: 'چهارشنبه', dayOfMonth: 21, monthName: 'آبان ۱۴۰۵' }))
      .toBe('۲۱ آبان ۱۴۰۵');
  });

  it('reads new and old saved dates back', () => {
    expect(parseSubmittedDate('۲۱ آبان ۱۴۰۵')).toEqual({ dayOfMonth: 21, monthName: 'آبان' });
    expect(parseSubmittedDate('آبان ۱۴۰۵ 21')).toEqual({ dayOfMonth: 21, monthName: 'آبان' });
    expect(parseSubmittedDate('آبان 3')).toEqual({ dayOfMonth: 3, monthName: 'آبان' });
    expect(parseSubmittedDate('امروز')).toEqual({ dayOfMonth: 0, monthName: 'امروز' });
    expect(parseSubmittedDate('')).toEqual({ dayOfMonth: 0, monthName: '' });
  });
});
