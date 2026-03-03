import { contextBridge, ipcRenderer } from 'electron'

export interface ProcessedImageResult {
  buffer: ArrayBuffer
  width: number
  height: number
  sizeBytes: number
}

export interface LoginResult {
  success: boolean
  cookies?: string
  error?: string
}

export interface LogoutResult {
  success: boolean
  error?: string
}

export interface ApiResponse {
  ok: boolean
  status: number
  statusText: string
  data: unknown
}

export interface ElectronAPI {
  // Authentication
  login: () => Promise<LoginResult>
  getCookies: () => Promise<string | null>
  logout: () => Promise<LogoutResult>
  isEncryptionAvailable: () => Promise<boolean>

  // Image Processing
  processImage: (
    buffer: ArrayBuffer,
    postType: string,
    cropRegion?: { left: number; top: number; width: number; height: number }
  ) => Promise<ProcessedImageResult>

  // App Info
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  getPlatform: () => Promise<NodeJS.Platform>

  // API Requests (bypasses CORS)
  apiRequest: (url: string, options?: RequestInit) => Promise<ApiResponse>
  
  // File Upload (bypasses CORS)
  uploadFile: (url: string, fileData: { name: string; type: string; buffer: ArrayBuffer }, fields: Record<string, string>) => Promise<ApiResponse>
}

const electronAPI: ElectronAPI = {
  // Authentication
  login: () => ipcRenderer.invoke('auth:login'),
  getCookies: () => ipcRenderer.invoke('auth:get-cookies'),
  logout: () => ipcRenderer.invoke('auth:logout'),
  isEncryptionAvailable: () => ipcRenderer.invoke('auth:is-encryption-available'),

  // Image Processing
  processImage: (buffer: ArrayBuffer, postType: string, cropRegion?: { left: number; top: number; width: number; height: number }) =>
    ipcRenderer.invoke('image:process', buffer, postType, cropRegion),

  // App Info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // API Requests (bypasses CORS)
  apiRequest: (url: string, options?: RequestInit) => ipcRenderer.invoke('api:request', url, options),
  
  // File Upload (bypasses CORS)
  uploadFile: (url: string, fileData: { name: string; type: string; buffer: ArrayBuffer }, fields: Record<string, string>) => 
    ipcRenderer.invoke('file:upload', url, fileData, fields),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type augmentation for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
