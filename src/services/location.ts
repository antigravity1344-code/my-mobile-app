import * as Location from 'expo-location';
import { AddressCoordinates } from '../types/booking';

export interface LocationPermission {
  granted: boolean;
  errorMessage?: string;
}

export const requestLocationPermission = async (): Promise<LocationPermission> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { granted: false, errorMessage: 'مجوز دسترسی به موقعیت جغرافیایی رد شد.' };
    }
    return { granted: true };
  } catch (error) {
    return {
      granted: false,
      errorMessage: error instanceof Error ? error.message : 'خطای نامعتبر در درخواست موقعیت',
    };
  }
};

export const getCurrentPosition = async (): Promise<AddressCoordinates | null> => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch {
    return null;
  }
};

export const watchUserLocation = async (
  onUpdate: (coords: AddressCoordinates) => void,
  onStop: () => void,
): Promise<Location.LocationSubscription> => {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
    },
    (location) => {
      onUpdate({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }
  );

  return {
    remove: () => {
      subscription.remove();
      onStop();
    },
  };
};
