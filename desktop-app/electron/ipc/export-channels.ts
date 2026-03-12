/**
 * Constantes de canais IPC para export do Konva.
 * Arquivo separado para evitar que o preload.ts inclua dependências de Node.js.
 */

export const KONVA_EXPORT_CHANNELS = {
  EXPORT_SINGLE: 'konva:export:single',
  EXPORT_BATCH: 'konva:export:batch',
  EXPORT_PICK_DIRECTORY: 'konva:export:pick-directory',
} as const

export type KonvaExportChannel = (typeof KONVA_EXPORT_CHANNELS)[keyof typeof KONVA_EXPORT_CHANNELS]
