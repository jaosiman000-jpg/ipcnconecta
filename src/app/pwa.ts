export function registerServiceWorker() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // O aplicativo continua funcionando normalmente quando o navegador não aceita PWA.
    })
  })
}
