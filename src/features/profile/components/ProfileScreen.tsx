import React, { useState } from 'react';
import {
  User,
  Wallet,
  Crown,
  MapPin,
  Plus,
  Trash2,
  LogOut,
} from 'lucide-react';
import { useProfile } from '../context/ProfileContext';
import { AddressManagerModal } from './AddressManagerModal';
import styles from './ProfileScreen.module.css';

interface Props {
  onOpenLoginModal?: () => void;
}

export const ProfileScreen: React.FC<Props> = ({ onOpenLoginModal }) => {
  const { profile, removeSavedAddress, setDefaultAddress, logout } = useProfile();
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // تبدیل اعداد به فرمت هزارتایی تومانی
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fa-IR').format(amount) + ' تومان';
  };

  if (!profile.isLoggedIn) {
    return (
      <div className={styles.container}>
        <div className={styles.section} style={{ textAlign: 'center', padding: '2rem 1rem' }}>
          <User size={48} color="#94a3b8" style={{ margin: '0 auto 1rem auto' }} />
          <h3 className={styles.sectionTitle} style={{ justifyContent: 'center' }}>
            وارد حساب کاربری خود شوید
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            برای مشاهده سفارش‌ها، باشگاه مشتریان و کیف پول وارد شوید.
          </p>
          <button
            onClick={onOpenLoginModal}
            className={styles.addButton}
            style={{ margin: '0 auto', padding: '0.625rem 1.5rem', fontSize: '0.875rem' }}
          >
            ورود / ثبت‌نام با شماره همراه
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* کارت اصلی اطلاعات کاربر */}
      <div className={styles.profileCard}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>
            {profile.fullName ? profile.fullName.charAt(0) : 'ک'}
          </div>
          <div>
            <h2 className={styles.name}>{profile.fullName}</h2>
            <p className={styles.phone}>{profile.phoneNumber}</p>
          </div>
        </div>
        <button className={styles.editButton}>ویرایش</button>
      </div>

      {/* خلاصه کیف پول و باشگاه مشتریان */}
      <div className={styles.gridTwo}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Wallet size={16} />
            <span>موجودی کیف پول</span>
          </div>
          <div className={styles.cardValue}>{formatCurrency(profile.walletBalance)}</div>
          <div className={styles.cardSubtext}>+ شارژ سریع آنلاین</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Crown size={16} color="#eab308" />
            <span>باشگاه مشتریان</span>
          </div>
          <div className={styles.cardValue}>{profile.loyalty.title}</div>
          <div className={styles.cardSubtext}>
            {profile.loyalty.discountPercentage}٪ تخفیف روی تمام خدمات
          </div>
        </div>
      </div>

      {/* بخش آدرس‌های ذخیره‌شده */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>
            <MapPin size={18} color="#0284c7" />
            <span>آدرس‌های ذخیره‌شده</span>
          </h3>
          <button onClick={() => setIsAddressModalOpen(true)} className={styles.addButton}>
            <Plus size={14} />
            <span>آدرس جدید</span>
          </button>
        </div>

        <div className={styles.addressList}>
          {profile.savedAddresses.map((addr) => (
            <div
              key={addr.id}
              className={`${styles.addressCard} ${addr.isDefault ? styles.addressCardActive : ''}`}
              onClick={() => setDefaultAddress(addr.id)}
            >
              <div className={styles.addressContent}>
                <div className={styles.addressHeader}>
                  <span className={styles.addressTag}>{addr.title}</span>
                  {addr.isDefault && <span className={styles.defaultBadge}>پیش‌فرض</span>}
                </div>
                <p className={styles.addressText}>
                  {addr.district}، {addr.fullAddress}، پلاک {addr.plaque}
                  {addr.unit ? `، واحد ${addr.unit}` : ''}
                </p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeSavedAddress(addr.id);
                }}
                className={styles.deleteButton}
                title="حذف آدرس"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* دکمه خروج از حساب */}
      <button onClick={logout} className={styles.logoutButton}>
        <LogOut size={16} />
        <span>خروج از حساب کاربری</span>
      </button>

      {/* مدال افزودن آدرس */}
      <AddressManagerModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
      />
    </div>
  );
};
