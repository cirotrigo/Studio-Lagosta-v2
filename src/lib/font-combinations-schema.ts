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

const iconeSchema = z
  .object({
    url: z.string().url().max(2048),
    width: z.number().positive().max(1080),
    height: z.number().positive().max(1920),
    offsetX: z.number().min(-1080).max(1080),
    offsetY: z.number().min(-1920).max(1920),
  })
  .optional()

const ornamentoSchema = z
  .object({
    url: z.string().url().max(2048).optional(),
    camada: z.record(z.unknown()).optional(),
    logo: z.boolean().optional(),
    width: z.number().positive().max(4000),
    height: z.number().positive().max(4000),
    lado: z.enum(['antes', 'depois', 'acima', 'abaixo']),
    eixo: z.enum(['inicio', 'centro', 'fim']).optional(),
    offsetX: z.number().min(-4000).max(4000),
    offsetY: z.number().min(-4000).max(4000),
    tamanhoDaCamada: z.object({ width: z.number().positive().max(4000), height: z.number().positive().max(4000) }).optional(),
    ajuste: z.object({ x: z.number().min(-4000).max(4000), y: z.number().min(-4000).max(4000) }).optional(),
  })
  .refine((o) => Boolean(o.url || o.camada), { message: 'O elemento da combinação precisa de uma imagem ou de uma forma' })

const destaqueSchema = z
  .object({
    fill: z.string().max(64).optional(),
    fontFamily: z.string().max(120).optional(),
    fontStyle: z.string().max(40).optional(),
    textDecoration: z.string().max(40).optional(),
  })
  .optional()

const elementoSchema = z.object({
  id: z.string(),
  label: z.string(),
  role: z.enum(['title', 'subtitle', 'body']),
  fontFamily: z.string().max(120).optional(),
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
  icon: iconeSchema,
  // Para o compositor (11/09/2026): o papel do texto, os elementos presos a
  // ele, o estilo do [destaque] e a altura do canvas em que foi salva.
  papel: z.enum(['pre', 'headline', 'headline2', 'apoio', 'cta', 'servico']).optional(),
  ornamentos: z.array(ornamentoSchema).max(12).optional(),
  destaque: destaqueSchema,
  alturaDeBase: z.number().positive().max(4000).optional(),
})

export const criarSchema = z.object({
  name: z.string().trim().min(1).max(60),
  elements: z.array(elementoSchema).min(1),
})
