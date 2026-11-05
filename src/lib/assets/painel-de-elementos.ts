/**
 * O que o painel "Elementos" MOSTRA do catálogo (CP-V2d). Módulo puro, sem React e sem `@/lib/db`.
 *
 * Categoria do painel é APRESENTAÇÃO: o `category` literal dos 37 legados não muda (o teste do catálogo trava o sha256
 * deles), e o remapeamento mora aqui (D3, preflight do CP-V2 §7.1). Item com categoria fora da lista vai para "Outros",
 * nunca some. O `sparkle` sai só da exibição, em favor do `spark-4` (D4a): continua no catálogo e nas 26 máscaras.
 * A busca ignora acento e caixa e acha em português e inglês (os termos em inglês dos 37 ficam em `TERMOS_DO_PAINEL`).
 */
import { SHAPES_LIBRARY, type ShapeDefinition } from '@/lib/assets/shapes-library'

export type CategoriaDoPainel = 'linhas' | 'formas' | 'organicos' | 'setas' | 'destaques' | 'editorial' | 'ornamentos'
export type SecaoDoPainel = CategoriaDoPainel | 'outros' | 'marca'

/** As 7 categorias do catálogo, na ordem da proposta de arquitetura; os mesmos ids e rótulos das candidatas (teste). */
export const CATEGORIAS_DO_PAINEL: Array<{ id: CategoriaDoPainel; label: string }> = [
  { id: 'linhas', label: 'Linhas' },
  { id: 'formas', label: 'Formas' },
  { id: 'organicos', label: 'Orgânicos' },
  { id: 'setas', label: 'Setas' },
  { id: 'destaques', label: 'Destaques' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'ornamentos', label: 'Ornamentos' },
]

/** As seções do painel: as 7, depois "Outros" (só com item) e a "Marca" (os elementos do projeto). */
export const SECOES_DO_PAINEL: Array<{ id: SecaoDoPainel; label: string }> = [
  ...CATEGORIAS_DO_PAINEL,
  { id: 'outros', label: 'Outros' },
  { id: 'marca', label: 'Marca' },
]

/** D4a: o `spark-4` (mesmo desenho) ocupa o lugar dele no painel. */
export const OCULTOS_NO_PAINEL: readonly string[] = ['sparkle']

// `Map`, não objeto: `category` ou `id` como "constructor"/"toString"/"__proto__" não pode achar membro herdado
const DAS_LEGADAS = new Map<string, CategoriaDoPainel>([
  ['basicas', 'formas'],
  ['setas', 'setas'],
  ['linhas', 'linhas'],
])

/** As decorativas legadas vão POR ID; uma decorativa nova sem id aqui cai em "Outros", não numa categoria errada. */
const DAS_DECORATIVAS = new Map<string, CategoriaDoPainel>([
  ['blob', 'organicos'], ['cloud', 'organicos'], ['drop', 'organicos'],
  ['banner', 'destaques'], ['tag', 'destaques'], ['speech', 'destaques'], ['burst', 'destaques'],
  ['heart', 'ornamentos'], ['sparkle', 'ornamentos'], ['bolt', 'ornamentos'], ['pin', 'ornamentos'], ['shield', 'ornamentos'],
])

export function categoriaNoPainel(def: ShapeDefinition): CategoriaDoPainel | 'outros' {
  if (def.category === 'decorativas') return DAS_DECORATIVAS.get(def.id) ?? 'outros'
  return DAS_LEGADAS.get(def.category) ?? CATEGORIAS_DO_PAINEL.find((c) => c.id === def.category)?.id ?? 'outros'
}

/** Complemento de busca dos 37 legados (os candidatos já trazem PT e EN nas `keywords`). */
export const TERMOS_DO_PAINEL: Record<string, string[]> = {
  rectangle: ['rectangle', 'square', 'box'],
  rounded: ['rounded rectangle', 'card'],
  circle: ['circle', 'round'],
  triangle: ['triangle'],
  star: ['star'],
  diamond: ['diamond', 'rhombus'],
  pentagon: ['pentagon'],
  hexagon: ['hexagon'],
  octagon: ['octagon'],
  trapezoid: ['trapezoid'],
  parallelogram: ['parallelogram'],
  semicircle: ['semicircle', 'half circle'],
  ring: ['ring'],
  cross: ['cross', 'plus'],
  arrow: ['arrow', 'thin arrow'],
  'arrow-right': ['arrow right'],
  'arrow-left': ['arrow left'],
  'arrow-up': ['arrow up'],
  'arrow-down': ['arrow down'],
  'chevron-right': ['chevron'],
  line: ['line'],
  'line-dashed': ['dashed line'],
  'line-dotted': ['dotted line'],
  'line-arrow': ['arrow line'],
  'line-arrow-both': ['double arrow line'],
  heart: ['heart', 'love'],
  burst: ['burst', 'badge'],
  bolt: ['bolt', 'lightning'],
  drop: ['drop', 'water'],
  pin: ['pin', 'location', 'map pin'],
  speech: ['speech bubble'],
  cloud: ['cloud'],
  blob: ['blob', 'organic'],
  shield: ['shield'],
  tag: ['tag', 'price', 'sale'],
  banner: ['banner'],
}

export function normalizarBusca(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Algum dos textos contém o termo (os dois normalizados). Termo vazio casa tudo. */
export function casaBusca(textos: Array<string | null | undefined>, termo: string): boolean {
  const q = normalizarBusca(termo)
  return !q || textos.some((t) => !!t && normalizarBusca(t).includes(q))
}

export interface GrupoDoPainel {
  id: CategoriaDoPainel | 'outros'
  label: string
  itens: ShapeDefinition[]
}

/** As seções de catálogo com item (Marca à parte), na ordem; "Outros" só aparece com item. */
export function gruposDoPainel(termo = '', lista: ShapeDefinition[] = SHAPES_LIBRARY): GrupoDoPainel[] {
  const visiveis = lista.filter(
    (s) => !OCULTOS_NO_PAINEL.includes(s.id) && casaBusca([s.label, ...(s.keywords ?? []), ...(Object.hasOwn(TERMOS_DO_PAINEL, s.id) ? TERMOS_DO_PAINEL[s.id] : [])], termo),
  )
  return SECOES_DO_PAINEL.filter((s): s is { id: CategoriaDoPainel | 'outros'; label: string } => s.id !== 'marca')
    .map((s) => ({ ...s, itens: visiveis.filter((v) => categoriaNoPainel(v) === s.id) }))
    .filter((g) => g.itens.length > 0)
}
