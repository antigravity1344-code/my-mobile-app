'use strict';

// Same Tehran wall-clock and Jalali conversion as the client display helpers.
// A monthly report uses the calendar day in Asia/Tehran, not the UTC day.
const TEHRAN_FIXED_OFFSET_MS = (3 * 60 + 30) * 60 * 1000;
const MONTH_DAY_TOTALS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function gregorianToJalali(gy, gm, gd) {
  let jy;
  let adjustedGy = gy;
  if (adjustedGy > 1600) {
    jy = 979;
    adjustedGy -= 1600;
  } else {
    jy = 0;
    adjustedGy -= 621;
  }
  const gy2 = gm > 2 ? adjustedGy + 1 : adjustedGy;
  let days = 365 * adjustedGy
    + Math.floor((gy2 + 3) / 4)
    - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400)
    - 80
    + gd
    + MONTH_DAY_TOTALS[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function tehranWallParts(instantMs) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instantMs));
    const part = (type) => Number(parts.find((item) => item.type === type)?.value);
    const wall = { year: part('year'), month: part('month'), day: part('day') };
    if (Object.values(wall).every(Number.isFinite) && wall.year > 1900 && wall.month >= 1 && wall.day >= 1) {
      return wall;
    }
  } catch {
    // fall through to the fixed offset used since 1401
  }
  const shifted = new Date(instantMs + TEHRAN_FIXED_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function jalaliMonthFromIso(value) {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const wall = tehranWallParts(ms);
  const [year, month] = gregorianToJalali(wall.year, wall.month, wall.day);
  if (!Number.isSafeInteger(year) || year < 1 || !Number.isSafeInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

module.exports = { gregorianToJalali, jalaliMonthFromIso };
