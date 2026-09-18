import { useState } from 'react';
import { Platform } from 'react-native';
import {
  Sparkles,
  Home,
  Receipt,
  User,
  Smartphone,
  BookOpen,
  CalendarCheck,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { BookingProvider, useBooking } from './src/context/BookingContext';
import { BookingWizardContainer } from './src/components/booking/BookingWizardContainer';
import { HomeScreen } from './src/components/dashboard/HomeScreen';
import { AdminPanelScreen } from './src/components/dashboard/AdminPanelScreen';
import { SpecialistPortalScreen } from './src/components/dashboard/SpecialistPortalScreen';
import { NativeBookingWizard } from './src/components/booking/NativeBookingWizard';
import { OrdersProvider, OrdersScreen } from './src/features/orders';
import { ProfileProvider, ProfileScreen } from './src/features/profile';
import { MobileAuthModal } from './src/features/auth';


// داشبورد اصلی وب با قابلیت سوئیچ بین حالت ویزارد و شبیه‌ساز موبایل
export function MainDashboard() {
  const [activeTab, setActiveTab] = useState<'Home' | 'Orders' | 'Profile' | 'Wizard' | 'Admin' | 'Specialist'>('Wizard');
  const [viewMode, setViewMode] = useState<'wizard' | 'simulator'>('wizard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const { addressDetails, step } = useBooking();

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans" dir="rtl">
      {/* هدر بالای صفحه */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500 text-white shadow-sm shadow-sky-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base">پاکشو (سرویس نظافت آنلاین)</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                اسپرینت ۵: ماژول پروفایل و احراز هویت
              </span>
            </div>
            <p className="text-xs text-slate-400">سیستم رزرو آنلاین به همراه مدیریت سفارش‌ها و پروفایل کاربر</p>
          </div>
        </div>

        {/* سوییچ حالت نمایش */}
        <div className="bg-slate-900 p-1 rounded-lg border border-slate-800 flex items-center gap-1">
          <button
            onClick={() => setViewMode('wizard')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'wizard' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>پیش‌نمایش ویزارد</span>
          </button>
          <button
            onClick={() => setViewMode('simulator')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              viewMode === 'simulator' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>شبیه‌ساز موبایل</span>
          </button>
        </div>
      </header>

      {/* بدنه اصلی */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        {/* حالت اول: ویزارد تمام‌صفحه */}
        {viewMode === 'wizard' && (
          <div className="w-full max-w-4xl">
            <BookingWizardContainer />
          </div>
        )}

        {/* حالت دوم: شبیه‌ساز گوشی موبایل */}
        {viewMode === 'simulator' && (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl">
            {/* سایدبار اطلاعات زنده */}
            <div className="w-full lg:w-80 space-y-4 text-right">
              <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-lg backdrop-blur">
                <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-sky-400" />
                  <span>وضعیت لحظه‌ای سفارش</span>
                </h2>
                <div className="space-y-2 border-t border-slate-700 pt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">گام فعلی:</span>
                    <span className="text-emerald-400 font-bold">مرحله {step} از ۴</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">محله:</span>
                    <span className="text-sky-400 font-bold">{addressDetails.district}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">گیرنده:</span>
                    <span className="text-slate-200 font-medium">{addressDetails.recipientName || 'وارد نشده'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">موبایل:</span>
                    <span className="text-emerald-400 font-mono font-bold">{addressDetails.contactPhone || 'وارد نشده'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-400">تست تب‌های پایین:</span>
                <div className="grid grid-cols-6 gap-1 text-[9px]">
                  <button
                    onClick={() => setActiveTab('Home')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Home' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    خانه
                  </button>
                  <button
                    onClick={() => setActiveTab('Wizard')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Wizard' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    رزرو
                  </button>
                  <button
                    onClick={() => setActiveTab('Orders')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Orders' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    سفارش‌ها
                  </button>
                  <button
                    onClick={() => setActiveTab('Specialist')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Specialist' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    متخصصین
                  </button>
                  <button
                    onClick={() => setActiveTab('Profile')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Profile' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    پروفایل
                  </button>
                  <button
                    onClick={() => setActiveTab('Admin')}
                    className={`py-1.5 rounded-lg font-medium transition cursor-pointer ${
                      activeTab === 'Admin' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    مدیریت
                  </button>
                </div>
              </div>
            </div>

            {/* قالب گوشی موبایل */}
            <div className="relative w-[375px] h-[780px] bg-black rounded-[48px] p-3 shadow-2xl ring-1 ring-slate-700/50 flex flex-col overflow-hidden border-4 border-slate-800">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-950 rounded-full z-40 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-slate-900 mr-2 border border-slate-800"></div>
                <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
              </div>

              <div className="w-full h-full bg-slate-50 text-slate-900 rounded-[38px] overflow-hidden flex flex-col pt-7 relative font-sans">
                <div className="px-6 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-700 select-none">
                  <span>9:41</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]">5G</span>
                    <div className="w-5 h-2.5 border border-slate-700 rounded-xs p-0.5 flex items-center">
                      <div className="h-full w-full bg-slate-700 rounded-2xs"></div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {activeTab === 'Home' && <HomeScreen onStartBooking={() => setActiveTab('Wizard')} />}
                  {activeTab === 'Wizard' && <BookingWizardContainer />}
                  {activeTab === 'Orders' && <OrdersScreen onNavigateToBooking={() => setActiveTab('Wizard')} />}
                  {activeTab === 'Specialist' && <SpecialistPortalScreen />}
                  {activeTab === 'Profile' && <ProfileScreen onOpenLoginModal={() => setIsAuthModalOpen(true)} />}
                  {activeTab === 'Admin' && <AdminPanelScreen />}
                </div>

                {/* نوار پایین اپلیکیشن */}
                <div className="h-14 bg-white border-t border-slate-200/90 px-2 flex items-center justify-between shadow-lg z-30 select-none">
                  <button
                    onClick={() => setActiveTab('Home')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Home' ? 'text-sky-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <Home className="w-3.5 h-3.5" />
                    <span className="text-[8px]">خانه</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('Wizard')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Wizard' ? 'text-sky-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <CalendarCheck className="w-3.5 h-3.5" />
                    <span className="text-[8px]">رزرو</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('Specialist')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Specialist' ? 'text-emerald-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span className="text-[8px]">متخصصین</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('Orders')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Orders' ? 'text-sky-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="text-[8px]">سفارش‌ها</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('Profile')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Profile' ? 'text-sky-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="text-[8px]">پروفایل</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('Admin')}
                    className={`flex flex-col items-center gap-0.5 transition ${
                      activeTab === 'Admin' ? 'text-amber-600 font-bold' : 'text-slate-400'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span className="text-[8px]">مدیریت</span>
                  </button>
                </div>
                <div className="w-32 h-1 bg-slate-300 rounded-full mx-auto my-1"></div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* مدال ورود پیامکی */}
      <MobileAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <BookingProvider>
      <OrdersProvider>
        <ProfileProvider>
          {Platform.OS === 'web' ? <MainDashboard /> : <NativeBookingWizard />}
        </ProfileProvider>
      </OrdersProvider>
    </BookingProvider>
  );
}