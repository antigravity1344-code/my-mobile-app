// اعلام انواع داده برای فایل‌های CSS Modules
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}
