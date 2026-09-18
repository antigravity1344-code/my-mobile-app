import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Clock,
  CheckCircle2,
  Sparkles,
  Check,
  AlertTriangle,
  User,
} from 'lucide-react-native';
import type { OrderStatus } from '../types/order';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
    Icon: React.ComponentType<{ size: number; color: string }>;
  }
> = {
  PENDING: {
    label: 'در انتظار تأیید',
    bg: '#fef3c7',
    text: '#92400e',
    border: '#fde68a',
    Icon: Clock,
  },
  CONFIRMED: {
    label: 'تأیید شده',
    bg: '#e0f2fe',
    text: '#0369a1',
    border: '#bae6fd',
    Icon: CheckCircle2,
  },
  ASSIGNED: {
    label: 'تخصیص متخصص',
    bg: '#ede9fe',
    text: '#6d28d9',
    border: '#ddd6fe',
    Icon: User,
  },
  IN_PROGRESS: {
    label: 'در حال انجام',
    bg: '#dcfce7',
    text: '#15803d',
    border: '#bbf7d0',
    Icon: Sparkles,
  },
  COMPLETED: {
    label: 'انجام شده',
    bg: '#ccfbf1',
    text: '#0f766e',
    border: '#99f6e4',
    Icon: Check,
  },
  CANCELLED: {
    label: 'لغو شده',
    bg: '#fee2e2',
    text: '#b91c1c',
    border: '#fecaca',
    Icon: AlertTriangle,
  },
};

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({
  status,
  size = 'md',
}) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const IconComponent = config.Icon;
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.border },
        isSmall && styles.badgeSm,
      ]}
    >
      <IconComponent size={isSmall ? 12 : 14} color={config.text} />
      <Text
        style={[
          styles.text,
          { color: config.text },
          isSmall && styles.textSm,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  textSm: {
    fontSize: 10,
    fontWeight: '600',
  },
});
