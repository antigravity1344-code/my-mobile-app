const { KavenegarApi } = require('kavenegar');

function readConfig(env = process.env) {
  return {
    apiKey: typeof env.KAVENEGAR_API_KEY === 'string' ? env.KAVENEGAR_API_KEY.trim() : '',
    template: typeof env.KAVENEGAR_OTP_TEMPLATE === 'string' ? env.KAVENEGAR_OTP_TEMPLATE.trim() : '',
  };
}

function normalizeIranMobile(phone) {
  const ascii = String(phone || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const digits = ascii.replace(/\D/g, '');
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^989\d{9}$/.test(digits)) return '0' + digits.slice(2);
  if (/^9\d{9}$/.test(digits)) return '0' + digits;
  return null;
}

function useFakeSms(env = process.env) {
  return env.NODE_ENV === 'test' || env.PAKSHO_SMS_MODE === 'fake';
}

function sendOtp(phone, code, options = {}) {
  const recipient = normalizeIranMobile(phone);
  if (!recipient) return Promise.resolve({ ok: false, reason: 'invalid-phone' });
  if (!/^\d{4}$/.test(String(code))) return Promise.resolve({ ok: false, reason: 'invalid-code' });

  const config = options.config || readConfig(options.env);
  if (!config.apiKey || !config.template) {
    return Promise.resolve({ ok: false, reason: 'not-configured' });
  }

  const api = options.api || KavenegarApi({ apikey: config.apiKey });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      api.VerifyLookup(
        {
          receptor: recipient,
          token: String(code),
          template: config.template,
        },
        (_entries, status) => {
          if (status === 200) finish({ ok: true });
          else finish({ ok: false, reason: 'rejected', status: typeof status === 'number' ? status : null });
        }
      );
    } catch {
      finish({ ok: false, reason: 'network', status: null });
    }
  });
}

module.exports = {
  readConfig,
  normalizeIranMobile,
  useFakeSms,
  sendOtp,
};
