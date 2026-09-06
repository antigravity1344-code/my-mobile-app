import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, Clock, CircleDot, AlertCircle } from 'lucide-react-native';
import type { OrderTimelineEvent } from '../types/order';

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
                  <AlertCircle size={14} color="#dc2626" />
                ) : event.isCompleted && !event.isCurrent ? (
                  <Check size={12} color="#fff" />
                ) : event.isCurrent ? (
                  <CircleDot size={14} color="#0284c7" />
                ) : (
                  <Clock size={12} color="#94a3b8" />
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
                <Text style={styles.timestamp}>{event.timestamp}</Text>
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
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circleCompleted: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  circleCurrent: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  circleCancelled: {
    backgroundColor: '#fee2e2',
    borderColor: '#dc2626',
  },
  line: {
    flex: 1,
    width: 2,
    minHeight: 28,
    backgroundColor: '#e2e8f0',
    marginVertical: 2,
  },
  lineCompleted: {
    backgroundColor: '#10b981',
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
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
  },
  titleCurrent: {
    color: '#0284c7',
    fontWeight: '800',
  },
  titleCancelled: {
    color: '#dc2626',
    fontWeight: '800',
  },
  timestamp: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: 'monospace',
  },
  description: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'right',
    lineHeight: 17,
  },
});
