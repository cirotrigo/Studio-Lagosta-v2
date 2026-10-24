/**
 * As cores da FORMA no painel de propriedades (CP-V3): fileiras Marca → Nesta página → Personalizada, o elo de cada
 * canal com o papel da marca e o "Reaplicar cores da marca". Módulo PURO, sem React e sem `@/lib/db`.
 *
 * - Canal = o campo FÍSICO da camada (`preenchimento` → `style.fill`, `contorno` → `style.strokeColor`). O papel vem SÓ
 *   de `style.vetor.papeis` da camada; o catálogo dá o rótulo e nunca o papel (religar o elo não existe: Q1 = A).
 * - Toda leitura de cor passa pelo `lerCor`; a cor aplicada pela fileira Marca é o `hexValido` do item (canônico),
 *   nunca o `hexCode` cru.
 * - O Reaplicar preserva o alfa DA COR e não toca `opacity`/`fillOpacity`/`strokeOpacity`: a canonização aplica os
 *   multiplicadores uma vez só. Sem mudança, nada é canonizado (a camada volta igual, sem desfazer nem PATCH).
 */
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { PAPEIS_DA_MARCA, resolverCorDaMarca, type DadosDaMarca, type PapelDaMarca } from '@/lib/brand/papeis-de-cor'
import { hexValido } from '@/lib/creatives/halo/fundo-de-texto'
import { applyOpacityToEditableColor, canonicalizeShapeStyleForPersistence } from '@/lib/shape-style'
import { lerCor } from '@/lib/vetor/cor'
import type { CanalDeCor } from '@/lib/vetor/tipos'
import type { DesignData, Layer, LayerStyle } from '@/types/template'

export const CANAIS_DA_FORMA = ['preenchimento', 'contorno'] as const satisfies readonly CanalDeCor[]
const CAMPO: Record<CanalDeCor, 'fill' | 'strokeColor'> = { preenchimento: 'fill', contorno: 'strokeColor' }
/** Os fallbacks que o painel já usa para cada canal (só para o `applyOpacityToEditableColor`; a entrada é hex válido). */
const FALLBACK: Record<CanalDeCor, string> = { preenchimento: '#2563eb', contorno: '#1e3a8a' }
const NOME_DO_CANAL: Record<CanalDeCor, string> = { preenchimento: 'Preenchimento', contorno: 'Cor da borda' }

export const ROTULO_DO_PAPEL: Record<PapelDaMarca, string> = {
  escuro: 'Escuro',
  claro: 'Claro',
  destaque: 'Destaque',
  destaque2: 'Destaque 2',
  texto: 'Texto',
}
/** A dica do elo: o papel só vale no Reaplicar, nunca muda a cor sozinho (d08). */
export const DICA_DO_ELO = 'Esta cor volta à cor da marca quando você clica em Reaplicar cores da marca. Ela não muda sozinha quando a paleta muda.'

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ehPapel = (v: unknown): v is PapelDaMarca => typeof v === 'string' && (PAPEIS_DA_MARCA as readonly string[]).includes(v)

export type PapelLido = { tipo: 'vinculado'; papel: PapelDaMarca } | { tipo: 'desconhecido'; valor: string } | null

export function papelDoCanal(style: LayerStyle | undefined, canal: CanalDeCor): PapelLido {
  const papeis = ehObjeto(style?.vetor) ? (style!.vetor as unknown as Record<string, unknown>).papeis : undefined
  if (!ehObjeto(papeis) || !Object.hasOwn(papeis, canal)) return null
  const valor = papeis[canal]
  return ehPapel(valor) ? { tipo: 'vinculado', papel: valor } : { tipo: 'desconhecido', valor: String(valor) }
}

export function eloDoCanal(style: LayerStyle | undefined, canal: CanalDeCor): string | null {
  const p = papelDoCanal(style, canal)
  if (!p) return null
  return p.tipo === 'vinculado' ? `Acompanha a marca: ${ROTULO_DO_PAPEL[p.papel]}` : 'Papel desconhecido (não é reaplicado)'
}

export function podeReaplicar(style: LayerStyle | undefined): boolean {
  return CANAIS_DA_FORMA.some((c) => papelDoCanal(style, c)?.tipo === 'vinculado')
}

const CATALOGO = new Map(SHAPES_LIBRARY.map((d) => [d.id, d]))

/** O rótulo do slot do catálogo (item conhecido e mesma versão); senão o padrão. Só apresentação. */
export function rotuloDoCanal(layer: Pick<Layer, 'style'>, canal: CanalDeCor): string {
  const asset = ehObjeto(layer.style?.vetor) ? layer.style!.vetor!.asset : undefined
  const definicao = asset && typeof asset.id === 'string' ? CATALOGO.get(asset.id) : undefined
  const slot = definicao && (definicao.versao ?? 1) === asset!.versao ? definicao.slots?.find((s) => s.canal === canal) : undefined
  if (slot) return slot.rotulo
  if (canal === 'preenchimento' && layer.style?.shapeType === 'line') return 'Cor da linha'
  return NOME_DO_CANAL[canal]
}

export interface CorAplicavel {
  id: unknown
  name: string
  /** `#rrggbb` canônico (o que o clique grava). */
  hex: string
  /** O que o swatch mostra no título: nome e o `hexCode` como cadastrado. */
  rotulo: string
}

/** A paleta da fileira Marca: aplicável só o que o `hexValido` lê (`#rgb`/`#rrggbb`, com espaço externo). */
export function classificarPaleta(cores: ReadonlyArray<{ id?: unknown; name?: unknown; hexCode?: unknown }>): { aplicaveis: CorAplicavel[]; ignoradas: number } {
  const aplicaveis: CorAplicavel[] = []
  let ignoradas = 0
  for (const c of cores) {
    const hex = hexValido(c.hexCode)
    if (!hex) {
      ignoradas += 1
      continue
    }
    const name = typeof c.name === 'string' ? c.name : ''
    aplicaveis.push({ id: c.id, name, hex, rotulo: `${name} (${String(c.hexCode).trim()})` })
  }
  return { aplicaveis, ignoradas }
}

/** O swatch acende quando os CANAIS da cor salva são os dele (o alfa é do slider). Sem cor legível, nada acende. */
export function swatchAtivo(valorSalvo: unknown, hex: string): boolean {
  const lida = lerCor(valorSalvo)
  return !!lida && lida !== 'transparente' && lida.hex === hex
}

/** As cores já usadas na página (forma, texto, ícone e o fundo), sem a paleta: derivadas, nunca armazenadas. */
export function coresNestaPagina(design: Pick<DesignData, 'layers' | 'canvas'>, hexDaPaleta: readonly string[], teto = 8): string[] {
  const fora = new Set(hexDaPaleta)
  const vistas = new Set<string>()
  const saida: string[] = []
  const ver = (valor: unknown) => {
    if (saida.length >= teto) return
    const lida = lerCor(valor)
    if (!lida || lida === 'transparente' || fora.has(lida.hex) || vistas.has(lida.hex)) return
    vistas.add(lida.hex)
    saida.push(lida.hex)
  }
  for (const layer of design.layers ?? []) {
    if (!ehObjeto(layer) || !ehObjeto(layer.style)) continue
    const s = layer.style as LayerStyle
    if (layer.type === 'shape') {
      ver(s.fill)
      ver(s.strokeColor)
      ver(ehObjeto(s.border) ? s.border.color : undefined)
    } else if (layer.type === 'text') ver(s.color)
    else if (layer.type === 'icon') ver(s.fill)
  }
  ver(design.canvas?.backgroundColor)
  return saida
}

export type MotivoDoCanal = 'reaplicado' | 'sem-mudanca' | 'sem-papel' | 'papel-desconhecido' | 'sem-cor' | 'cor-ilegivel'
export interface ResultadoDoCanal {
  canal: CanalDeCor
  motivo: MotivoDoCanal
  papel?: PapelDaMarca
}

export function reaplicarCoresDaMarca(style: LayerStyle | undefined, marca: DadosDaMarca): { style: LayerStyle | undefined; canais: ResultadoDoCanal[] } {
  const canais: ResultadoDoCanal[] = []
  let proximo = style
  for (const canal of CANAIS_DA_FORMA) {
    const p = papelDoCanal(style, canal)
    if (!p) {
      canais.push({ canal, motivo: 'sem-papel' })
      continue
    }
    if (p.tipo === 'desconhecido') {
      canais.push({ canal, motivo: 'papel-desconhecido' })
      continue
    }
    const valor = style?.[CAMPO[canal]]
    const lida = lerCor(valor)
    if (valor === undefined || valor === null || valor === '' || lida === 'transparente') {
      canais.push({ canal, motivo: 'sem-cor', papel: p.papel })
      continue
    }
    if (!lida) {
      canais.push({ canal, motivo: 'cor-ilegivel', papel: p.papel })
      continue
    }
    const novo = applyOpacityToEditableColor(resolverCorDaMarca(p.papel, marca).hex, lida.alfa, FALLBACK[canal])
    const lidaNova = lerCor(novo)
    if (lidaNova && lidaNova !== 'transparente' && lidaNova.hex === lida.hex && lidaNova.alfa === lida.alfa) {
      canais.push({ canal, motivo: 'sem-mudanca', papel: p.papel })
      continue
    }
    proximo = { ...proximo, [CAMPO[canal]]: novo }
    canais.push({ canal, motivo: 'reaplicado', papel: p.papel })
  }
  return { style: proximo, canais }
}

/** O pipeline do Reaplicar numa camada: sem mudança devolve a PRÓPRIA camada (antes de canonizar). */
export function reaplicarNaCamada(camada: Layer, marca: DadosDaMarca): Layer {
  const r = reaplicarCoresDaMarca(camada.style, marca)
  if (r.style === camada.style) return camada
  return { ...camada, style: canonicalizeShapeStyleForPersistence(r.style) }
}

const TEXTO_DO_MOTIVO: Record<Exclude<MotivoDoCanal, 'reaplicado' | 'sem-papel'>, string> = {
  'sem-mudanca': 'já está na cor da marca',
  'papel-desconhecido': 'papel desconhecido',
  'sem-cor': 'sem cor',
  'cor-ilegivel': 'cor ilegível',
}

export function resumoDoReaplicar(canais: readonly ResultadoDoCanal[]): string {
  const abertura = canais.some((c) => c.motivo === 'reaplicado') ? 'Cores da marca reaplicadas.' : 'Nada mudou.'
  const notas = canais
    .filter((c): c is ResultadoDoCanal & { motivo: keyof typeof TEXTO_DO_MOTIVO } => c.motivo !== 'reaplicado' && c.motivo !== 'sem-papel')
    .map((c) => `${NOME_DO_CANAL[c.canal]}: ${TEXTO_DO_MOTIVO[c.motivo]}.`)
  return [abertura, ...notas].join(' ')
}

/** Quem o Reaplicar autorizou no clique. `pageId` é nulo fora do editor multipágina. */
export interface AlvoDoReaplicar {
  token: number
  projectId: number
  templateId: number
  pageId: string | null
  geracao: number
  layerId: string
}
/** O editor agora: lida de novo na volta da releitura e DENTRO do atualizador. */
export interface SituacaoDoEditor {
  token: number
  montado: boolean
  projectId: number
  templateId: number
  pageId: string | null
  geracao: number
  selecao: readonly string[]
}

export function alvoValido(alvo: AlvoDoReaplicar, agora: SituacaoDoEditor): boolean {
  return (
    agora.montado &&
    agora.token === alvo.token &&
    agora.projectId === alvo.projectId &&
    agora.templateId === alvo.templateId &&
    agora.pageId === alvo.pageId &&
    agora.geracao === alvo.geracao &&
    agora.selecao.length === 1 &&
    agora.selecao[0] === alvo.layerId
  )
}

/**
 * O atualizador que vai ao `updateLayer`: repete a guarda COMPLETA na hora em que o React o executa e calcula sobre a
 * camada ATUAL (uma escolha manual feita na espera já tirou o papel daquele canal e fica). Fora do alvo, a camada volta
 * intacta.
 */
export function atualizadorDoReaplicar(alvo: AlvoDoReaplicar, lerSituacao: () => SituacaoDoEditor, marca: DadosDaMarca): (camada: Layer) => Layer {
  return (camada) => (camada.id === alvo.layerId && alvoValido(alvo, lerSituacao()) ? reaplicarNaCamada(camada, marca) : camada)
}

/**
 * A geração da carga do documento no editor (D-V3-5): sobe em toda carga (`loadTemplate`) e quando o documento muda
 * (outro template/projeto no mesmo provider). Edição e um novo objeto do MESMO documento não a mudam.
 */
export function criarGeracaoDaCarga(documento: string) {
  let geracao = 0
  let atual = documento
  return {
    valor: () => geracao,
    carregou: () => {
      geracao += 1
    },
    documento: (chave: string) => {
      if (chave === atual) return
      atual = chave
      geracao += 1
    },
  }
}
