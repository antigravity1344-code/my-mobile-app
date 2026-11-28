import type { TimeSlot } from '../../types/booking';

export const BOOKING_START_SLOTS: readonly TimeSlot[] = [
  { id: 'start-0800', startTime: '08:00', endTime: '', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'start-0900', startTime: '09:00', endTime: '', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'start-1000', startTime: '10:00', endTime: '', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'start-1100', startTime: '11:00', endTime: '', label: 'صبح', period: 'MORNING', isAvailable: true },
  { id: 'start-1400', startTime: '14:00', endTime: '', label: 'ظهر', period: 'AFTERNOON', isAvailable: true },
  { id: 'start-1500', startTime: '15:00', endTime: '', label: 'ظهر', period: 'AFTERNOON', isAvailable: true },
  { id: 'start-1600', startTime: '16:00', endTime: '', label: 'عصر', period: 'AFTERNOON', isAvailable: true },
  { id: 'start-1700', startTime: '17:00', endTime: '', label: 'عصر', period: 'AFTERNOON', isAvailable: true },
];
