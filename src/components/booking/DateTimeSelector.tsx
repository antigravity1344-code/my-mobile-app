import { useState, useMemo } from 'react';
import { Calendar, Clock, FileText } from 'lucide-react';

interface DateTimeSelectorProps {
  selectedDate: any;
  selectedTimeSlot: any;
  durationHours: number;
  genderPreference: 'FEMALE' | 'MALE' | 'NO_PREFERENCE';
  notes: string;
  onSelectDate: (date: any) => void;
  onSelectTimeSlot: (slot: any) => void;
  onChangeDuration: (hours: number) => void;
  onChangeGender: (gender: 'FEMALE' | 'MALE' | 'NO_PREFERENCE') => void;
  onChangeNotes: (notes: string) => void;
  onNext: () => void;
  onPrev: () => void;
}

const generateDateOptions = () => {
  const today = new Date();
  const options = [];
  const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayOfWeek = date.getDay();
    const persianDayIndex = (dayOfWeek + 1) % 7;
    const adjustedDayName = dayNames[persianDayIndex];

    options.push({
      dateString: date.toISOString().split('T')[0],
      dayOfWeek: adjustedDayName,
      dayOfMonth: date.getDate(),
      monthName: monthNames[date.getMonth()] + ' ' + date.getFullYear(),
      isToday: i === 0,
      isTomorrow: i === 1,
    });
  }

  return options;
};

const TIME_SLOTS = [
  { id: 'morning-1', startTime: '08:00', endTime: '10:00', label: 'صبح زود (۸:۰۰ - ۱۰:۰۰)', period: 'MORNING' as const, isAvailable: true },
  { id: 'morning-2', startTime: '10:00', endTime: '12:00', label: 'صبح (۱۰:۰۰ - ۱۲:۰۰)', period: 'MORNING' as const, isAvailable: true },
  { id: 'afternoon-1', startTime: '14:00', endTime: '16:00', label: 'ظهر (۱۴:۰۰ - ۱۶:۰۰)', period: 'AFTERNOON' as const, isAvailable: true },
  { id: 'afternoon-2', startTime: '16:00', endTime: '18:00', label: 'عصر (۱۶:۰۰ - ۱۸:۰۰)', period: 'AFTERNOON' as const, isAvailable: true },
  { id: 'evening-1', startTime: '18:00', endTime: '20:00', label: 'شب (۱۸:۰۰ - ۲۰:۰۰)', period: 'EVENING' as const, isAvailable: false },
  { id: 'evening-2', startTime: '20:00', endTime: '22:00', label: 'شب دیر (۲۰:۰۰ - ۲۲:۰۰)', period: 'EVENING' as const, isAvailable: false, extraFee: 20000 },
];

export const DateTimeSelector: React.FC<DateTimeSelectorProps> = ({
  selectedDate,
  selectedTimeSlot,
  durationHours,
  genderPreference,
  notes,
  onSelectDate,
  onSelectTimeSlot,
  onChangeDuration,
  onChangeGender,
  onChangeNotes,
  onNext,
  onPrev,
}) => {
  const [viewMode, setViewMode] = useState<'dates' | 'times'>('dates');
  const dateOptions = useMemo(() => generateDateOptions(), []);

  return (
    <div className="space-y-5 text-right" dir="rtl">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-sky-600" />
          <span>۲. تاریخ و زمان اعزام متخصص</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
          تاریخ مورد نظر خود را انتخاب کرده و سپس ساعت دقیق را مشخص کنید.
        </p>
      </div>

      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => setViewMode('dates')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'dates' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          تاریخ
        </button>
        <button
          type="button"
          onClick={() => setViewMode('times')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${viewMode === 'times' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          disabled={!selectedDate}
        >
          ساعت
        </button>
      </div>

      {viewMode === 'dates' && (
        <div className="space-y-3">
          {dateOptions.map((date) => {
            const isSelected = selectedDate?.dateString === date.dateString;
            return (
              <button
                key={date.dateString}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer text-left ${isSelected ? 'bg-sky-50 border-sky-300 shadow-sm' : 'bg-white border-slate-200 hover:border-slate-300'}`}
              >
                <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  <span className="text-[10px] font-medium">{date.dayOfWeek}</span>
                  <span className="text-lg font-black leading-tight">{date.dayOfMonth}</span>
                  <span className="text-[10px] text-slate-500">{date.monthName}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isSelected ? 'text-sky-700' : 'text-slate-800'}`}>
                      {date.dayOfWeek} {date.dayOfMonth} {date.monthName}
                    </span>
                    {date.isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                        امروز
                      </span>
                    )}
                    {date.isTomorrow && !date.isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold">
                        فردا
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-sky-600 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {viewMode === 'times' && (
        <>
          {!selectedDate && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
              ابتدا یک تاریخ را انتخاب کنید.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              ساعت اعزام متخصص
            </label>
            <div className="space-y-2">
              {TIME_SLOTS.map((slot) => {
                const isSelected = selectedTimeSlot?.id === slot.id;
                const isAvailable = slot.isAvailable;

                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => isAvailable && onSelectTimeSlot(slot)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer text-left ${isSelected && isAvailable ? 'bg-sky-50 border-sky-300 shadow-sm' : isAvailable ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'}`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-sky-600 text-white' : isAvailable ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-300'}`}>
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-bold ${isAvailable ? 'text-slate-800' : 'text-slate-400'}`}>
                        {slot.label}
                      </span>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {slot.startTime} - {slot.endTime}
                      </div>
                    </div>
                    {slot.extraFee && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                        +{slot.extraFee.toLocaleString('fa-IR')} تومان
                      </span>
                    )}
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-sky-600 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-700 block">
          <Clock className="w-3.5 h-3.5 inline mr-1.5" />
          مدت زمان نظافت (ساعت):
        </label>
        <div className="flex gap-2">
          {[2, 3, 4, 5, 6, 8].map((hours) => (
            <button
              key={hours}
              type="button"
              onClick={() => onChangeDuration(hours)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition cursor-pointer ${durationHours === hours ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {hours} ساعت
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          {durationHours} ساعت = {(durationHours * 150000).toLocaleString('fa-IR')} تومان (برآورد)
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-700 block">
          ترجیح جنسیتی متخصص:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'FEMALE' as const, label: 'خانم', icon: '♀' },
            { value: 'MALE' as const, label: 'آقا', icon: '♂' },
            { value: 'NO_PREFERENCE' as const, label: 'بدون ترجیح', icon: '⚬' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChangeGender(option.value)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-bold transition cursor-pointer ${genderPreference === option.value ? 'bg-sky-50 border-sky-300 text-sky-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              <span className="text-lg">{option.icon}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-400" />
          یادداشت یا درخواست خاص (اختیاری):
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => onChangeNotes(e.target.value)}
          placeholder="مثال: لطفاً دسترسی خاصی دارید؟ یادداشت خود را اینجا بنویسید..."
          className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 resize-none"
        />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onPrev}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          ← مرحله قبل
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedDate}
          className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
        >
          تایید و حرکت به مرحله بعد ↑
        </button>
      </div>
    </div>
  );
};
