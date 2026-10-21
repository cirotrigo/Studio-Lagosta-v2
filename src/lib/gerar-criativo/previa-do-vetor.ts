/**
 * `svg-path` na prévia do /gerar-criativo (CP-X1). Puro, sem React e sem banco: a
 * tela, o export e o `finalize` usam as mesmas funções.
 *
 * - Candidato vetorial = `shape` + `shapeType: 'svg-path'`, exista ou não `pathData`.
 * - Desenhado = fora de `hiddenLayerIds` e com `visible !== false` (o critério da prévia).
 * - A prévia desenha pelo adaptador do editor (`shapeKonvaDoSvgPath`, traçado único do
 *   CP-V0); o que ela NÃO desenha é recusado aqui, nunca omitido em silêncio.
 */
import type { ShapeConfig } from 'konva/lib/Shape'
import type { Layer } from '@/types/template'
import { pinturaDoSvgPath, shapeKonvaDoSvgPath } from '@/lib/vetor/desenhar'
import { validarPathData } from '@/lib/vetor/validar'
import { ANCORAS_DOS_CANTOS, TODAS_AS_ANCORAS, type Ancora } from '@/lib/konva/trava-de-proporcao'
import { applyOpacityToColor, getShapeChannelOpacity } from './opacidade-da-previa'

/**
 * Sinal de compatibilidade do cliente que desenha o vetor. NÃO é prova de pixel:
 * só separa o fluxo atualizado do app da aba antiga (que desenhava retângulo).
 */
export const VERSAO_DA_PREVIA = 'vetor-v1' as const

export type CodigoDoVetor = 'PATH_AUSENTE' | 'PATH_INVALIDO' | 'VIEWBOX_INVALIDO' | 'EFEITO_SEM_SUPORTE'

export interface MotivoDoVetor {
  codigo: CodigoDoVetor
  mensagem: string
  /** Código do `validarPathData` ou nome do efeito. */
  detalhe?: string
}

export interface VetorComProblema {
  id: string
  nome: string
  motivos: MotivoDoVetor[]
}

type CamadaMinima = Pick<Layer, 'id' | 'type'> & Partial<Pick<Layer, 'name' | 'visible' | 'style' | 'effects'>>

export function ehCandidatoVetorial(layer: CamadaMinima): boolean {
  return layer.type === 'shape' && layer.style?.shapeType === 'svg-path'
}

export function ehDesenhada(layer: CamadaMinima, ocultas: ReadonlySet<string>): boolean {
  return !ocultas.has(layer.id) && layer.visible !== false
}

/** Vazio = a prévia desenha este vetor igual ao servidor. */
export function diagnosticoDoVetor(layer: CamadaMinima): MotivoDoVetor[] {
  const motivos: MotivoDoVetor[] = []
  const style = layer.style ?? {}

  const d = style.pathData
  if (d === undefined || d === null || (typeof d === 'string' && d.trim() === '')) {
    motivos.push({ codigo: 'PATH_AUSENTE', mensagem: 'a forma não tem o desenho (pathData)' })
  } else {
    const r = validarPathData(d)
    // sem strictNullChecks o `!r.ok` não estreita a união
    if (r.ok === false) {
      const falha = r as Extract<typeof r, { ok: false }>
      motivos.push({ codigo: 'PATH_INVALIDO', mensagem: falha.mensagem, detalhe: falha.codigo })
    }
  }

  // ausente (undefined) vale: o traçado usa 0 0 100 100. Presente — inclusive `null` — tem
  // de ser 4 números finitos com largura e altura > 0
  const vb = style.pathViewBox as unknown
  if (vb !== undefined) {
    const ok = Array.isArray(vb) && vb.length === 4 && vb.every((n) => typeof n === 'number' && Number.isFinite(n))
      && (vb[2] as number) > 0 && (vb[3] as number) > 0
    if (!ok) motivos.push({ codigo: 'VIEWBOX_INVALIDO', mensagem: 'pathViewBox precisa de 4 números finitos com largura e altura > 0' })
  }

  const sem = (detalhe: string, mensagem: string) =>
    motivos.push({ codigo: 'EFEITO_SEM_SUPORTE', mensagem, detalhe })
  const effects = (layer.effects ?? {}) as Record<string, { enabled?: boolean; blurRadius?: number } | undefined>
  for (const [nome, efeito] of Object.entries(effects)) {
    if (!efeito?.enabled) continue
    // blur com raio 0 não desenha nada no servidor (renderShape: blurRadius > 0)
    if (nome === 'blur' && !(Math.round(efeito.blurRadius ?? 0) > 0)) continue
    sem(nome, nome === 'blur' ? 'desfoque (halo)' : nome === 'shadow' ? 'sombra' : `efeito "${nome}"`)
  }
  // o servidor ainda desenha a sombra antiga em style.shadow (applyShadow)
  if (style.shadow) sem('style.shadow', 'sombra')
  const partes = (style as { vetor?: { partes?: unknown } }).vetor?.partes
  if (Array.isArray(partes) && partes.length > 0) sem('vetor.partes', 'vetor de várias cores')

  return motivos
}

/** Vetores desenhados que a prévia não desenha igual ao servidor. */
export function vetoresComProblema(layers: CamadaMinima[], ocultas: ReadonlySet<string>): VetorComProblema[] {
  return layers
    .filter((l) => ehCandidatoVetorial(l) && ehDesenhada(l, ocultas))
    .map((l) => ({ id: l.id, nome: l.name ?? l.id, motivos: diagnosticoDoVetor(l) }))
    .filter((v) => v.motivos.length > 0)
}

export function temVetorDesenhado(layers: CamadaMinima[], ocultas: ReadonlySet<string>): boolean {
  return layers.some((l) => ehCandidatoVetorial(l) && ehDesenhada(l, ocultas))
}

/** Uma frase para a tela: "Seta: sombra; Onda: o desenho é inválido". */
export function resumoDosProblemas(problemas: VetorComProblema[]): string {
  return problemas.map((p) => `${p.nome}: ${p.motivos.map((m) => m.mensagem).join(', ')}`).join('; ')
}

/**
 * Transformer da prévia: forma com `style.manterProporcao === true` redimensiona com
 * `keepRatio` e só pelos cantos (o `keepRatio` do Konva não vale nas alças do meio),
 * como no editor (CP-V1). O resto fica como a prévia sempre foi: livre, 8 alças.
 */
export function travaDaPrevia(layer: Pick<Layer, 'type' | 'style'> | undefined): { keepRatio: boolean; ancoras: Ancora[] } {
  const travada = layer?.type === 'shape' && layer.style?.manterProporcao === true
  return { keepRatio: travada, ancoras: travada ? ANCORAS_DOS_CANTOS : TODAS_AS_ANCORAS }
}

/**
 * Atributos do `Konva.Shape` da prévia — os do editor (`ShapeNode`, ramo svg-path):
 * opacidade da camada no nó, só a do canal na cor, caixa mínima de 10 px. Só para
 * candidato com `diagnosticoDoVetor` vazio.
 */
export function configDoSvgPathNaPrevia(layer: Layer): ShapeConfig {
  const style = layer.style ?? {}
  const borderWidth = style.border?.width ?? 0
  const fill = applyOpacityToColor(style.fill ?? '#2563eb', getShapeChannelOpacity(layer, 'fill'))
  const stroke = style.strokeColor
    ? applyOpacityToColor(style.strokeColor, getShapeChannelOpacity(layer, 'stroke'))
    : borderWidth > 0
      ? applyOpacityToColor(style.border?.color ?? '#000000', getShapeChannelOpacity(layer, 'stroke'))
      : undefined
  const strokeWidth = style.strokeWidth ?? borderWidth ?? 0
  return {
    name: layer.id,
    x: layer.position?.x || 0,
    y: layer.position?.y || 0,
    width: Math.max(10, layer.size?.width ?? 0),
    height: Math.max(10, layer.size?.height ?? 0),
    rotation: layer.rotation ?? 0,
    opacity: style.opacity ?? 1,
    // O PNG da prévia é o que se publica, então segue o SERVIDOR: lá a opacidade
    // da camada é `globalAlpha` em cada operação (preenche, depois contorna). Com
    // o padrão do Konva (perfectDrawEnabled), forma com preenchimento + contorno e
    // opacidade < 1 é composta num buffer e a faixa onde o contorno cobre o
    // preenchimento sai diferente do servidor.
    perfectDrawEnabled: false,
    ...shapeKonvaDoSvgPath(style.pathData as string, style.pathViewBox, pinturaDoSvgPath(style, { fill, stroke, strokeWidth })),
  }
}
