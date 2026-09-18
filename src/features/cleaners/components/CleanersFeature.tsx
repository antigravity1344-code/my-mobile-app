import React from 'react';
import { CleanersProvider } from '../context';
import { CleanersScreen } from './CleanersScreen';

/** نقطه ورود مستقل بخش نظافتچی — بدون وابستگی به کامپوننت‌های رزرو و سفارش */
export const CleanersFeature: React.FC = () => (
  <CleanersProvider>
    <CleanersScreen />
  </CleanersProvider>
);
