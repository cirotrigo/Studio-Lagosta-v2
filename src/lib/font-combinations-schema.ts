/**
 * Schemas das combinações tipográficas.
 *
 * Ficam fora do arquivo de rota porque o Next só permite que rotas exportem
 * handlers HTTP e configs — exportar o schema de lá quebra o build.
 */
import { z } from 'zod'

const efeitosSchema = z
  .object({
    stroke: z.object({ enabled: z.boolean(), strokeColor: z.string(), strokeWidth: z.number() }).optional(),
    shadow: z
      .object({
        enabled: z.boolean(),
        shadowColor: z.string(),
        shadowBlur: z.number(),
        shadowOffsetX: z.number(),
        shadowOffsetY: z.number(),
        shadowOpacity: z.number(),
      })
      .optional(),
    background: z
      .object({ enabled: z.boolean(), backgroundColor: z.string(), padding: z.number() })
      .optional(),
  })
  .optional()

const elementoSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.enum(['title', 'body']),
  text: z.string(),
  fontSize: z.number(),
  fontWeight: z.string(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textTransform: z.enum(['none', 'uppercase']).optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  color: z.string().optional(),
  effects: efeitosSchema,
  x: z.number().min(-1).max(2),
  y: z.number().min(-1).max(2),
  width: z.number().min(0.01).max(2),
  height: z.number().min(0.001).max(2).optional(),
  rotation: z.number().min(-360).max(360).optional(),
})

export const criarSchema = z.object({
  name: z.string().trim().min(1).max(60),
  elements: z.array(elementoSchema).min(1),
})
