import React from 'react';
import { Modal, type ModalProps } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

type BottomSheetModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  animationType?: ModalProps['animationType'];
  children: (bottomInset: number) => React.ReactNode;
};

function BottomInsetConsumer({
  children,
}: {
  children: (bottomInset: number) => React.ReactNode;
}) {
  const { bottom } = useSafeAreaInsets();
  return <>{children(bottom)}</>;
}

/**
 * Bottom sheet hosted in a React Native Modal.
 * The modal window is a separate native root and draws under the Android
 * gesture bar. Seeding SafeAreaProvider with the activity insets keeps the
 * sheet actions above that bar instead of a fixed padding guess.
 */
export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onRequestClose,
  animationType = 'slide',
  children,
}) => (
  <Modal visible={visible} transparent animationType={animationType} onRequestClose={onRequestClose}>
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <BottomInsetConsumer>{children}</BottomInsetConsumer>
    </SafeAreaProvider>
  </Modal>
);
