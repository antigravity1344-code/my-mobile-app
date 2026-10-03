import React, { useState } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../../api/apiClient';
import { setApiAuthToken } from '../../../api/authToken';
import { useProfile } from '../../profile/context/ProfileContext';
import { appStorage } from '../../../utils/storage';
import { saveCustomerSession } from '../../../components/native/customerLoginStorage';
import styles from './MobileAuthModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileAuthModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { login, syncAuthenticatedUser } = useProfile();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 10) {
      setErrorMessage('لطفاً شماره همراه معتبر وارد کنید.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const res = await apiFetch('/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    setLoading(false);
    if (res.success) {
      setStep(2);
      setInfoMessage(res.message || 'کد تایید صادر شد.');
      setOtpCode('');
    } else {
      setErrorMessage(res.message || 'ارسال کد ناموفق بود.');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.trim().length !== 4) {
      setErrorMessage('کد تایید ۴ رقمی را وارد کنید.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    const res = await apiFetch('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code: otpCode, role: 'CUSTOMER' }),
    });
    setLoading(false);
    if (!res.success || !res.user || typeof res.token !== 'string') {
      setErrorMessage(res.message || 'کد تایید نادرست است.');
      return;
    }
    setApiAuthToken(res.token);
    await saveCustomerSession(appStorage, res.user, res.token);
    login(res.user.phone);
    syncAuthenticatedUser({
      id: res.user.id,
      name: res.user.name || '',
      phone: res.user.phone,
      avatar: res.user.avatar,
    });
    setStep(1);
    setInfoMessage(null);
    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.title}>
            {step === 1 ? 'ورود / ثبت‌نام با شماره همراه' : 'تایید کد پیامکی'}
          </h3>
          <button onClick={onClose} className={styles.closeButton} type="button">
            <X size={20} />
          </button>
        </div>

        {errorMessage ? <p className={styles.description} style={{ color: '#fca5a5' }}>{errorMessage}</p> : null}
        {infoMessage && !errorMessage ? <p className={styles.description}>{infoMessage}</p> : null}

        {step === 1 ? (
          <form onSubmit={(e) => void handleSendOtp(e)}>
            <div className={styles.body}>
              <p className={styles.description}>
                شماره همراه خود را وارد کنید. پیامک واقعی ممکن است وصل نباشد؛ در توسعه کد از کنسول سرور خوانده می‌شود.
              </p>
              <div className={styles.inputGroup}>
                <label className={styles.label}>شماره همراه</label>
                <input
                  type="tel"
                  className={styles.input}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="۰۹۱۲xxxxxxx"
                />
              </div>
            </div>
            <div className={styles.footer}>
              <button type="submit" className={styles.submitButton} disabled={loading}>
                {loading ? '...' : 'ارسال کد تایید'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(e) => void handleVerifyOtp(e)}>
            <div className={styles.body}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>کد تایید ۴ رقمی</label>
                <input
                  type="text"
                  className={styles.input}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={4}
                  placeholder="کد ۴ رقمی"
                />
              </div>
            </div>
            <div className={styles.footer}>
              <button type="submit" className={styles.submitButton} disabled={loading}>
                {loading ? '...' : 'تایید و ورود'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
