/// <reference types="vite/client" />

/**
 * Window type augmentation para a API Electron.
 *
 * RUNTIME NOTE: window.electronAPI pode ser undefined se o app
 * rodar no navegador. Use optional chaining (window.electronAPI?.*)
 * em pontos de entrada como auth para evitar crashes.
 */
interface Window {
  electronAPI: import('./electron/preload').ElectronAPI
}
