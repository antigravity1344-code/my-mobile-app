import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Clock, CircleDot, AlertCircle } from 'lucide-react-native';
import type { OrderTimelineEvent } from '../types/order';
import { formatJalaliDateTime } from '../../../utils/jalaliDisplay';
import { colors, fontFamily, ui } from '../../../theme';

interface OrderTrackingTimelineProps {
  events: OrderTimelineEvent[];
}

export const OrderTrackingTimeline: React.FC<OrderTrackingTimelineProps> = ({ events }) => {
  if (!events || events.length === 0) return null;

  return (
    <View style={styles.container}>
      {events.map((event, index) => {
        const isLast = index === events.length - 1;
        const isCancelled = event.step === 'CANCELLED';

        return (
          <View key={`${event.step}-${index}`} style={styles.timelineItem}>
            {/* Right side icon + vertical connecting line */}
            <View style={styles.indicatorCol}>
              <View
                style={[
                  styles.circle,
                  event.isCompleted && styles.circleCompleted,
                  event.isCurrent && styles.circleCurrent,
                  isCancelled && styles.circleCancelled,
                ]}
              >
                {isCancelled ? (
                  <AlertCircle size={14} color={ui.dangerText} />
                ) : event.isCompleted && !event.isCurrent ? (
                  <Check size={12} color={colors.white} />
                ) : event.isCurrent ? (
                  <CircleDot size={14} color={colors.teal} />
                ) : (
                  <Clock size={12} color={colors.mutedLight} />
                )}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    event.isCompleted && styles.lineCompleted,
                  ]}
                />
              )}
            </View>

            {/* Left side text information */}
            <View style={styles.contentCol}>
              <View style={styles.titleRow}>
                <Text
                  style={[
                    styles.title,
                    event.isCurrent && styles.titleCurrent,
                    isCancelled && styles.titleCancelled,
                  ]}
                >
                  {event.title}
                </Text>
                <Text style={styles.timestamp}>{formatJalaliDateTime(event.timestamp, { withTime: true }) || event.timestamp}</Text>
              </View>
              {Boolean(event.description) && (
                <Text style={styles.description}>{event.description}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  timelineItem: {
    flexDirection: 'row-reverse',
    marginBottom: 4,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ui.neutralBg,
    borderWidth: 2,
    borderColor: ui.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circleCompleted: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  circleCurrent: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  circleCancelled: {
    backgroundColor: ui.dangerBg,
    borderColor: '#dc2626',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 28,
    backgroundColor: ui.neutralBg,
    marginVertical: 2,
  },
  lineCompleted: {
    backgroundColor: colors.teal,
  },
  contentCol: {
    flex: 1,
    marginRight: 12,
    paddingBottom: 16,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'right',
  },
  titleCurrent: {
    color: colors.teal,
    fontFamily: fontFamily.bold,
  },
  titleCancelled: {
    color: ui.dangerText,
    fontFamily: fontFamily.bold,
  },
  timestamp: {
    fontSize: 12,
    color: colors.mutedLight,
    fontFamily: 'monospace',
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'right',
    lineHeight: 17,
  },
});
