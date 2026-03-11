import { ipcMain } from 'electron'

import {
  KONVA_CHANNELS,
  type KonvaTemplateDocument,
  type TemplateDeleteResult,
  type TemplateSaveResult,
} from './konva-ipc-types'
import { JsonStorageService } from '../services/json-storage'

type TemplateHandlerResult =
  | KonvaTemplateDocument[]
  | KonvaTemplateDocument
  | null
  | TemplateSaveResult
  | TemplateDeleteResult

function parseProjectId(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('projectId invalido')
  }
  return parsed
}

function parseTemplateId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('templateId invalido')
  }
  return value.trim()
}

function parseTemplateDocument(value: unknown): KonvaTemplateDocument {
  if (!value || typeof value !== 'object') {
    throw new Error('Template document invalido')
  }
  return value as KonvaTemplateDocument
}

function handleTemplateError(action: string, error: unknown): never {
  console.error(`[Konva Template IPC] ${action} falhou:`, error)
  throw error instanceof Error ? error : new Error(`${action} falhou`)
}

function registerHandler(
  channel: (typeof KONVA_CHANNELS)[keyof typeof KONVA_CHANNELS],
  handler: (...args: any[]) => Promise<TemplateHandlerResult>,
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export function registerTemplateHandlers(storage: JsonStorageService): void {
  registerHandler(KONVA_CHANNELS.TEMPLATE_LIST, async (_event, rawProjectId: unknown) => {
    try {
      const projectId = parseProjectId(rawProjectId)
      return await storage.listTemplates(projectId)
    } catch (error) {
      return handleTemplateError('list', error)
    }
  })

  registerHandler(
    KONVA_CHANNELS.TEMPLATE_GET,
    async (_event, rawProjectId: unknown, rawTemplateId: unknown) => {
      try {
        const projectId = parseProjectId(rawProjectId)
        const templateId = parseTemplateId(rawTemplateId)
        return await storage.getTemplate(projectId, templateId)
      } catch (error) {
        return handleTemplateError('get', error)
      }
    },
  )

  registerHandler(
    KONVA_CHANNELS.TEMPLATE_SAVE,
    async (_event, rawProjectId: unknown, rawDoc: unknown) => {
      try {
        const projectId = parseProjectId(rawProjectId)
        const doc = parseTemplateDocument(rawDoc)
        const saved = await storage.saveTemplate(projectId, doc)
        await storage.enqueueSyncOperation({
          projectId,
          entity: 'template',
          entityId: saved.id,
          op: 'update',
        })
        return { ok: true, id: saved.id }
      } catch (error) {
        return handleTemplateError('save', error)
      }
    },
  )

  registerHandler(
    KONVA_CHANNELS.TEMPLATE_DELETE,
    async (_event, rawProjectId: unknown, rawTemplateId: unknown) => {
      try {
        const projectId = parseProjectId(rawProjectId)
        const templateId = parseTemplateId(rawTemplateId)
        await storage.deleteTemplate(projectId, templateId)
        await storage.enqueueSyncOperation({
          projectId,
          entity: 'template',
          entityId: templateId,
          op: 'delete',
        })
        return { ok: true }
      } catch (error) {
        return handleTemplateError('delete', error)
      }
    },
  )

  console.info('[Konva Template IPC] Handlers registrados')
}
