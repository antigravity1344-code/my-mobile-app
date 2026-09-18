import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useProfile } from '../../profile/context/ProfileContext';
import styles from './MobileAuthModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileAuthModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { login } = useProfile();

  // گام‌های احراز هویت: ۱ = دریافت شماره، ۲ = تایید کد پیامکی
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('09123456789');
  const [otpCode, setOtpCode] = useState('');

  if (!isOpen) return null;

  // مرحله ۱: ارسال درخواست کد پیامکی
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 10) {
      alert('لطفاً شماره همراه معتبر وارد کنید.');
      return;
    }
    setStep(2);
  };

  // مرحله ۲: بررسی و تایید کد پیامکی
  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim() !== '1234' && otpCode.trim().length !== 4) {
      alert('کد تایید وارد شده نادرست است. (کد تست: ۱۲۳۴)');
      return;
    }

    login(phone);
    setStep(1);
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.title}>
            {step === 1 ? 'ورود / ثبت‌نام با شماره همراه' : 'تایید کد پیامکی'}
          </h3>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp}>
            <div className={styles.body}>
              <p className={styles.description}>
                لطفاً شماره همراه خود را وارد کنید تا کد تایید برای شما ارسال شود.
              </p>

              <div className={styles.inputGroup}>
                <label className={styles.label}>شماره همراه</label>
                <input
                  type="tel"
                  className={styles.input}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                />
              </div>
            </div>

            <div className={styles.footer}>
              <button type="submit" className={styles.submitButton}>
                ارسال کد تایید
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div className={styles.body}>
              <p className={styles.description}>
                کد تایید ۴ رقمی ارسال شده به شماره <strong>{phone}</strong> را وارد نمایید.
              </p>

              <div className={styles.inputGroup}>
                <label className={styles.label}>کد تایید (OTP)</label>
                <input
                  type="text"
                  maxLength={4}
                  className={styles.input}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="۱۲۳۴"
                  autoFocus
                />
              </div>

              <div className={styles.hint}>💡 کد تست آزمایشی جهت ورود: ۱۲۳۴ می باشد.</div>
            </div>

            <div className={styles.footer}>
              <button type="submit" className={styles.submitButton}>
                ورود به حساب
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                className={styles.backButton}
              >
                اصلاح شماره همراه
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
