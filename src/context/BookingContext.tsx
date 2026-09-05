import React, { createContext, useContext, useState } from 'react';
import { CleaningService } from '../types/service';
import { JalaliDateOption, TimeSlot, AddressDetails } from '../types/booking';

interface BookingState {
  // Step 1
  selectedService: CleaningService | null;
  
  // Step 2
  selectedDate: JalaliDateOption | null;
  selectedTimeSlot: TimeSlot | null;
  durationHours: number;
  genderPreference: 'FEMALE' | 'MALE' | 'NO_PREFERENCE';
  notes: string;
  
  // Step 3
  addressDetails: AddressDetails;
  
  // Navigation & Actions
  step: number;
  setSelectedService: (service: CleaningService | null) => void;
  setSelectedDate: (date: JalaliDateOption | null) => void;
  setSelectedTimeSlot: (slot: TimeSlot | null) => void;
  setDurationHours: (hours: number) => void;
  setGenderPreference: (gender: 'FEMALE' | 'MALE' | 'NO_PREFERENCE') => void;
  setNotes: (notes: string) => void;
  setAddressDetails: (details: AddressDetails | ((prev: AddressDetails) => AddressDetails)) => void;
  updateAddressField: <K extends keyof AddressDetails>(field: K, value: AddressDetails[K]) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  resetBooking: () => void;
}

const DEFAULT_ADDRESS: AddressDetails = {
  district: 'سعادت‌آباد',
  fullAddress: '',
  plaque: '',
  unit: '',
  floor: '',
  hasElevator: true,
  contactPhone: '',
  recipientName: '',
  addressNotes: '',
  coordinates: {
    latitude: 35.7794,
    longitude: 51.3756,
  },
  isSaved: true,
};

const BookingContext = createContext<BookingState | undefined>(undefined);

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedService, setSelectedService] = useState<CleaningService | null>(null);
  const [selectedDate, setSelectedDate] = useState<JalaliDateOption | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [durationHours, setDurationHours] = useState<number>(4);
  const [genderPreference, setGenderPreference] = useState<'FEMALE' | 'MALE' | 'NO_PREFERENCE'>('NO_PREFERENCE');
  const [notes, setNotes] = useState<string>('');
  const [addressDetails, setAddressDetails] = useState<AddressDetails>(DEFAULT_ADDRESS);
  const [step, setStep] = useState<number>(1);

  const updateAddressField = <K extends keyof AddressDetails>(field: K, value: AddressDetails[K]) => {
    setAddressDetails((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const nextStep = () => setStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

  const resetBooking = () => {
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTimeSlot(null);
    setDurationHours(4);
    setGenderPreference('NO_PREFERENCE');
    setNotes('');
    setAddressDetails(DEFAULT_ADDRESS);
    setStep(1);
  };

  return (
    <BookingContext.Provider
      value={{
        selectedService,
        selectedDate,
        selectedTimeSlot,
        durationHours,
        genderPreference,
        notes,
        addressDetails,
        step,
        setSelectedService,
        setSelectedDate,
        setSelectedTimeSlot,
        setDurationHours,
        setGenderPreference,
        setNotes,
        setAddressDetails,
        updateAddressField,
        setStep,
        nextStep,
        prevStep,
        resetBooking,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context) throw new Error('useBooking must be used within a BookingProvider');
  return context;
};
