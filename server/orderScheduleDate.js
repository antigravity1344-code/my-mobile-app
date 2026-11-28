const { gregorianToJalali, tehranWallParts } = require('./jalaliMonth');

const displayDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const dayMs = 24 * 60 * 60 * 1000;
const relativeDays = new Map([['امروز', 0], ['فردا', 1], ['پسفردا', 2], ['3روزبعد', 3]]);

function ascii(value) {
  return value.replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
}

function numericDay(raw) {
  const match = ascii(raw).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year >= 1700) {
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    return date.getUTCDate() === day && date.getUTCMonth() + 1 === month ? date : null;
  }
  if (year < 1200 || year >= 1600) return null;
  const daysSinceNowruz = (month <= 7 ? (month - 1) * 31 : 186 + (month - 7) * 30) + day - 1;
  const approx = Date.UTC(year + 621, 2, 21 + daysSinceNowruz, 12);
  for (let offset = -4; offset <= 4; offset++) {
    const date = new Date(approx + offset * dayMs);
    const [jy, jm, jd] = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    if (jy === year && jm === month && jd === day) return date;
  }
  return null;
}

function tehranDate(instant, offset = 0) {
  const ms = typeof instant === 'string' ? Date.parse(instant) : NaN;
  if (!Number.isFinite(ms)) return null;
  const { year, month, day } = tehranWallParts(ms);
  return new Date(Date.UTC(year, month - 1, day + offset, 12));
}

function orderScheduleDate(order) {
  const raw = typeof order.date === 'string' ? order.date.trim() : '';
  const offset = relativeDays.get(ascii(raw).replace(/[\s\u200c]/g, ''));
  const date = numericDay(raw) ?? (offset == null ? null : tehranDate(order.createdAt, offset))
    ?? tehranDate(order.expectedStartAt);
  if (!date) return { dateLabel: raw ? 'تاریخ دقیق ثبت نشده' : null, dateKey: null };
  const parts = Object.fromEntries(displayDate.formatToParts(date).map(({ type, value }) => [type, value]));
  const day = gregorianToJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  return {
    dateLabel: [parts.weekday, parts.day, parts.month, parts.year].join(' '),
    dateKey: day.map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0')).join('-'),
  };
}

module.exports = { orderScheduleDate };
