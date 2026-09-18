import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useProfile } from '../context/ProfileContext';
import styles from './AddressManagerModal.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AddressManagerModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { addSavedAddress } = useProfile();

  // فیلدهای فرم افزودن آدرس
  const [title, setTitle] = useState('');
  const [district, setDistrict] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [plaque, setPlaque] = useState('');
  const [unit, setUnit] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  if (!isOpen) return null;

  // ثبت آدرس جدید و بسته شدن مدال
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !district || !fullAddress || !plaque || !recipientName || !contactPhone) {
      alert('لطفا تمامی فیلدهای ضروری را پر کنید.');
      return;
    }

    addSavedAddress({
      title,
      district,
      fullAddress,
      plaque,
      unit,
      recipientName,
      contactPhone,
      isDefault: false,
    });

    onClose();
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>افزودن آدرس جدید</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.label}>عنوان آدرس (مثلا: خانه، شرکت)</label>
              <input
                type="text"
                className={styles.input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="خانه"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>نام محله</label>
              <input
                type="text"
                className={styles.input}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="سعادت‌آباد"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>نشانی دقیق متنی</label>
              <input
                type="text"
                className={styles.input}
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder="بلوار دریا، خیابان صرافها..."
              />
            </div>

            <div className={styles.rowGroup}>
              <div className={styles.formGroup}>
                <label className={styles.label}>پلاک</label>
                <input
                  type="text"
                  className={styles.input}
                  value={plaque}
                  onChange={(e) => setPlaque(e.target.value)}
                  placeholder="۱۲"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>واحد (اختیاری)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="۴"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>نام تحویل‌گیرنده</label>
              <input
                type="text"
                className={styles.input}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="محمد محمدی"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>شماره همراه تحویل‌گیرنده</label>
              <input
                type="text"
                className={styles.input}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              انصراف
            </button>
            <button type="submit" className={styles.submitButton}>
              ذخیره آدرس
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
