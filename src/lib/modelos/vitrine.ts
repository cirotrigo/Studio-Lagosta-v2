/**
 * A regra da vitrine de Modelos (S5, 06/11/2026): chips de formato e de tema, tags técnicas escondidas, busca e
 * ordem. Tudo no navegador, sobre o que `GET /api/projects/[id]/modelos` já devolve — o maior cliente tem 24
 * modelos, a casa inteira 135. Módulo puro: a UI e o teste importam sem env.
 */

export type FormatoDoModelo = 'story' | 'feed' | 'quadrado'

/** O mínimo que a vitrine lê de um modelo (`ModeloDoProjeto` cabe aqui). */
export interface ModeloDaVitrine {
  id: string
  name: string
  tags: string[]
  templateName: string
  formato: FormatoDoModelo
  usedCount: number
  lastUsedAt: string | null
}

export const FORMATOS: FormatoDoModelo[] = ['story', 'feed', 'quadrado']

export const ROTULO_DO_FORMATO: Record<FormatoDoModelo, string> = {
  story: 'Story',
  feed: 'Feed',
  quadrado: 'Quadrado',
}

/** Proporção da miniatura pelo formato (largura / altura). */
export const PROPORCAO_DO_FORMATO: Record<FormatoDoModelo, string> = {
  story: '9 / 16',
  feed: '4 / 5',
  quadrado: '1 / 1',
}

/**
 * Tags que o sistema grava para ele mesmo e que não são tema: formato, a pasta da Assinatura, marcas do compositor e
 * da cópia, o rodízio, as famílias geradas e as chaves de semana e arquétipo. `template` é o marcador legado do modo
 * Arte Rápida (`project-tags-config.tsx`).
 */
const TAGS_TECNICAS = new Set([
  'story',
  'feed',
  'quadrado',
  'assinatura',
  'layout',
  'compositor',
  'de-modelo',
  'fora-do-rodizio',
  'template',
])
const PREFIXOS_TECNICOS = ['lote-tema-', 'semana:', 'arquetipo:']

export function ehTagTecnica(tag: string): boolean {
  const t = tag.trim().toLowerCase()
  return TAGS_TECNICAS.has(t) || PREFIXOS_TECNICOS.some((p) => t.startsWith(p))
}

/** As tags de tema do modelo, na ordem em que foram gravadas. */
export function tagsDeTema(modelo: Pick<ModeloDaVitrine, 'tags'>): string[] {
  return (modelo.tags ?? []).filter((t) => t && !ehTagTecnica(t))
}

/** Os modelos da Assinatura são as variantes do compositor: selo, sem Duplicar e sem Tirar. */
export function ehDaAssinatura(modelo: Pick<ModeloDaVitrine, 'tags' | 'templateName'>): boolean {
  if ((modelo.templateName ?? '').trim().toLowerCase() === 'assinatura') return true
  return (modelo.tags ?? []).some((t) => t.trim().toLowerCase() === 'assinatura')
}

/** Só os formatos que existem nos modelos, na ordem fixa Story, Feed, Quadrado. */
export function formatosPresentes(modelos: ModeloDaVitrine[]): FormatoDoModelo[] {
  const presentes = new Set(modelos.map((m) => m.formato))
  return FORMATOS.filter((f) => presentes.has(f))
}

/**
 * Os chips de tema: as tags de tema presentes nos modelos. Os pilares aprovados do cliente vêm primeiro, na ordem
 * deles (é o vocabulário de tema da casa, `docs/regras/modelos.md`); o resto em ordem alfabética.
 */
export function chipsDeTema(modelos: ModeloDaVitrine[], pilares: string[] = []): string[] {
  const presentes = new Set<string>()
  for (const m of modelos) for (const t of tagsDeTema(m)) presentes.add(t)
  const dosPilares = pilares.filter((p, i) => presentes.has(p) && pilares.indexOf(p) === i)
  const jaFoi = new Set(dosPilares)
  const resto = [...presentes].filter((t) => !jaFoi.has(t)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return [...dosPilares, ...resto]
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

export interface FiltroDaVitrine {
  busca?: string
  formato?: FormatoDoModelo | null
  tema?: string | null
}

/**
 * Filtra por busca (nome e tags, sem acento e sem caixa), formato e tema, e ordena por "usados recentemente" como o
 * Canva: `lastUsedAt` mais recente primeiro, nunca usados por último, empate pelo nome.
 */
export function filtrarEOrdenar<T extends ModeloDaVitrine>(modelos: T[], filtro: FiltroDaVitrine = {}): T[] {
  const termo = normalizar(filtro.busca ?? '')
  const lista = modelos.filter((m) => {
    if (filtro.formato && m.formato !== filtro.formato) return false
    if (filtro.tema && !tagsDeTema(m).includes(filtro.tema)) return false
    if (!termo) return true
    return normalizar(m.name).includes(termo) || (m.tags ?? []).some((t) => normalizar(t).includes(termo))
  })
  const quando = (m: T) => (m.lastUsedAt ? Date.parse(m.lastUsedAt) || 0 : null)
  return lista.sort((a, b) => {
    const qa = quando(a)
    const qb = quando(b)
    if (qa !== qb) {
      if (qa === null) return 1
      if (qb === null) return -1
      return qb - qa
    }
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

/** "usado 12×" / "nunca usado". */
export function rotuloDeUso(usedCount: number): string {
  return usedCount > 0 ? `usado ${usedCount}×` : 'nunca usado'
}
