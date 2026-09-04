/**
 * A classificação da aba de TEMPLATES (03/09/2026, pedido do Ciro: "hoje está
 * confuso visualmente"). A seção diz QUEM criou e PARA QUÊ:
 *
 *  - assinatura   → configuração da marca (o kit do compositor);
 *  - equipe       → modelos que a equipe desenha e reusa sem pedir;
 *  - programacao  → as pastas por SEMANA e por FORMATO (e as avulsas do mês) —
 *                   o que o compositor produz, organizado por quando publica.
 *                   Desde 04/09/2026 são DUAS por semana (Stories e Feed), e
 *                   por isso a ordenação precisa de um desempate estável: sem
 *                   ele as duas pastas da mesma semana trocariam de lugar
 *                   entre um render e outro;
 *  - arquivo      → coletores automáticos antigos, famílias geradas por tema,
 *                   templates de sistema. Recolhido por padrão; nada é
 *                   excluído porque posts agendados apontam para essas páginas.
 *
 * Módulo puro: a UI e o teste importam sem env.
 */

export type SecaoDeTemplate = 'assinatura' | 'equipe' | 'programacao' | 'arquivo'

export interface TemplateClassificavel {
  id: number
  name: string
  category?: string | null
  tags?: string[] | null
  createdAt?: string | Date
  _count?: { Page?: number } | null
}

const COLETORES = /^(Arte Rápida|Arte IA|Arte Enviada|Arte Composta|Arte Rapida)(\s*—.*)?$/i
const TAG_FAMILIA_GERADA = 'lote-tema-2026-08'

export function secaoDoTemplate(t: TemplateClassificavel): SecaoDeTemplate {
  const cat = (t.category ?? '').toLowerCase()
  const tags = (t.tags ?? []).map((x) => x.toLowerCase())
  if (cat === 'assinatura' || tags.includes('assinatura')) return 'assinatura'
  if (cat === 'programacao' || cat === 'avulsas') return 'programacao'
  if (cat.startsWith('__system') || tags.includes('system')) return 'arquivo'
  if (cat === 'arte-rapida' || COLETORES.test(t.name)) return 'arquivo'
  if (tags.includes(TAG_FAMILIA_GERADA)) return 'arquivo'
  return 'equipe'
}

/**
 * Pasta automática vazia não merece card.
 *
 * Vale para o ARQUIVO (coletores antigos) e, desde 04/09/2026, também para a
 * PROGRAMAÇÃO: ao separar story de feed, a pasta mista antiga fica sem página
 * nenhuma e viraria um card fantasma ao lado das duas novas. Nada é excluído —
 * apagar o template arrastaria as Generations (FK em cascata) e deixaria os
 * posts sem `templateId`; ela só deixa de aparecer.
 */
export function templateVisivel(t: TemplateClassificavel): boolean {
  const secao = secaoDoTemplate(t)
  if ((secao === 'arquivo' || secao === 'programacao') && (t._count?.Page ?? 0) === 0) return false
  return true
}

/**
 * A chave da semana (`AAAA-MM-DD` da segunda) quando a pasta é de programação.
 *
 * Casa a tag SEM formato (`semana:2026-09-07`) e também a com formato
 * (`semana:2026-09-07:story`) — as duas convivem nas tags, e depender da
 * ORDEM do array para escolher uma seria frágil.
 */
const TAG_DA_SEMANA = /^semana:(\d{4}-\d{2}-\d{2})(?::.+)?$/

export function chaveDaSemana(t: TemplateClassificavel): string | null {
  for (const tag of t.tags ?? []) {
    const m = TAG_DA_SEMANA.exec(tag)
    if (m) return m[1]
  }
  return null
}

/** Ordem em que os formatos aparecem na aba; pasta antiga (sem formato) por último. */
const ORDEM_DO_FORMATO: Record<string, number> = { story: 0, feed: 1, quadrado: 2 }

/** O formato da pasta, lido do sufixo da tag-chave (`semana:…:story`, `mes:…:feed`). */
export function formatoDaPasta(t: TemplateClassificavel): string | null {
  for (const tag of t.tags ?? []) {
    const m = /^(?:semana:\d{4}-\d{2}-\d{2}|mes:\d{4}-\d{2}):(story|feed|quadrado)$/.exec(tag)
    if (m) return m[1]
  }
  return null
}

export interface TemplatesAgrupados<T extends TemplateClassificavel> {
  assinatura: T[]
  equipe: T[]
  programacao: T[]
  arquivo: T[]
}

/** Agrupa e ORDENA: programação da semana mais recente para a mais antiga (avulsas por último), equipe por nome, arquivo por data. */
export function agruparTemplates<T extends TemplateClassificavel>(templates: T[]): TemplatesAgrupados<T> {
  const g: TemplatesAgrupados<T> = { assinatura: [], equipe: [], programacao: [], arquivo: [] }
  for (const t of templates) {
    if (!templateVisivel(t)) continue
    g[secaoDoTemplate(t)].push(t)
  }
  g.equipe.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  g.programacao.sort((a, b) => {
    const ka = chaveDaSemana(a)
    const kb = chaveDaSemana(b)
    if (ka && kb && ka !== kb) return kb.localeCompare(ka)
    if (ka && !kb) return -1
    if (kb && !ka) return 1
    // Mesma semana (ou nenhuma): Stories antes de Feed, sempre na mesma ordem.
    const fa = ORDEM_DO_FORMATO[formatoDaPasta(a) ?? ''] ?? 9
    const fb = ORDEM_DO_FORMATO[formatoDaPasta(b) ?? ''] ?? 9
    if (fa !== fb) return fa - fb
    return b.name.localeCompare(a.name, 'pt-BR')
  })
  g.arquivo.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return g
}
