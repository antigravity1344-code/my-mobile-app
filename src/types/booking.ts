import { CleaningService } from './service';

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  label: string;
  period: 'MORNING' | 'AFTERNOON' | 'EVENING';
  isAvailable: boolean;
  extraFee?: number;
}

export interface JalaliDateOption {
  dateString: string;
  dayOfWeek: string;
  dayOfMonth: number;
  monthName: string;
  isToday?: boolean;
  isTomorrow?: boolean;
  isHoliday?: boolean;
}

export interface AddressCoordinates {
  latitude: number;
  longitude: number;
}

export interface AddressDetails {
  district: string;
  fullAddress: string;
  plaque: string;
  unit: string;
  floor?: string;
  hasElevator: boolean;
  contactPhone: string;
  recipientName: string;
  addressNotes?: string;
  coordinates: AddressCoordinates;
  isSaved?: boolean;
}

export interface BookingScheduleData {
  selectedService: CleaningService | null;
  selectedDate: JalaliDateOption | null;
  selectedTimeSlot: TimeSlot | null;
  durationHours: number;
  genderPreference: 'FEMALE' | 'MALE' | 'NO_PREFERENCE';
  notes?: string;
  addressDetails: AddressDetails | null;
}