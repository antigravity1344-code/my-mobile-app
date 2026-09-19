import React, { createContext, useContext, useState } from 'react';
import { CleaningService } from '../types/service';
import { JalaliDateOption, TimeSlot, AddressDetails, PaymentReceipt, OrderPaymentStatus } from '../types/booking';

interface WorkerBookingState {
  selectedService: CleaningService | null;
  selectedDate: JalaliDateOption | null;
  selectedTimeSlot: TimeSlot | null;
  durationHours: number;
  addressDetails: AddressDetails;
  paymentReceipt: PaymentReceipt | null;
  orderStatus: OrderPaymentStatus;
  step: number;

  setSelectedService: (service: CleaningService | null) => void;
  setSelectedDate: (date: JalaliDateOption | null) => void;
  setSelectedTimeSlot: (slot: TimeSlot | null) => void;
}

const DEFAULT_ADDRESS: AddressDetails = {
  district: 'سعادت‌آباد',
  fullAddress: 'خیابان سرو، پلاک ۲۴، واحد ۳',
  plaque: '۲۴',
  unit: '۳',
  floor: '۲',
  hasElevator: true,
  contactPhone: '۰۹۱۲۳۴۵۶۷۸۹',
  recipientName: 'علی رضایی',
  addressNotes: '',
  coordinates: {
    latitude: 35.7794,
    longitude: 51.3756,
  },
  isSaved: true,
};

const WorkerBookingContext = createContext<WorkerBookingState | undefined>(undefined);

export const WorkerBookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Workers don't generally change these in their portal, but they might need to filter
  // or act on selections locally in the UI, hence useState for these:
  const [selectedService, setSelectedService] = useState<CleaningService | null>(null);
  const [selectedDate, setSelectedDate] = useState<JalaliDateOption | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);

  // Sensible read-only defaults for viewing order details
  const durationHours = 4;
  const addressDetails = DEFAULT_ADDRESS;
  const paymentReceipt = null;
  const orderStatus: OrderPaymentStatus = 'PENDING';
  const step = 1;

  return (
    <WorkerBookingContext.Provider
      value={{
        selectedService,
        selectedDate,
        selectedTimeSlot,
        durationHours,
        addressDetails,
        paymentReceipt,
        orderStatus,
        step,
        setSelectedService,
        setSelectedDate,
        setSelectedTimeSlot,
      }}
    >
      {children}
    </WorkerBookingContext.Provider>
  );
};

export const useWorkerBooking = () => {
  const context = useContext(WorkerBookingContext);
  if (!context) throw new Error('useWorkerBooking must be used within a WorkerBookingProvider');
  return context;
};

// Alias برای سازگاری با کامپوننت‌های موجود مثل NativeWorkerPortal
// که از useBooking استفاده می‌کنند
export const useBooking = useWorkerBooking;
