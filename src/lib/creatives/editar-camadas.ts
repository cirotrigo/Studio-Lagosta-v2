/**
 * EDITAR CAMADAS PELO MCP (T1 do plano "artes de ponta a ponta pelo MCP", 05/11/2026).
 *
 * O que a pessoa faz na tela do editor e `ajustar-arte` não deixava fazer pelos dados: posição absoluta, tamanho
 * (inclusive de imagem e logo), rotação, fonte, cor, alinhamento, efeitos, corte da foto, cores de forma, gradiente,
 * criar/apagar/reordenar camadas, fundo e tamanho da página. Entra por `ajustar-arte` (`camadas` e `pagina`), que já
 * tem transação, versão, gate, render e a invalidação da agenda — uma tool nova seria a segunda implementação.
 *
 * A validação mora AQUI porque o servidor quase não valida camada (mapa A § 3): a rota do editor grava o que o Konva
 * produz, e pelo MCP gravaríamos o que o modelo mandar. Por isso ALLOWLIST por tipo de camada, FAIXAS por campo, cor
 * pelo `lerCor`, e PEDIDO MISTO RECUSADO INTEIRO (nada é gravado; todos os erros em `details.erros[]`), no padrão do CP4.
 *
 * Módulo PURO: sem `@/lib/db` (lança no import sem DATABASE_URL). O serviço resolve antes o que precisa de banco
 * (`driveImageId` → URL do Blob, a logo da marca, as fontes do projeto) e entrega por `ctx`.
 */

import { z } from 'zod'
import type { Layer, LayerStyle } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { createId } from '@/lib/id'
import { lerCor } from '@/lib/vetor/cor'
import { patchLineHeight } from '@/lib/text-line-height'
import { temTextoSubstantivo } from '@/lib/creatives/revisao/texto-visivel'
import { vinculadaAGrade } from '@/lib/grades/presenca'
import { FONT_CONFIG } from '@/lib/font-config'
import { lerDestaques, linhasComColchetes, temColchetes, type EstiloDeDestaque } from '@/lib/compositor/destaques'

export const OPERACOES = ['definir', 'adicionar', 'remover', 'reordenar'] as const
export const TIPOS_PARA_ADICIONAR = ['texto', 'imagem', 'logo', 'forma', 'icone', 'gradiente'] as const
export const MAX_OPERACOES = 40

const cor = z.string().min(1).max(64)
const fracao = z.number()

/** Um objeto parcial de campos. As FAIXAS são conferidas no código (`VALOR_FORA_DA_FAIXA`, com o campo), não no zod. */
const estiloSchema = z
  .object({
    fontFamily: z.string().min(1).max(120).optional().describe('texto: família da fonte (cadastrada no projeto).'),
    fontWeight: z.union([z.string().max(20), z.number()]).optional().describe('texto: peso ("400", "700", 700).'),
    fontSize: z.number().optional().describe('texto: corpo em px (8 a 600).'),
    color: cor.optional().describe('texto/ícone: cor (#RRGGBB, rgba(), nome CSS).'),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
    letterSpacing: z.number().optional().describe('texto: espaçamento entre letras em px (-100 a 100).'),
    lineHeight: z.number().optional().describe('texto: entrelinha, multiplicador do corpo (0.5 a 3) — gravada nos dois campos que o render lê.'),
    fontStyle: z.enum(['normal', 'italic']).optional(),
    opacity: fracao.optional().describe('qualquer camada visual: opacidade 0 a 1.'),
    crop: z.object({ x: fracao, y: fracao, width: fracao, height: fracao }).strict().optional().describe('imagem/logo: recorte em frações 0..1 da imagem original (vence objectFit/cropPosition).'),
    objectFit: z.enum(['contain', 'cover', 'fill']).optional(),
    cropPosition: z.enum(['left-top', 'center-top', 'right-top', 'left-middle', 'center-middle', 'right-middle', 'left-bottom', 'center-bottom', 'right-bottom']).optional(),
    flipH: z.boolean().optional(),
    flipV: z.boolean().optional(),
    blur: z.number().optional().describe('imagem: desfoque 0 a 100.'),
    exposure: z.number().optional().describe('imagem: -1 a 1.'),
    contrast: z.number().optional().describe('imagem: -100 a 100.'),
    highlights: z.number().optional().describe('imagem: -100 a 100.'),
    shadows: z.number().optional().describe('imagem: -100 a 100.'),
    whites: z.number().optional().describe('imagem: -100 a 100.'),
    blacks: z.number().optional().describe('imagem: -100 a 100.'),
    saturation: z.number().optional().describe('imagem: -2 a 2.'),
    vignette: z.number().optional().describe('imagem: 0 a 1.'),
    fill: cor.optional().describe('forma/ícone: cor de preenchimento.'),
    strokeColor: cor.optional().describe('forma/ícone: cor do contorno.'),
    strokeWidth: z.number().optional().describe('forma/ícone: espessura do contorno em px (0 a 200).'),
    shapeType: z.enum(['rectangle', 'rounded-rectangle', 'circle', 'triangle', 'star', 'arrow', 'line']).optional().describe('forma: o desenho (svg-path não entra por aqui).'),
    iconId: z.string().min(1).max(120).optional().describe('ícone: qual ícone.'),
    gradientType: z.enum(['linear', 'radial']).optional(),
    gradientAngle: z.number().optional().describe('gradiente: 0 a 360.'),
    gradientStops: z
      .array(z.object({ id: z.string().max(64).optional(), color: cor, position: fracao, opacity: fracao }).strict())
      .min(1)
      .max(8)
      .optional()
      .describe('gradiente: paradas {color, position 0..1, opacity 0..1}.'),
    gradientStartX: fracao.optional(),
    gradientStartY: fracao.optional(),
    gradientEndX: fracao.optional(),
    gradientEndY: fracao.optional(),
    gradientCenterX: fracao.optional(),
    gradientCenterY: fracao.optional(),
    gradientRadiusScale: z.number().optional().describe('gradiente radial: 0.1 a 5.'),
  })
  .strict()

const efeitosSchema = z
  .object({
    stroke: z.object({ enabled: z.boolean(), strokeColor: cor, strokeWidth: z.number() }).strict().optional(),
    shadow: z.object({ enabled: z.boolean(), shadowColor: cor, shadowBlur: z.number(), shadowOffsetX: z.number(), shadowOffsetY: z.number(), shadowOpacity: z.number() }).strict().optional(),
    blur: z.object({ enabled: z.boolean(), blurRadius: z.number() }).strict().optional(),
    background: z
      .object({
        enabled: z.boolean(),
        backgroundColor: cor,
        padding: z.number(),
        fit: z.enum(['caixa', 'texto']).optional(),
        opacity: z.number().optional(),
        borderRadius: z.number().optional(),
        blur: z.number().optional(),
        offsetX: z.number().optional(),
        offsetY: z.number().optional(),
        paddingX: z.number().optional(),
        paddingY: z.number().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const camposDaCamadaSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    visible: z.boolean().optional(),
    locked: z.boolean().optional(),
    order: z.number().int().optional().describe('posição na pilha, 0 = fundo (o mesmo que reordenar).'),
    rotation: z.number().optional().describe('graus, -360 a 360.'),
    position: z.object({ x: z.number().optional(), y: z.number().optional() }).strict().optional().describe('posição ABSOLUTA em px da página (canto superior esquerdo).'),
    size: z.object({ width: z.number().optional(), height: z.number().optional() }).strict().optional().describe('caixa em px (1 a 10000).'),
    content: z.string().max(2000).optional().describe('texto: o conteúdo (\\n quebra linha). Palavra entre [colchetes] sai destacada no estilo da marca; o conteúdo enviado é a verdade: sem colchetes, sem destaque.'),
    destaques: z
      .array(z.object({ inicio: z.number().int(), fim: z.number().int() }).strict())
      .max(20)
      .optional()
      .describe('texto: os trechos destacados, offsets no content SEM colchetes ([] tira o destaque). Mais simples: colchetes no content.'),
    destaque: z
      .object({
        fill: cor.optional(),
        fontFamily: z.string().min(1).max(120).optional(),
        fontStyle: z.enum(['normal', 'italic', 'bold', 'bold italic']).optional(),
        textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
      })
      .strict()
      .optional()
      .describe('texto: o estilo do destaque (cor, família) — vale para todos os trechos da camada. Sem ele, o da marca.'),
    fileUrl: z.string().min(1).max(2048).optional().describe('imagem/logo: URL da imagem (no perfil de rascunho é recusada: use driveImageId).'),
    driveImageId: z.string().min(1).max(200).optional().describe('imagem: a foto do acervo (de buscar-fotos) — resolvida para a URL do Studio.'),
    style: estiloSchema.optional(),
    textboxConfig: z
      .object({
        anchor: z.enum(['top', 'middle', 'bottom']).optional(),
        autoWrap: z.object({ breakMode: z.enum(['word', 'char', 'hybrid']).optional(), autoExpand: z.boolean().optional() }).strict().optional(),
      })
      .strict()
      .optional(),
    effects: efeitosSchema.optional(),
  })
  .strict()

export const operacaoDeCamadaSchema = z
  .object({
    op: z.enum(OPERACOES).describe('definir (campos de uma camada), adicionar (camada nova), remover, reordenar.'),
    camada: z.string().min(1).max(200).optional().describe('definir/remover/reordenar: id OU nome da camada (ver-pagina lista os dois).'),
    tipo: z.enum(TIPOS_PARA_ADICIONAR).optional().describe('adicionar: texto, imagem, logo, forma, icone ou gradiente.'),
    id: z.string().min(1).max(64).optional().describe('adicionar: id desejado para a camada nova (letras, números, _ e -); sem ele o servidor gera um.'),
    ordem: z.number().int().optional().describe('reordenar: a posição na pilha (0 = fundo, última = frente); adicionar: onde entra (default: na frente).'),
    campos: camposDaCamadaSchema.optional().describe('definir: o que muda (só os campos enviados); adicionar: o que difere dos defaults do servidor.'),
  })
  .strict()

export const paginaDoAjusteSchema = z
  .object({
    background: z.string().min(1).max(64).optional().describe('cor de fundo da página (#RRGGBB, rgba(), nome CSS).'),
    width: z.number().int().optional().describe('largura em px (200 a 8000).'),
    height: z.number().int().optional().describe('altura em px (200 a 8000).'),
  })
  .strict()

export type OperacaoDeCamada = z.infer<typeof operacaoDeCamadaSchema>
export type CamposDaCamada = z.infer<typeof camposDaCamadaSchema>
export type PaginaDoAjuste = z.infer<typeof paginaDoAjusteSchema>

export type CodigoDaRecusaDeCamada =
  | 'OPERACAO_INCOMPLETA'
  | 'CAMADA_INEXISTENTE'
  | 'CAMADA_AMBIGUA'
  | 'ID_JA_EXISTE'
  | 'CAMPO_NAO_PERMITIDO'
  | 'VALOR_FORA_DA_FAIXA'
  | 'TIPO_NAO_EDITAVEL'
  | 'URL_EXTERNA_RECUSADA'
  | 'CONTEUDO_NAO_PODE_SER_REMOVIDO'

export interface RecusaDeCamada {
  /** Índice da operação em `camadas` (-1 = o bloco `pagina`). */
  indice: number
  op: string
  camada?: string
  codigo: CodigoDaRecusaDeCamada
  motivo: string
  campos?: string[]
}

export interface CamadaAplicada {
  indice: number
  op: OperacaoDeCamada['op']
  /** O id da camada (o da nova, em adicionar). */
  camada: string
  detalhe: string
}

export interface ContextoDeEdicao {
  canvas: { width: number; height: number }
  /** Perfil draft-only: URL de fora recusada e copy nunca apagada. */
  apenasRascunho: boolean
  /**
   * `driveImageId` → URL do Blob, resolvido pelo SERVIÇO antes (o acervo é banco + Drive). O módulo troca o
   * `driveImageId` pela URL daqui; `fileUrl` enviado pelo chamador continua sendo a URL de fora (recusada no draft-only).
   */
  urlsDoAcervo?: ReadonlyMap<string, string>
  /** A logo principal do cliente, para `adicionar logo` sem fileUrl. */
  logoUrl?: string | null
  /** As fontes da marca, para `adicionar texto` sem fontFamily. */
  fontes?: { titulo?: string | null; corpo?: string | null }
  /** O estilo de destaque da MARCA para uma camada de texto (resolvido pelo serviço pela assinatura) — usado só quando a camada destaca e não tem `destaque`. */
  destaqueDaMarca?: (camada: Layer) => EstiloDeDestaque | null
  novoId?: () => string
}

export interface ResultadoDasCamadas {
  camadas: Layer[]
  aplicadas: CamadaAplicada[]
  recusadas: RecusaDeCamada[]
  /** Ids das camadas de TEXTO criadas ou cujo texto, estilo ou caixa mudou — o autofix geométrico mede essas. */
  tocadas: string[]
  /** Avisos que não recusam (colchete sem par: o trecho não é destacado). */
  avisos: string[]
}

// ── Allowlist por tipo ────────────────────────────────────────────────────

const COMUNS = ['name', 'visible', 'locked', 'order', 'rotation', 'position', 'size']
const TIPOGRAFIA = ['fontFamily', 'fontWeight', 'fontSize', 'color', 'textAlign', 'textTransform', 'letterSpacing', 'lineHeight', 'fontStyle', 'opacity']
const IMAGEM = ['crop', 'objectFit', 'cropPosition', 'flipH', 'flipV', 'opacity', 'blur', 'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'saturation', 'vignette']
const FORMA = ['fill', 'strokeColor', 'strokeWidth', 'opacity', 'shapeType']
const GRADIENTE = ['gradientType', 'gradientAngle', 'gradientStops', 'gradientStartX', 'gradientStartY', 'gradientEndX', 'gradientEndY', 'gradientCenterX', 'gradientCenterY', 'gradientRadiusScale', 'opacity']

interface Permitidos {
  campos: string[]
  style: string[]
  textboxConfig: string[]
  effects: string[]
  /** Por que os campos próprios estão fechados (rich-text). */
  motivo?: string
}
const SEM: Pick<Permitidos, 'textboxConfig' | 'effects'> = { textboxConfig: [], effects: [] }
const PERMITIDOS: Record<string, Permitidos> = {
  text: { campos: ['content', 'destaques', 'destaque'], style: TIPOGRAFIA, textboxConfig: ['anchor', 'autoWrap'], effects: ['stroke', 'shadow', 'blur', 'background'] },
  // Quarentena #209: o rich-text se edita por trecho na tela; por aqui só geometria, nome, visibilidade, trava e ordem.
  'rich-text': { campos: [], style: [], ...SEM, motivo: 'rich-text está em quarentena (#209): por aqui só posição, tamanho, rotação, nome, visibilidade, trava e ordem' },
  image: { campos: ['fileUrl', 'driveImageId'], style: IMAGEM, ...SEM },
  logo: { campos: ['fileUrl', 'driveImageId'], style: IMAGEM, ...SEM },
  element: { campos: ['fileUrl', 'driveImageId'], style: IMAGEM, ...SEM },
  shape: { campos: [], style: FORMA, ...SEM },
  icon: { campos: [], style: [...FORMA, 'iconId', 'color'], ...SEM },
  gradient: { campos: [], style: GRADIENTE, ...SEM },
  gradient2: { campos: [], style: GRADIENTE, ...SEM },
}

/** Faixas por caminho do campo. `[]` em `gradientStops[]` cobre cada parada. */
const FAIXAS: Record<string, [number, number]> = {
  rotation: [-360, 360],
  order: [0, 500],
  'position.x': [-10000, 10000],
  'position.y': [-10000, 10000],
  'size.width': [1, 10000],
  'size.height': [1, 10000],
  'style.fontSize': [8, 600],
  'style.letterSpacing': [-100, 100],
  'style.lineHeight': [0.5, 3],
  'style.opacity': [0, 1],
  'style.crop.x': [0, 1],
  'style.crop.y': [0, 1],
  'style.crop.width': [0, 1],
  'style.crop.height': [0, 1],
  'style.blur': [0, 100],
  'style.exposure': [-1, 1],
  'style.contrast': [-100, 100],
  'style.highlights': [-100, 100],
  'style.shadows': [-100, 100],
  'style.whites': [-100, 100],
  'style.blacks': [-100, 100],
  'style.saturation': [-2, 2],
  'style.vignette': [0, 1],
  'style.strokeWidth': [0, 200],
  'style.gradientAngle': [0, 360],
  'style.gradientStartX': [0, 1],
  'style.gradientStartY': [0, 1],
  'style.gradientEndX': [0, 1],
  'style.gradientEndY': [0, 1],
  'style.gradientCenterX': [0, 1],
  'style.gradientCenterY': [0, 1],
  'style.gradientRadiusScale': [0.1, 5],
  'style.gradientStops[].position': [0, 1],
  'style.gradientStops[].opacity': [0, 1],
  'effects.stroke.strokeWidth': [0, 100],
  'effects.shadow.shadowBlur': [0, 200],
  'effects.shadow.shadowOffsetX': [-500, 500],
  'effects.shadow.shadowOffsetY': [-500, 500],
  'effects.shadow.shadowOpacity': [0, 1],
  'effects.blur.blurRadius': [0, 100],
  'effects.background.padding': [0, 400],
  'effects.background.paddingX': [0, 400],
  'effects.background.paddingY': [0, 400],
  'effects.background.opacity': [0, 1],
  'effects.background.borderRadius': [0, 400],
  'effects.background.blur': [0, 400],
  'effects.background.offsetX': [-500, 500],
  'effects.background.offsetY': [-500, 500],
}
const CORES = new Set(['destaque.fill', 'style.color', 'style.fill', 'style.strokeColor', 'style.gradientStops[].color', 'effects.stroke.strokeColor', 'effects.shadow.shadowColor', 'effects.background.backgroundColor'])
const FAIXA_DA_PAGINA: [number, number] = [200, 8000]

type Objeto = Record<string, unknown>
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Percorre `campos` em profundidade e devolve `[caminho, valor]` das folhas (`gradientStops[]` por parada). */
function folhas(valor: unknown, caminho = ''): Array<[string, unknown]> {
  if (Array.isArray(valor)) return valor.flatMap((v) => folhas(v, `${caminho}[]`))
  if (ehObjeto(valor)) return Object.entries(valor).flatMap(([k, v]) => folhas(v, caminho ? `${caminho}.${k}` : k))
  return [[caminho, valor]]
}

/** Faixas e cores de um `campos` — sem olhar a página (FASE 1). */
function problemasDeFormato(campos: CamposDaCamada): Array<{ campo: string; motivo: string }> {
  const problemas: Array<{ campo: string; motivo: string }> = []
  for (const [caminho, valor] of folhas(campos)) {
    const faixa = FAIXAS[caminho]
    if (faixa && (typeof valor !== 'number' || !Number.isFinite(valor) || valor < faixa[0] || valor > faixa[1])) {
      problemas.push({ campo: caminho, motivo: `${caminho} vai de ${faixa[0]} a ${faixa[1]} (veio ${String(valor)})` })
    }
    if (CORES.has(caminho) && lerCor(valor) === null) problemas.push({ campo: caminho, motivo: `${caminho}: cor ilegível (${String(valor)})` })
  }
  if (typeof campos.fileUrl === 'string') {
    let ok = false
    try {
      ok = /^https?:$/.test(new URL(campos.fileUrl).protocol)
    } catch {
      ok = false
    }
    if (!ok) problemas.push({ campo: 'fileUrl', motivo: 'fileUrl precisa ser uma URL http(s)' })
  }
  if (campos.fileUrl !== undefined && campos.driveImageId !== undefined) problemas.push({ campo: 'fileUrl', motivo: 'mande fileUrl OU driveImageId, não os dois' })
  for (const t of campos.destaques ?? []) {
    if (t.inicio < 0 || t.fim <= t.inicio) problemas.push({ campo: 'destaques', motivo: `destaques: cada trecho vai de inicio ≥ 0 a fim > inicio (veio ${t.inicio}–${t.fim})` })
  }
  if (campos.destaques !== undefined && temColchetes([campos.content])) problemas.push({ campo: 'destaques', motivo: 'mande os [colchetes] no content OU destaques, não os dois' })
  return problemas
}

/**
 * FASE 1 — o FORMATO de cada operação, antes do banco: completude, faixas, cores, URL. O serviço e o handler rodam a
 * mesma (o handler para a porta devolver código e lista; o serviço por segurança).
 */
export function validarFormatoDasOperacoes(operacoes: OperacaoDeCamada[], ctx: Pick<ContextoDeEdicao, 'apenasRascunho'>): RecusaDeCamada[] {
  const recusas: RecusaDeCamada[] = []
  if (operacoes.length > MAX_OPERACOES) {
    recusas.push({ indice: -1, op: 'camadas', codigo: 'OPERACAO_INCOMPLETA', motivo: `no máximo ${MAX_OPERACOES} operações por chamada (vieram ${operacoes.length})` })
  }
  operacoes.forEach((o, indice) => {
    const recusa = (codigo: CodigoDaRecusaDeCamada, motivo: string, campos?: string[]) =>
      recusas.push({ indice, op: o.op, ...(o.camada ? { camada: o.camada } : {}), codigo, motivo, ...(campos?.length ? { campos } : {}) })
    if (o.op !== 'adicionar' && !o.camada) recusa('OPERACAO_INCOMPLETA', `${o.op} precisa de "camada" (id ou nome)`, ['camada'])
    if (o.op === 'adicionar' && !o.tipo) recusa('OPERACAO_INCOMPLETA', 'adicionar precisa de "tipo" (texto, imagem, logo, forma, icone, gradiente)', ['tipo'])
    if (o.op === 'definir' && (!o.campos || Object.keys(o.campos).length === 0)) recusa('OPERACAO_INCOMPLETA', 'definir precisa de "campos" com pelo menos um campo', ['campos'])
    if (o.op === 'reordenar' && typeof o.ordem !== 'number') recusa('OPERACAO_INCOMPLETA', 'reordenar precisa de "ordem" (0 = fundo)', ['ordem'])
    if ((o.op === 'remover' || o.op === 'reordenar') && o.campos) recusa('CAMPO_NAO_PERMITIDO', `${o.op} não usa "campos"`, ['campos'])
    if (o.op !== 'adicionar' && (o.tipo || o.id)) recusa('CAMPO_NAO_PERMITIDO', `${o.op} não usa "tipo" nem "id"`, ['tipo', 'id'].filter((k) => (o as Objeto)[k] !== undefined))
    if (o.op === 'definir' && o.ordem !== undefined) recusa('CAMPO_NAO_PERMITIDO', 'definir usa campos.order, não "ordem"', ['ordem'])
    if (o.op === 'adicionar' && o.campos?.order !== undefined) recusa('CAMPO_NAO_PERMITIDO', 'adicionar usa "ordem" (a posição na pilha), não campos.order', ['campos.order'])
    if (o.op === 'adicionar' && o.tipo && o.tipo !== 'imagem' && o.tipo !== 'logo') {
      for (const k of ['fileUrl', 'driveImageId'] as const) if (o.campos?.[k] !== undefined) recusa('CAMPO_NAO_PERMITIDO', `adicionar ${o.tipo} não aceita ${k} (só imagem e logo)`, [k])
    }
    if (o.id !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(o.id)) recusa('VALOR_FORA_DA_FAIXA', 'id da camada nova: letras, números, _ e - (até 64)', ['id'])
    if (o.op === 'adicionar' && o.tipo === 'texto' && !temTextoSubstantivo(o.campos?.content)) recusa('OPERACAO_INCOMPLETA', 'adicionar texto precisa de campos.content com conteúdo', ['campos.content'])
    if (o.op === 'adicionar' && o.tipo === 'icone' && !o.campos?.style?.iconId) recusa('OPERACAO_INCOMPLETA', 'adicionar icone precisa de campos.style.iconId', ['campos.style.iconId'])
    if (o.campos) {
      for (const p of problemasDeFormato(o.campos)) recusa('VALOR_FORA_DA_FAIXA', p.motivo, [p.campo])
      if (ctx.apenasRascunho && o.campos.fileUrl !== undefined) recusa('URL_EXTERNA_RECUSADA', 'este perfil põe foto só pelo acervo (driveImageId de buscar-fotos), nunca por URL', ['fileUrl'])
    }
  })
  return recusas
}

export function validarFormatoDaPagina(pagina: PaginaDoAjuste | undefined): RecusaDeCamada[] {
  if (!pagina) return []
  const recusas: RecusaDeCamada[] = []
  const recusa = (codigo: CodigoDaRecusaDeCamada, motivo: string, campos: string[]) => recusas.push({ indice: -1, op: 'pagina', codigo, motivo, campos })
  if (Object.keys(pagina).length === 0) recusa('OPERACAO_INCOMPLETA', 'pagina precisa de background, width ou height', ['pagina'])
  for (const k of ['width', 'height'] as const) {
    const v = pagina[k]
    if (v !== undefined && (!Number.isInteger(v) || v < FAIXA_DA_PAGINA[0] || v > FAIXA_DA_PAGINA[1])) recusa('VALOR_FORA_DA_FAIXA', `pagina.${k} vai de ${FAIXA_DA_PAGINA[0]} a ${FAIXA_DA_PAGINA[1]} px (veio ${String(v)})`, [`pagina.${k}`])
  }
  if (pagina.background !== undefined && lerCor(pagina.background) === null) recusa('VALOR_FORA_DA_FAIXA', `pagina.background: cor ilegível (${pagina.background})`, ['pagina.background'])
  return recusas
}

/** A recusa do pedido inteiro, no padrão do CP4: código da primeira, a lista em `details.erros`, nada gravado. */
export function erroDeCamadas(recusadas: RecusaDeCamada[]): CreativeError {
  const formato = new Set<CodigoDaRecusaDeCamada>(['OPERACAO_INCOMPLETA', 'VALOR_FORA_DA_FAIXA', 'URL_EXTERNA_RECUSADA'])
  const status = recusadas.every((r) => formato.has(r.codigo)) ? 400 : 422
  const partes = recusadas.map((r) => `${r.indice >= 0 ? `operação ${r.indice}` : r.op}: ${r.motivo}`)
  return new CreativeError(recusadas[0].codigo, `As camadas não puderam ser editadas — nada foi gravado: ${partes.join('; ')}.`, status, { erros: recusadas as unknown as Record<string, unknown>[], ajusteGravado: false })
}

// ── Aplicação ─────────────────────────────────────────────────────────────

const ehTexto = (l: Layer) => l.type === 'text' || l.type === 'rich-text'
const grupoDe = (l: Layer): string | null => (typeof l.metadata?.groupId === 'string' && l.metadata.groupId ? l.metadata.groupId : typeof l.parentId === 'string' && l.parentId ? l.parentId : null)

/** Por id exato; senão por nome (ambíguo quando há duas). */
function achar(camadas: Layer[], ref: string): { layer: Layer; indice: number } | { codigo: 'CAMADA_INEXISTENTE' | 'CAMADA_AMBIGUA'; motivo: string } {
  const porId = camadas.findIndex((l) => l.id === ref)
  if (porId >= 0) return { layer: camadas[porId], indice: porId }
  const porNome = camadas.map((l, i) => ({ l, i })).filter(({ l }) => l.name === ref)
  if (porNome.length === 1) return { layer: porNome[0].l, indice: porNome[0].i }
  if (porNome.length > 1) return { codigo: 'CAMADA_AMBIGUA', motivo: `há ${porNome.length} camadas chamadas "${ref}" (${porNome.map(({ l }) => l.id).join(', ')}): use o id` }
  return { codigo: 'CAMADA_INEXISTENTE', motivo: `camada inexistente na página: ${ref}` }
}

/** O que NÃO se edita por aqui, qualquer que seja a operação: vídeo, célula de grade. Grupo só trava remover/reordenar. */
function tipoNaoEditavel(l: Layer, op: OperacaoDeCamada['op']): string | null {
  if (l.type === 'video') return 'camada de vídeo: o render do servidor não desenha vídeo'
  if (vinculadaAGrade(l)) return 'célula de grade de fotos: a grade se edita na tela'
  if ((op === 'remover' || op === 'reordenar') && grupoDe(l)) return `camada do grupo "${grupoDe(l)}": grupo se desfaz na tela (definir continua valendo)`
  return null
}

/** Os campos de `campos` que o tipo da camada não aceita (FASE 2). */
function camposForaDoTipo(tipo: string, campos: CamposDaCamada): { fora: string[]; motivo?: string } {
  const p = PERMITIDOS[tipo]
  if (!p) return { fora: [] }
  const fora: string[] = []
  for (const k of Object.keys(campos)) {
    if (COMUNS.includes(k) || p.campos.includes(k)) continue
    if (k === 'style' || k === 'textboxConfig' || k === 'effects') {
      const permitidas = p[k]
      for (const sub of Object.keys((campos as Objeto)[k] as Objeto)) if (!permitidas.includes(sub)) fora.push(`${k}.${sub}`)
      continue
    }
    fora.push(k)
  }
  return { fora, motivo: p.motivo }
}

/** Ordena pela ordem gravada (empate pela posição na lista) e renumera 0..n-1 — o mesmo que `inserirAcimaDoFundo`. */
function renumerar(camadas: Layer[]): Layer[] {
  return camadas
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.order ?? a.i) - (b.l.order ?? b.i) || a.i - b.i)
    .map(({ l }, order) => ({ ...l, order }))
}

/** Move a camada para a posição `ordem` da pilha e renumera. */
function mover(camadas: Layer[], id: string, ordem: number): Layer[] {
  const pilha = renumerar(camadas)
  const de = pilha.findIndex((l) => l.id === id)
  const [camada] = pilha.splice(de, 1)
  pilha.splice(Math.max(0, Math.min(ordem, pilha.length)), 0, camada)
  return pilha.map((l, order) => ({ ...l, order }))
}

/** `driveImageId` vira a URL que o serviço resolveu do acervo; sem entrada no mapa, a foto não existe para esta chamada. */
function comFotoDoAcervo(campos: CamposDaCamada, ctx: ContextoDeEdicao): { campos: CamposDaCamada } | { codigo: CodigoDaRecusaDeCamada; motivo: string; campos: string[] } {
  if (campos.driveImageId === undefined) return { campos }
  const url = ctx.urlsDoAcervo?.get(campos.driveImageId)
  if (!url) return { codigo: 'VALOR_FORA_DA_FAIXA', motivo: `a foto ${campos.driveImageId} não foi resolvida no acervo`, campos: ['driveImageId'] }
  const { driveImageId: _d, ...resto } = campos
  return { campos: { ...resto, fileUrl: url } }
}

/** Texto com conteúdo que ficaria invisível, minúsculo ou fora da página — só pelos campos que ESTA operação mexeu. */
function copySumida(nova: Layer, campos: CamposDaCamada, canvas: { width: number; height: number }): { motivo: string; campos: string[] } | null {
  if (campos.style?.opacity !== undefined && (nova.style?.opacity ?? 1) < 0.2) return { motivo: `ficaria invisível (opacidade ${nova.style?.opacity})`, campos: ['style.opacity'] }
  if (campos.size && (nova.size.width < 20 || nova.size.height < 8)) return { motivo: `ficaria minúsculo (${nova.size.width}×${nova.size.height})`, campos: ['size'] }
  if (campos.position || campos.size) {
    const { x, y } = nova.position
    const { width: w, height: h } = nova.size
    if (x + w <= 0 || y + h <= 0 || x >= canvas.width || y >= canvas.height) return { motivo: `sairia da página (${x}, ${y})`, campos: ['position'] }
  }
  return null
}

function fundirDefinir(layer: Layer, campos: CamposDaCamada): Layer {
  let nova: Layer = { ...layer }
  for (const k of ['name', 'visible', 'locked', 'rotation', 'content', 'fileUrl'] as const) {
    if (campos[k] !== undefined) (nova as Objeto)[k] = campos[k]
  }
  if (campos.position) nova.position = { ...layer.position, ...semIndefinidos(campos.position) } as Layer['position']
  if (campos.size) nova.size = { ...layer.size, ...semIndefinidos(campos.size) } as Layer['size']
  if (campos.style) {
    const { lineHeight, ...resto } = campos.style
    nova.style = { ...layer.style, ...semIndefinidos(resto) } as LayerStyle
    if (lineHeight !== undefined) nova = { ...nova, ...patchLineHeight(nova, lineHeight) }
  }
  if (campos.textboxConfig) {
    const atual = nova.textboxConfig ?? {}
    nova.textboxConfig = {
      ...atual,
      ...(campos.textboxConfig.anchor ? { anchor: campos.textboxConfig.anchor } : {}),
      ...(campos.textboxConfig.autoWrap
        ? {
            autoWrap: {
              lineHeight: atual.autoWrap?.lineHeight ?? nova.style?.lineHeight ?? 1.2,
              breakMode: atual.autoWrap?.breakMode ?? 'word',
              autoExpand: atual.autoWrap?.autoExpand ?? false,
              ...semIndefinidos(campos.textboxConfig.autoWrap),
            },
          }
        : {}),
    }
  }
  if (campos.effects) nova.effects = { ...layer.effects, ...semIndefinidos(campos.effects) } as Layer['effects']
  if (campos.destaque) nova.destaque = { ...layer.destaque, ...semIndefinidos(campos.destaque) }
  if (campos.destaques) {
    const { destaques: _d, ...sem } = nova
    nova = campos.destaques.length > 0 ? { ...sem, destaques: campos.destaques.map((t) => ({ inicio: t.inicio, fim: t.fim })) } : (sem as Layer)
  }
  return nova
}

/** Os trechos de `destaques` que caem fora do `content` final (FASE 2: só aqui o texto é conhecido). */
function destaquesForaDoTexto(l: Layer): string | null {
  const n = typeof l.content === 'string' ? l.content.length : 0
  const fora = (l.destaques ?? []).filter((t) => t.fim > n)
  return fora.length > 0 ? `destaques fora do texto (${n} caracteres): ${fora.map((t) => `${t.inicio}–${t.fim}`).join(', ')}` : null
}

/**
 * DESTAQUE POR MARCAÇÃO (05/11/2026): o `content` que acabou de chegar numa camada `text`. Com [colchetes], grava o
 * texto LIMPO e os trechos em `destaques` (o `content` segue texto para legenda, gate e medição); sem colchetes, o texto
 * mudou e os `destaques` antigos saem. O estilo (`destaque`) da camada fica; sem ele, entra o da marca. Colchete sem par
 * vira aviso, nunca recusa (`lerDestaques`).
 */
export function marcarDestaquesNoTexto(camada: Layer, destaqueDaMarca?: (c: Layer) => EstiloDeDestaque | null): { camada: Layer; aviso: string | null } {
  if (camada.type !== 'text' || typeof camada.content !== 'string') return { camada, aviso: null }
  const { destaques: _antigos, ...semTrechos } = camada
  if (!temColchetes([camada.content])) return { camada: semTrechos as Layer, aviso: null }
  const lida = lerDestaques(camada.content)
  const marcada = { ...semTrechos, content: lida.texto } as Layer
  return {
    camada: comEstiloDoDestaque(lida.trechos.length > 0 ? { ...marcada, destaques: lida.trechos } : marcada, destaqueDaMarca),
    aviso: lida.problema ? `"${camada.name ?? camada.id}": ${lida.problema} — o trecho saiu sem destaque` : null,
  }
}

/** Camada que destaca e não tem estilo próprio ganha o da marca (sem ele, o render desenha só o peso forte). */
function comEstiloDoDestaque(camada: Layer, destaqueDaMarca?: (c: Layer) => EstiloDeDestaque | null): Layer {
  if (!camada.destaques?.length || camada.destaque) return camada
  const daMarca = destaqueDaMarca?.(camada)
  return daMarca ? { ...camada, destaque: { ...daMarca } } : camada
}

function semIndefinidos<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** A camada nova com os DEFAULTS do servidor (os de `createArteLivre`), por cima o que veio em `campos`. */
type Fabricada = { ok: true; layer: Layer } | { ok: false; codigo: CodigoDaRecusaDeCamada; motivo: string; campos?: string[] }

function fabricar(o: OperacaoDeCamada, ctx: ContextoDeEdicao, camadas: Layer[]): Fabricada {
  const { width: W, height: H } = ctx.canvas
  const escala = W / 1080
  const c = o.campos ?? {}
  const id = o.id ?? (ctx.novoId ?? createId)()
  const base = { id, visible: true, locked: false, order: camadas.length, rotation: 0 } as const
  const nome = (padrao: string) => c.name ?? padrao
  let layer: Layer
  switch (o.tipo) {
    case 'texto': {
      const fontSize = c.style?.fontSize ?? Math.round(48 * escala)
      const lineHeight = c.style?.lineHeight ?? 1.1
      const linhas = String(c.content ?? '').split('\n').length
      const width = c.size?.width ?? Math.round(W * 0.8)
      layer = {
        ...base,
        type: 'text',
        name: nome(`Texto ${camadas.filter(ehTexto).length + 1}`),
        content: c.content ?? '',
        position: { x: c.position?.x ?? Math.round((W - width) / 2), y: c.position?.y ?? Math.round(H * 0.4) },
        size: { width, height: c.size?.height ?? Math.round(fontSize * lineHeight * linhas) },
        style: {
          fontSize,
          fontFamily: c.style?.fontFamily ?? ctx.fontes?.corpo ?? FONT_CONFIG.DEFAULT_FONT,
          fontWeight: c.style?.fontWeight ?? '400',
          fontStyle: 'normal',
          color: c.style?.color ?? '#FFFFFF',
          textAlign: c.style?.textAlign ?? 'center',
          lineHeight,
          textTransform: c.style?.textTransform ?? 'none',
        },
        textboxConfig: { textMode: 'auto-wrap-fixed', autoWrap: { lineHeight, breakMode: 'word', autoExpand: false } },
      }
      break
    }
    case 'imagem':
    case 'logo': {
      const fileUrl = c.fileUrl ?? (o.tipo === 'logo' ? ctx.logoUrl ?? undefined : undefined)
      if (!fileUrl) {
        return o.tipo === 'logo'
          ? { ok: false, codigo: 'OPERACAO_INCOMPLETA', motivo: 'o cliente não tem logo cadastrada e a operação não trouxe fileUrl', campos: ['campos.fileUrl'] }
          : { ok: false, codigo: 'OPERACAO_INCOMPLETA', motivo: 'adicionar imagem precisa de campos.driveImageId (acervo) ou campos.fileUrl', campos: ['campos.driveImageId'] }
      }
      const logoW = Math.round(W * 0.18)
      const ehLogo = o.tipo === 'logo'
      layer = {
        ...base,
        type: ehLogo ? 'logo' : 'image',
        name: nome(ehLogo ? 'Logo' : 'Imagem'),
        position: ehLogo ? { x: c.position?.x ?? Math.round((W - logoW) / 2), y: c.position?.y ?? Math.round(H - logoW * 1.4) } : { x: c.position?.x ?? 0, y: c.position?.y ?? 0 },
        size: ehLogo ? { width: c.size?.width ?? logoW, height: c.size?.height ?? logoW } : { width: c.size?.width ?? W, height: c.size?.height ?? H },
        fileUrl,
        style: { objectFit: ehLogo ? 'contain' : 'cover' },
      }
      break
    }
    case 'forma':
    case 'icone': {
      const lado = Math.round((o.tipo === 'forma' ? 200 : 120) * escala)
      layer = {
        ...base,
        type: o.tipo === 'forma' ? 'shape' : 'icon',
        name: nome(o.tipo === 'forma' ? 'Forma' : 'Ícone'),
        position: { x: c.position?.x ?? Math.round((W - lado) / 2), y: c.position?.y ?? Math.round((H - lado) / 2) },
        size: { width: c.size?.width ?? lado, height: c.size?.height ?? lado },
        style: o.tipo === 'forma' ? { shapeType: 'rectangle', fill: '#000000' } : { fill: '#FFFFFF', color: '#FFFFFF' },
      }
      break
    }
    case 'gradiente': {
      layer = {
        ...base,
        type: 'gradient',
        name: nome('Gradiente'),
        position: { x: c.position?.x ?? 0, y: c.position?.y ?? Math.round(H * 0.45) },
        size: { width: c.size?.width ?? W, height: c.size?.height ?? Math.round(H * 0.55) },
        style: {
          gradientType: 'linear',
          gradientAngle: 180,
          gradientStops: [
            { id: '1', color: '#000000', position: 0, opacity: 0 },
            { id: '2', color: '#000000', position: 1, opacity: 0.75 },
          ],
        },
      }
      break
    }
    default:
      return { ok: false, codigo: 'OPERACAO_INCOMPLETA', motivo: `tipo desconhecido: ${String(o.tipo)}`, campos: ['tipo'] }
  }
  // O que veio em `campos` por cima dos defaults (position/size já entraram; o resto funde como em definir).
  const { position: _p, size: _s, content: _c, fileUrl: _f, driveImageId: _d, ...resto } = c
  return { ok: true, layer: fundirDefinir(layer, resto) }
}

/**
 * Aplica as operações em ordem sobre uma cópia. TUDO OU NADA: qualquer recusa devolve as camadas de entrada
 * intactas e a lista completa das recusas (as válidas não são executadas). Nenhuma recusa → o estado final.
 */
export function aplicarOperacoesDeCamadas(entrada: Layer[], operacoes: OperacaoDeCamada[], ctx: ContextoDeEdicao): ResultadoDasCamadas {
  const recusadas = validarFormatoDasOperacoes(operacoes, ctx)
  const aplicadas: CamadaAplicada[] = []
  const tocadas = new Set<string>()
  const avisos: string[] = []
  let camadas: Layer[] = entrada.map((l) => ({ ...l }))
  /** O content chegou: colchetes viram `destaques`; com `destaques` enviados, valem eles. Destacando sem estilo, o da marca. */
  const marcar = (l: Layer, campos: CamposDaCamada | undefined): Layer => {
    if (l.type !== 'text') return l
    // Com `destaques` explícito o content veio sem colchetes (FASE 1): os trechos são os enviados.
    if (campos?.content !== undefined && campos.destaques === undefined) {
      const r = marcarDestaquesNoTexto(l, ctx.destaqueDaMarca)
      if (r.aviso) avisos.push(r.aviso)
      return r.camada
    }
    return comEstiloDoDestaque(l, ctx.destaqueDaMarca)
  }

  operacoes.forEach((o, indice) => {
    if (recusadas.some((r) => r.indice === indice)) return
    const recusa = (codigo: CodigoDaRecusaDeCamada, motivo: string, campos?: string[]) =>
      recusadas.push({ indice, op: o.op, ...(o.camada ? { camada: o.camada } : {}), codigo, motivo, ...(campos?.length ? { campos } : {}) })

    if (o.op === 'adicionar') {
      if (o.id && camadas.some((l) => l.id === o.id)) return recusa('ID_JA_EXISTE', `já existe uma camada com o id ${o.id}`, ['id'])
      const tipoDaCamada = { texto: 'text', imagem: 'image', logo: 'logo', forma: 'shape', icone: 'icon', gradiente: 'gradient' }[o.tipo!]
      if (o.campos) {
        const { position: _p, size: _s, content: _c, fileUrl: _f, driveImageId: _d, ...resto } = o.campos
        const { fora } = camposForaDoTipo(tipoDaCamada, resto)
        if (fora.length > 0) return recusa('CAMPO_NAO_PERMITIDO', `${o.tipo} não aceita ${fora.join(', ')}`, fora)
      }
      const comFoto = comFotoDoAcervo(o.campos ?? {}, ctx)
      if ('codigo' in comFoto) return recusa(comFoto.codigo, comFoto.motivo, comFoto.campos)
      const fabricada = fabricar({ ...o, campos: comFoto.campos }, ctx, camadas)
      if (fabricada.ok === false) return recusa(fabricada.codigo, fabricada.motivo, fabricada.campos)
      const nova = marcar(fabricada.layer, o.campos)
      const foraDoTexto = destaquesForaDoTexto(nova)
      if (foraDoTexto) return recusa('VALOR_FORA_DA_FAIXA', foraDoTexto, ['destaques'])
      camadas = o.ordem !== undefined ? mover([...camadas, nova], nova.id, o.ordem) : renumerar([...camadas, nova])
      if (ehTexto(nova)) tocadas.add(nova.id)
      aplicadas.push({ indice, op: o.op, camada: nova.id, detalhe: `${o.tipo} "${nova.name}" criado em (${nova.position.x}, ${nova.position.y}) ${nova.size.width}×${nova.size.height}${o.ordem !== undefined ? `, ordem ${o.ordem}` : ''}` })
      return
    }

    const achada = achar(camadas, o.camada!)
    if ('codigo' in achada) return recusa(achada.codigo, achada.motivo, ['camada'])
    const { layer } = achada
    const travada = tipoNaoEditavel(layer, o.op === 'definir' && o.campos?.order !== undefined ? 'reordenar' : o.op)
    if (travada) return recusa('TIPO_NAO_EDITAVEL', `${layer.id}: ${travada}`)

    if (o.op === 'remover') {
      if (ctx.apenasRascunho && ehTexto(layer) && temTextoSubstantivo(layer.content)) return recusa('CONTEUDO_NAO_PODE_SER_REMOVIDO', `remover "${layer.name}" apaga copy: este perfil não apaga texto com conteúdo`)
      camadas = renumerar(camadas.filter((l) => l.id !== layer.id))
      aplicadas.push({ indice, op: o.op, camada: layer.id, detalhe: `${layer.type} "${layer.name}" removida` })
      return
    }
    if (o.op === 'reordenar') {
      camadas = mover(camadas, layer.id, o.ordem!)
      aplicadas.push({ indice, op: o.op, camada: layer.id, detalhe: `"${layer.name}" na posição ${camadas.find((l) => l.id === layer.id)!.order} da pilha` })
      return
    }

    // definir
    const campos = o.campos!
    if (!PERMITIDOS[layer.type]) return recusa('TIPO_NAO_EDITAVEL', `${layer.id}: tipo ${layer.type} não se edita por aqui`)
    const { fora, motivo } = camposForaDoTipo(layer.type, campos)
    if (fora.length > 0) return recusa('CAMPO_NAO_PERMITIDO', `${layer.type} "${layer.id}" não aceita ${fora.join(', ')}${motivo ? ` — ${motivo}` : ''}`, fora)
    if (ctx.apenasRascunho && ehTexto(layer) && temTextoSubstantivo(layer.content)) {
      if (campos.visible === false) return recusa('CONTEUDO_NAO_PODE_SER_REMOVIDO', `esconder "${layer.name}" apaga copy: este perfil não esconde texto com conteúdo`, ['visible'])
      if (campos.content !== undefined && !temTextoSubstantivo(campos.content)) return recusa('CONTEUDO_NAO_PODE_SER_REMOVIDO', `"${layer.name}" ficaria sem conteúdo: troque o texto por outro texto`, ['content'])
    }
    const { order, ...semOrdem } = campos
    const comFoto = comFotoDoAcervo(semOrdem, ctx)
    if ('codigo' in comFoto) return recusa(comFoto.codigo, comFoto.motivo, comFoto.campos)
    let nova = marcar(fundirDefinir(layer, comFoto.campos), campos)
    const foraDoTexto = destaquesForaDoTexto(nova)
    if (foraDoTexto) return recusa('VALOR_FORA_DA_FAIXA', `${layer.id}: ${foraDoTexto}`, ['destaques'])
    // Copy que SOME sem ser escondida (revisão do PR #294): invisível, minúscula ou fora da página é apagar copy.
    if (ctx.apenasRascunho && ehTexto(nova) && temTextoSubstantivo(nova.content)) {
      const sumida = copySumida(nova, campos, ctx.canvas)
      if (sumida) return recusa('CONTEUDO_NAO_PODE_SER_REMOVIDO', `"${layer.name}" ${sumida.motivo}: este perfil não apaga copy`, sumida.campos)
    }
    camadas = camadas.map((l) => (l.id === layer.id ? nova : l))
    if (order !== undefined) {
      camadas = mover(camadas, layer.id, order)
      nova = camadas.find((l) => l.id === layer.id)!
    }
    if (ehTexto(nova) && ['content', 'style', 'size', 'textboxConfig', 'destaques', 'destaque'].some((k) => (campos as Objeto)[k] !== undefined)) tocadas.add(nova.id)
    aplicadas.push({ indice, op: o.op, camada: layer.id, detalhe: `${Object.keys(campos).join(', ')} definidos em "${layer.name}"` })
  })

  if (recusadas.length > 0) return { camadas: entrada, aplicadas: [], recusadas: recusadas.sort((a, b) => a.indice - b.indice), tocadas: [], avisos: [] }
  return { camadas, aplicadas, recusadas: [], tocadas: [...tocadas], avisos }
}

/** O bloco `pagina`: fundo, largura e altura, com faixa e cor conferidas. */
export function aplicarPagina(
  atual: { width: number; height: number; background: string | null },
  pedido: PaginaDoAjuste | undefined,
): { pagina: { width: number; height: number; background: string | null }; mudou: boolean; recusadas: RecusaDeCamada[] } {
  const recusadas = validarFormatoDaPagina(pedido)
  if (!pedido || recusadas.length > 0) return { pagina: atual, mudou: false, recusadas }
  const pagina = { width: pedido.width ?? atual.width, height: pedido.height ?? atual.height, background: pedido.background ?? atual.background }
  const mudou = pagina.width !== atual.width || pagina.height !== atual.height || pagina.background !== atual.background
  return { pagina, mudou, recusadas: [] }
}

// ── Leitura (ver-pagina) ──────────────────────────────────────────────────

/**
 * A camada como `ver-pagina` a devolve: só os campos conhecidos de `src/types/template.ts`, sem `metadata` interno
 * nem `style.vetor` (proveniência inerte). `grupo` e `grade` saem como marcas de leitura: dizem o que `remover` e
 * `reordenar` vão recusar.
 */
export function camadaParaLeitura(l: Layer): Record<string, unknown> {
  const { vetor: _v, ...style } = (l.style ?? {}) as LayerStyle
  const saida: Record<string, unknown> = {
    id: l.id,
    type: l.type,
    name: l.name,
    visible: l.visible !== false,
    locked: l.locked === true,
    order: l.order,
    position: l.position,
    size: l.size,
  }
  for (const k of ['rotation', 'content', 'fileUrl', 'isDynamic', 'effects', 'textboxConfig', 'richTextStyles', 'destaques', 'destaque'] as const) {
    if (l[k] !== undefined) saida[k] = l[k]
  }
  // Destaque por marcação: o mesmo texto com os [colchetes] — é o que se manda de volta em `definir content`.
  const marcado = l.type === 'text' ? linhasComColchetes(l) : null
  if (marcado) saida.conteudoMarcado = marcado.join('\n')
  if (Object.keys(style).length > 0) saida.style = style
  const grupo = grupoDe(l)
  if (grupo) saida.grupo = grupo
  if (vinculadaAGrade(l)) saida.grade = true
  return saida
}
