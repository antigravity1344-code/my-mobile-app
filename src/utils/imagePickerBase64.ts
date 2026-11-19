import type * as ImagePicker from 'expo-image-picker';

/**
 * روی برخی گوشی‌ها/نسخه‌های اندروید (مخصوصاً وقتی انتخابگر سیستمی گالری مثل Google Photos
 * استفاده می‌شود)، expo-image-picker با allowsEditing فعال، فیلد base64 را در asset برنمی‌گرداند
 * حتی با وجود گزینهٔ base64:true — بدون هیچ خطا یا استثنایی. اگر این مقدار را نادیده بگیریم و
 * فقط return کنیم، آپلود بی‌سروصدا شکست می‌خورد و کاربر هیچ بازخوردی نمی‌بیند.
 * این تابع در آن حالت، فایل را مستقیماً از روی uri با expo-file-system به‌صورت base64 می‌خواند.
 */
export async function resolveAssetBase64(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  if (asset.base64) return asset.base64;
  if (!asset.uri) return null;
  try {
    const { readAsStringAsync, EncodingType } = await import('expo-file-system/legacy');
    const base64 = await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 });
    return base64 || null;
  } catch {
    return null;
  }
}
