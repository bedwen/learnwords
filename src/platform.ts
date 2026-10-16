export function isMobileApp(): boolean {
  return import.meta.env.VITE_APP_TARGET === 'mobile';
}
