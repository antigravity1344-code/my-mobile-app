import React, { useState } from 'react';
import { CleaningService } from '../../types/service';
import { Sparkles, Clock, ChevronDown } from 'lucide-react';

interface ServiceSelectorProps {
  selectedService: CleaningService | null;
  onSelectService: (svc: CleaningService) => void;
  onNext: () => void;
}

const FALLBACK_ICON = <Sparkles className="w-5 h-5" />;

export const ServiceSelector: React.FC<ServiceSelectorProps> = ({
  selectedService,
  onSelectService,
  onNext,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const services: CleaningService[] = [
    {
      id: 'general_cleaning',
      title: 'نظافت منزل و محل کار',
      subtitle: 'خدمت استاندارد',
      description: 'نظافت راه پله، سالن، آشپزخانه و اتاق‌ها با نیروهای آموزش‌دیده و تجهیزات حرفه‌ای.',
      iconName: 'home-outline',
      pricingType: 'hourly',
      basePrice: 150000,
      estimatedDurationHours: 4,
      badge: 'پرفروش',
      isVisible: true,
    },
    {
      id: 'deep_cleaning',
      title: 'نظافت عمیق و تخصصی',
      subtitle: 'پاکیزگی عمیق',
      description: 'نظافت عمیق با مواد شیمیایی تخصصی برای منازل دست‌دوم و پس از تعمیرات.',
      iconName: 'sparkles',
      pricingType: 'hourly',
      basePrice: 220000,
      estimatedDurationHours: 5,
      badge: 'تخصصی',
      isVisible: true,
    },
    {
      id: 'sofa_washing',
      title: 'مبل‌شویی تخصصی در محل',
      subtitle: 'شستشوی مبلمان',
      description: 'شستشوی انواع مبلمان، فرش و قالی با دستگاه مکانیزه و خشک‌کن تولیدی.',
      iconName: 'color-palette-outline',
      pricingType: 'count_based',
      basePrice: 250000,
      estimatedDurationHours: 3,
      badge: 'در دسترس',
      isVisible: true,
    },
    {
      id: 'end_of_tenant',
      title: 'نظافت پایان اجاره',
      subtitle: 'برگشتی کامل',
      description: 'نظافت کامل و نهایی واحد برای ترخیص و اخذ ضمانت بازگشت.',
      iconName: 'home-outline',
      pricingType: 'fixed',
      basePrice: 850000,
      estimatedDurationHours: 8,
      badge: 'تخفیف',
      isVisible: true,
    },
    {
      id: 'office_cleaning',
      title: 'نظافت شرکت و دفتر کار',
      subtitle: 'خدمت سازمانی',
      description: 'نظافت منظم دفاتر، سیستم‌های هوافضا و مسیرهای عمومی.',
      iconName: 'briefcase-outline',
      pricingType: 'hourly',
      basePrice: 180000,
      estimatedDurationHours: 4,
      badge: 'سازمانی',
      isVisible: true,
    },
    {
      id: 'construction_cleanup',
      title: 'پاکسازی سایت‌های ساختمانی',
      subtitle: 'پاکسازی سازه‌ای',
      description: 'جداسازی و دفع مواد ساختمانی، پاکسازی دوره‌ای سایت‌ها.',
      iconName: 'hard-hat',
      pricingType: 'fixed',
      basePrice: 400000,
      estimatedDurationHours: 6,
      badge: 'صنعتی',
      isVisible: true,
    },
  ];

  const visibleServices = services.filter(s => s.isVisible);

  const renderIcon = (_iconName: string) => {
    // For now all icons render as Sparkles since we don't have the actual icon mapping
    return FALLBACK_ICON;
  };

  return (
    <div className="space-y-5 text-right" dir="rtl">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-sky-600" />
          <span>۱. انتخاب نوع سرویس نظافت</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
          خدمتی که نیاز دارید را انتخاب کنید. قیمت‌ها به‌صورت ساعتی یا ثابت محاسبه می‌شوند.
        </p>
      </div>

      <div className="space-y-3">
        {visibleServices.map((svc) => {
          const isSelected = selectedService?.id === svc.id;
          const isExpanded = expandedId === svc.id;
          const priceLabel = svc.pricingType === 'hourly'
            ? `${svc.basePrice.toLocaleString('fa-IR')} یلا/ساعت`
            : `${svc.basePrice.toLocaleString('fa-IR')} یلا`;

          return (
            <div
              key={svc.id}
              className={`rounded-2xl border transition cursor-pointer overflow-hidden bg-white shadow-sm ${isSelected ? 'border-sky-300 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
              onClick={() => onSelectService(svc)}
            >
              <div
                className="flex items-center gap-3 p-4"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(svc.id);
                }}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {renderIcon(svc.iconName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">
                      {svc.title}
                    </h3>
                    {svc.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200">
                        {svc.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{svc.subtitle}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-black text-emerald-600">{priceLabel}</div>
                  {svc.estimatedDurationHours && (
                    <div className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{svc.estimatedDurationHours} ساعت</span>
                    </div>
                  )}
                </div>
                <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-600 leading-relaxed">{svc.description}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectService(svc);
                        onNext();
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition cursor-pointer shadow-sm"
                    >
                      انتخاب و ادامه →
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
        >
          ← مرحله قبل
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!selectedService}
          className="flex items-center gap-1.5 rounded-xl bg-sky-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
        >
          تایید و حرکت به مرحله بعد ↑
        </button>
      </div>
    </div>
  );
};
