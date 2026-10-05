export const GPS_WAIT_MS = 12_000;

export type GpsUiStatus = 'idle' | 'loading' | 'success' | 'denied' | 'timeout' | 'empty';

export type GpsFixResult<T> = {
  status: Exclude<GpsUiStatus, 'idle' | 'loading'>;
  coordinates: T | null;
  message?: string;
};

type PermissionResult = { granted: boolean; errorMessage?: string };

const wait = (ms: number) =>
  new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));

/**
 * UI-only wait around the existing location helpers.
 * Does not change permission prompts, coordinate math, or what gets stored.
 * A hung call resolves as `timeout` so the form can fall back to a typed address.
 * If coordinates arrive after the wait, `onLateCoordinates` can still apply them.
 */
export async function resolveGpsFix<T>({
  requestPermission,
  getPosition,
  waitMs = GPS_WAIT_MS,
  onLateCoordinates,
}: {
  requestPermission: () => Promise<PermissionResult>;
  getPosition: () => Promise<T | null>;
  waitMs?: number;
  onLateCoordinates?: (coordinates: T) => void;
}): Promise<GpsFixResult<T>> {
  const permissionRace = await Promise.race([requestPermission(), wait(waitMs)]);
  if (permissionRace === 'timeout') {
    return {
      status: 'timeout',
      coordinates: null,
      message: 'دریافت اجازهٔ موقعیت طول کشید.',
    };
  }

  if (!permissionRace.granted) {
    return {
      status: 'denied',
      coordinates: null,
      message: permissionRace.errorMessage || 'اجازهٔ موقعیت داده نشد.',
    };
  }

  let late = false;
  const pending = getPosition().then((coordinates) => {
    if (late && coordinates) onLateCoordinates?.(coordinates);
    return coordinates;
  });

  const positionRace = await Promise.race([
    pending.then((coordinates) => ({ kind: 'value' as const, coordinates })),
    wait(waitMs).then(() => ({ kind: 'timeout' as const })),
  ]);

  if (positionRace.kind === 'timeout') {
    late = true;
    return {
      status: 'timeout',
      coordinates: null,
      message: 'پیدا کردن موقعیت بیشتر از حد انتظار طول کشید.',
    };
  }

  if (!positionRace.coordinates) {
    return {
      status: 'empty',
      coordinates: null,
      message: 'موقعیتی برنگشت.',
    };
  }

  return { status: 'success', coordinates: positionRace.coordinates };
}

export function gpsStatusCopy(
  status: GpsUiStatus,
  detail?: string | null,
): { title: string; body: string } | null {
  switch (status) {
    case 'loading':
      return {
        title: 'در حال پیدا کردن موقعیت شما',
        body: 'چند لحظه صبر کنید. هر وقت خواستید می‌توانید آدرس را دستی بنویسید.',
      };
    case 'timeout':
      return {
        title: 'موقعیت کمی طول کشید',
        body: detail || 'می‌توانید یک بار دیگر تلاش کنید، یا محله و نشانی را همین پایین بنویسید.',
      };
    case 'denied':
      return {
        title: 'اجازهٔ موقعیت داده نشد',
        body: detail || 'اشکالی ندارد. محله و نشانی را دستی وارد کنید تا سفارش ثبت شود.',
      };
    case 'empty':
      return {
        title: 'موقعیتی پیدا نشد',
        body: detail || 'آدرس را دستی بنویسید. ثبت سفارش به مختصات نقشه وابسته نیست.',
      };
    case 'success':
      return {
        title: 'موقعیت ثبت شد',
        body: 'اگر نشانی دقیق‌تر است، فیلدهای پایین را کامل کنید.',
      };
    default:
      return null;
  }
}
