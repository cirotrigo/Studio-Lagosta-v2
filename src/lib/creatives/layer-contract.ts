/**
 * O CONTRATO do `Layer` — o que o render de fato lê, escrito como schema.
 *
 * Até 02/09/2026 as regras abaixo viviam só em comentário espalhado pelo
 * `render-engine.ts`, e quem despejava camadas cruas em `Page.layers`
 * (`create-page` do MCP local, scripts) descobria cada uma pela arte errada:
 *
 *  - `fontWeight` que não é múltiplo de 100 quebra o parser de fonte do
 *    napi-rs: texto GIGANTE no macOS, INVISÍVEL na Vercel (`render-engine.ts`,
 *    `cssFontWeight`).
 *  - a entrelinha mora em DOIS campos e o render prefere
 *    `textboxConfig.autoWrap.lineHeight` sobre `style.lineHeight` — escrever
 *    em um só faz editor e arte publicada divergirem.
 *  - `order` ausente vira 0 e o empilhamento passa a ser a ordem do array.
 *  - `autoExpand` ausente TRUNCA linhas inteiras quando a caixa é baixa.
 *  - imagem sem `objectFit: 'cover'` e sem `style.crop` ESTICA.
 *
 * Módulo PURO (zod + tipos): a bancada e o MCP local importam sem env.
 * `validarCamadas` aceita a forma crua (array, string JSON ou a string
 * dupla-codificada do legado) e `normalizarCamadas` aplica as regras acima,
 * devolvendo o que mudou em `avisos` — nunca em silêncio.
 */

import { z } from 'zod'

import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'

export const TIPOS_DE_CAMADA = [
  'text',
  'rich-text',
  'image',
  'gradient',
  'gradient2',
  'logo',
  'element',
  'shape',
  'icon',
  'video',
] as const

const ponto = z.object({ x: z.number().finite(), y: z.number().finite() })
const tamanho = z.object({ width: z.number().finite().positive(), height: z.number().finite().positive() })

/**
 * O schema é deliberadamente permissivo no `style`/`effects`/`metadata`
 * (`passthrough`): o editor grava dezenas de campos ali e o contrato não
 * quer listar todos — quer garantir os que fazem o render divergir.
 */
export const camadaSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(TIPOS_DE_CAMADA),
    name: z.string().default(''),
    visible: z.boolean().default(true),
    locked: z.boolean().default(false),
    order: z.number().int().optional(),
    position: ponto,
    size: tamanho,
    rotation: z.number().finite().optional(),
    content: z.string().optional(),
    isDynamic: z.boolean().optional(),
    fileUrl: z.string().optional(),
    style: z.record(z.any()).optional(),
    textboxConfig: z.record(z.any()).optional(),
    effects: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .passthrough()

export type CamadaValidada = z.infer<typeof camadaSchema>

export interface ValidacaoDeCamadas {
  camadas: Layer[]
  /** Uma linha por camada recusada — a validação NUNCA descarta em silêncio. */
  problemas: string[]
}

/**
 * Lê a forma crua (array, JSON, JSON dupla-codificado) e valida camada a
 * camada. Camada inválida vai para `problemas` com o índice e o motivo; as
 * válidas seguem. Entrada ilegível devolve zero camadas e um problema só.
 */
export function validarCamadas(entrada: unknown): ValidacaoDeCamadas {
  const { camadas, legivel } = lerCamadas(entrada)
  if (!legivel) return { camadas: [], problemas: ['as camadas não são um JSON legível'] }

  const validas: Layer[] = []
  const problemas: string[] = []
  camadas.forEach((bruta, i) => {
    const r = camadaSchema.safeParse(bruta)
    if (r.success) {
      validas.push(r.data as unknown as Layer)
      return
    }
    const id = typeof (bruta as { id?: unknown })?.id === 'string' ? (bruta as { id: string }).id : `#${i}`
    const motivos = r.error.issues.map((p) => `${p.path.join('.') || '(raiz)'}: ${p.message}`).join('; ')
    problemas.push(`camada ${id}: ${motivos}`)
  })
  return { camadas: validas, problemas }
}

export interface NormalizacaoDeCamadas {
  camadas: Layer[]
  /** O que foi corrigido, em português, uma linha por correção. */
  avisos: string[]
}

/** Peso de fonte que o parser do napi-rs aceita: múltiplo de 100 em 100..900. */
export function pesoDeFonteValido(peso: unknown): number | null {
  if (typeof peso === 'number' && Number.isFinite(peso)) {
    const arredondado = Math.round(peso / 100) * 100
    return Math.min(900, Math.max(100, arredondado))
  }
  if (typeof peso === 'string') {
    const n = Number(peso)
    if (Number.isFinite(n)) return pesoDeFonteValido(n)
    if (/^bold$/i.test(peso)) return 700
    if (/^normal$|^regular$/i.test(peso)) return 400
  }
  return null
}

const ENTRELINHA_PADRAO = 1.1

/**
 * Aplica as regras do contrato. Não move, não redimensiona, não muda
 * conteúdo: só o que faria o render divergir do editor ou falhar.
 */
export function normalizarCamadas(entrada: Layer[]): NormalizacaoDeCamadas {
  const avisos: string[] = []

  // Ordem estável: quem tem `order` manda; empate (ou ausência) pela posição.
  const ordenadas = entrada
    .map((camada, indice) => ({ camada, indice }))
    .sort((a, b) => {
      const oa = typeof a.camada.order === 'number' ? a.camada.order : a.indice
      const ob = typeof b.camada.order === 'number' ? b.camada.order : b.indice
      return oa - ob || a.indice - b.indice
    })

  const camadas = ordenadas.map(({ camada, indice }, ordem) => {
    const saida: Layer = { ...camada, order: ordem }
    if (typeof camada.order !== 'number') avisos.push(`camada ${camada.id}: sem "order" — recebeu ${ordem} pela posição`)
    else if (camada.order !== ordem && ordenadas.length > 1 && camada.order !== indice) {
      // Renumerar é esperado (os números vinham com buracos); só avisa quando
      // a ordem RELATIVA mudou, o que não acontece num sort estável.
    }

    if (camada.type === 'text' || camada.type === 'rich-text') {
      const style = { ...(camada.style ?? {}) } as Record<string, unknown>
      const pesoBruto = style.fontWeight
      if (pesoBruto !== undefined) {
        const peso = pesoDeFonteValido(pesoBruto)
        if (peso === null) {
          avisos.push(`camada ${camada.id}: fontWeight "${String(pesoBruto)}" ilegível — removido (o arquivo da fonte decide)`)
          delete style.fontWeight
        } else if (peso !== pesoBruto) {
          avisos.push(`camada ${camada.id}: fontWeight ${String(pesoBruto)} → ${peso} (o parser exige múltiplo de 100)`)
          style.fontWeight = peso
        }
      }
      if (typeof style.fontSize !== 'number' || !(style.fontSize > 0)) {
        avisos.push(`camada ${camada.id}: sem fontSize válido — o render vai usar o padrão`)
      }

      const textbox = { ...((camada.textboxConfig ?? {}) as Record<string, unknown>) }
      const autoWrap = { ...((textbox.autoWrap as Record<string, unknown> | undefined) ?? {}) }
      const entrelinha =
        (typeof autoWrap.lineHeight === 'number' && autoWrap.lineHeight > 0 && autoWrap.lineHeight) ||
        (typeof style.lineHeight === 'number' && style.lineHeight > 0 && style.lineHeight) ||
        ENTRELINHA_PADRAO
      if (style.lineHeight !== entrelinha || autoWrap.lineHeight !== entrelinha) {
        if (style.lineHeight !== undefined || autoWrap.lineHeight !== undefined) {
          avisos.push(`camada ${camada.id}: entrelinha gravada nos dois campos (${entrelinha})`)
        }
      }
      style.lineHeight = entrelinha
      autoWrap.lineHeight = entrelinha
      if (autoWrap.breakMode === undefined) autoWrap.breakMode = 'word'
      if (autoWrap.autoExpand === undefined) {
        autoWrap.autoExpand = true
        avisos.push(`camada ${camada.id}: autoExpand ausente — ligado (sem ele a caixa baixa trunca linhas inteiras)`)
      }
      if (textbox.anchor === undefined) textbox.anchor = 'top'
      textbox.autoWrap = autoWrap

      saida.style = style as Layer['style']
      saida.textboxConfig = textbox as Layer['textboxConfig']
    }

    if (camada.type === 'image' || camada.type === 'logo') {
      const style = { ...(camada.style ?? {}) } as Record<string, unknown>
      if (!style.objectFit && !style.crop) {
        style.objectFit = camada.type === 'logo' ? 'contain' : 'cover'
        avisos.push(`camada ${camada.id}: sem objectFit — "${String(style.objectFit)}" (sem ele a imagem estica)`)
      }
      saida.style = style as Layer['style']
    }

    return saida
  })

  return { camadas, avisos }
}

/**
 * Validação + normalização numa chamada — o que toda porta de escrita de
 * `Page.layers` vinda de fora do editor deve usar. Lança quando alguma
 * camada é inválida: gravar metade das camadas é pior que recusar.
 */
export function prepararCamadasParaGravar(entrada: unknown): NormalizacaoDeCamadas {
  const v = validarCamadas(entrada)
  if (v.problemas.length > 0) {
    throw new Error(`camadas inválidas — ${v.problemas.join(' | ')}`)
  }
  return normalizarCamadas(v.camadas)
}
