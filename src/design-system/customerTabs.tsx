import type { BottomTabItem } from './components/BottomTabBar';

import { CalendarCheck, ClipboardList, Headphones, Home, User } from 'lucide-react-native';

export const CUSTOMER_TAB_ITEMS: BottomTabItem[] = [
  { id: 'home', label: 'خانه', icon: Home },
  { id: 'book', label: 'رزرو', icon: CalendarCheck },
  { id: 'orders', label: 'سفارش‌ها', icon: ClipboardList },
  { id: 'support', label: 'پشتیبانی', icon: Headphones },
  { id: 'profile', label: 'پروفایل', icon: User },
];
