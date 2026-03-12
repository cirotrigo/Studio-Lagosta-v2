import { contextBridge, ipcRenderer } from 'electron'
import {
  KONVA_CHANNELS,
  type KonvaTemplateDocument,
  type SyncPullResult,
  type SyncPushResult,
  type SyncStatus,
} from './ipc/konva-ipc-types'
import { KONVA_EXPORT_CHANNELS } from './ipc/export-channels'

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

export type ArtFormat = 'STORY' | 'FEED_PORTRAIT' | 'SQUARE'

export interface GenerateAiTextPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  variations: 1 | 2 | 4
  templateIds?: string[]
  includeLogo: boolean
  usePhoto: boolean
  photoUrl?: string
  compositionEnabled?: boolean
  compositionPrompt?: string
  compositionReferenceUrls?: string[]
  analyzeImageForContext?: boolean
  analysisImageUrl?: string
}

export interface GenerateAiTextVariation {
  pre_title: string
  title: string
  description: string
  cta: string
  badge: string
  footer_info_1: string
  footer_info_2: string
}

export interface GenerateAiTextKnowledgeHit {
  entryId: string
  title: string
  category: string
  content: string
  score: number
  source: 'rag' | 'fallback-db'
}

export interface GenerateAiTextKnowledge {
  applied: boolean
  context: string
  categoriesUsed: string[]
  hits: GenerateAiTextKnowledgeHit[]
}

export interface GenerateAiTextImageAnalysis {
  requested: boolean
  applied: boolean
  sourceImageUrl?: string
  summary: string
  sceneType: string
  confidence: number
  dishNameCandidates: string[]
  ingredientsHints: string[]
  matchedKnowledge?: {
    entryId: string
    title: string
    category: 'CARDAPIO' | 'CAMPANHAS'
    score: number
    reason: string
  }
  warnings: string[]
}

export interface GenerateAiTextResponse {
  variacoes: GenerateAiTextVariation[]
  knowledge?: GenerateAiTextKnowledge
  imageAnalysis?: GenerateAiTextImageAnalysis
  warnings?: string[]
  conflicts?: string[]
}

export interface GenerateAiBackgroundPayload {
  projectId: number
  prompt: string
  format: ArtFormat
  referenceUrls?: string[]
}

export interface GenerateAiBackgroundResponse {
  imageUrl: string
  prompt: string
  provider: string
  modelUsed: string
  fallbackModel: string
  fallbackUsed: boolean
  referenceCount: number
  persisted: boolean
  persistedImageUrl?: string
  warnings: string[]
}

export interface RenderTextArgs {
  imageBuffer: ArrayBuffer
  textLayout: any
  fonts: { title: string; body: string }
  fontUrls?: { title?: string; body?: string }
  logoUrl?: string
  logoPosition?: string
  logoSizePct?: number
}

export interface RenderHtmlSnapshotArgs {
  html: string
  width: number
  height: number
  mimeType?: 'image/jpeg' | 'image/png'
  quality?: number
}

// Export types
export interface ExportSinglePayload {
  imageData: string
  fileName: string
  format: ArtFormat
  mimeType: 'image/png' | 'image/jpeg'
  quality?: number
  outputDir?: string
}

export interface ExportSingleResult {
  ok: true
  filePath: string
  fileName: string
  sizeBytes: number
}

export interface ExportBatchPayload {
  items: Array<{
    imageData: string
    fileName: string
    format: ArtFormat
    variationIndex?: number
    pageIndex?: number
  }>
  mimeType: 'image/png' | 'image/jpeg'
  quality?: number
  outputDir?: string
}

export interface ExportBatchResult {
  ok: true
  files: Array<{
    filePath: string
    fileName: string
    sizeBytes: number
    variationIndex?: number
    pageIndex?: number
  }>
  outputDir: string
  totalBytes: number
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

  // Logo Overlay
  overlayLogo: (
    imageBuffer: ArrayBuffer,
    logoUrl: string,
    position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left',
    sizePct: number
  ) => Promise<{ ok: boolean; buffer?: ArrayBuffer; error?: string }>

  // Text Rendering (text + overlay + logo via Sharp SVG) — legacy flow
  renderText: (args: RenderTextArgs) => Promise<{ ok: boolean; buffer?: ArrayBuffer; error?: string }>

  // Template Layout 2-Pass — new flow
  measureTextLayout: (draft: any) => Promise<any>
  renderFinalLayout: (finalLayout: any, imageBuffer: ArrayBuffer, logo?: any) => Promise<{ ok: boolean; buffer?: ArrayBuffer; error?: string }>
  renderHtmlSnapshot: (args: RenderHtmlSnapshotArgs) => Promise<{ ok: boolean; buffer?: ArrayBuffer; mimeType?: 'image/jpeg' | 'image/png'; error?: string }>

  // App Info
  getVersion: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  getPlatform: () => Promise<NodeJS.Platform>

  // API Requests (bypasses CORS)
  apiRequest: (url: string, options?: RequestInit) => Promise<ApiResponse>

  // Art automation contracts
  generateAIText: (payload: GenerateAiTextPayload) => Promise<GenerateAiTextResponse>
  generateAIBackground: (payload: GenerateAiBackgroundPayload) => Promise<GenerateAiBackgroundResponse>
  
  // File Upload (bypasses CORS)
  uploadFile: (url: string, fileData: { name: string; type: string; buffer: ArrayBuffer }, fields: Record<string, string>) => Promise<ApiResponse>
  
  // Blob Download (bypasses CORS for binary data)
  downloadBlob: (url: string) => Promise<{ ok: boolean; status: number; buffer?: ArrayBuffer; contentType?: string; error?: string }>

  // Konva-only template contracts
  konvaTemplates: {
    list: (projectId: number) => Promise<KonvaTemplateDocument[]>
    get: (projectId: number, templateId: string) => Promise<KonvaTemplateDocument | null>
    save: (projectId: number, doc: KonvaTemplateDocument) => Promise<{ ok: true; id: string }>
    delete: (projectId: number, templateId: string) => Promise<{ ok: true }>
  }

  // Konva-only sync contracts
  konvaSync: {
    pull: (projectId: number) => Promise<SyncPullResult>
    push: (projectId: number) => Promise<SyncPushResult>
    status: (projectId: number) => Promise<SyncStatus>
  }

  // Konva export contracts
  exportSingle: (payload: ExportSinglePayload) => Promise<ExportSingleResult>
  exportBatch: (payload: ExportBatchPayload) => Promise<ExportBatchResult>
  pickExportDirectory: () => Promise<string | null>
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

  // Logo Overlay
  overlayLogo: (imageBuffer: ArrayBuffer, logoUrl: string, position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left', sizePct: number) =>
    ipcRenderer.invoke('image:overlay-logo', imageBuffer, logoUrl, position, sizePct),

  // Text Rendering (text + overlay + logo via Sharp SVG) — legacy flow
  renderText: (args: RenderTextArgs) => ipcRenderer.invoke('image:render-text', args),

  // Template Layout 2-Pass — new flow
  measureTextLayout: (draft: any) => ipcRenderer.invoke('image:measure-text-layout', draft),
  renderFinalLayout: (finalLayout: any, imageBuffer: ArrayBuffer, logo?: any) =>
    ipcRenderer.invoke('image:render-final-layout', finalLayout, imageBuffer, logo),
  renderHtmlSnapshot: (args: RenderHtmlSnapshotArgs) => ipcRenderer.invoke('image:render-html-snapshot', args),

  // App Info
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),

  // API Requests (bypasses CORS)
  apiRequest: (url: string, options?: RequestInit) => ipcRenderer.invoke('api:request', url, options),

  // Art automation contracts
  generateAIText: (payload: GenerateAiTextPayload) => ipcRenderer.invoke('generate-ai-text', payload),
  generateAIBackground: (payload: GenerateAiBackgroundPayload) =>
    ipcRenderer.invoke('generate-ai-background', payload),
  
  // File Upload (bypasses CORS)
  uploadFile: (url: string, fileData: { name: string; type: string; buffer: ArrayBuffer }, fields: Record<string, string>) => 
    ipcRenderer.invoke('file:upload', url, fileData, fields),

  // Blob Download (bypasses CORS for binary data)
  downloadBlob: (url: string) => ipcRenderer.invoke('blob:download', url),

  // Konva-only template contracts
  konvaTemplates: {
    list: (projectId: number) => ipcRenderer.invoke(KONVA_CHANNELS.TEMPLATE_LIST, projectId),
    get: (projectId: number, templateId: string) =>
      ipcRenderer.invoke(KONVA_CHANNELS.TEMPLATE_GET, projectId, templateId),
    save: (projectId: number, doc: KonvaTemplateDocument) =>
      ipcRenderer.invoke(KONVA_CHANNELS.TEMPLATE_SAVE, projectId, doc),
    delete: (projectId: number, templateId: string) =>
      ipcRenderer.invoke(KONVA_CHANNELS.TEMPLATE_DELETE, projectId, templateId),
  },

  // Konva-only sync contracts
  konvaSync: {
    pull: (projectId: number) => ipcRenderer.invoke(KONVA_CHANNELS.SYNC_PULL, projectId),
    push: (projectId: number) => ipcRenderer.invoke(KONVA_CHANNELS.SYNC_PUSH, projectId),
    status: (projectId: number) => ipcRenderer.invoke(KONVA_CHANNELS.SYNC_STATUS, projectId),
  },

  // Konva export contracts
  exportSingle: (payload: ExportSinglePayload) =>
    ipcRenderer.invoke(KONVA_EXPORT_CHANNELS.EXPORT_SINGLE, payload),
  exportBatch: (payload: ExportBatchPayload) =>
    ipcRenderer.invoke(KONVA_EXPORT_CHANNELS.EXPORT_BATCH, payload),
  pickExportDirectory: () => ipcRenderer.invoke(KONVA_EXPORT_CHANNELS.EXPORT_PICK_DIRECTORY),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// Type augmentation for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
