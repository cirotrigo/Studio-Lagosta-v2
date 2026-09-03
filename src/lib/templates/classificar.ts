/**
 * A classificação da aba de TEMPLATES (03/09/2026, pedido do Ciro: "hoje está
 * confuso visualmente"). A seção diz QUEM criou e PARA QUÊ:
 *
 *  - assinatura   → configuração da marca (o kit do compositor);
 *  - equipe       → modelos que a equipe desenha e reusa sem pedir;
 *  - programacao  → as pastas por SEMANA (e as avulsas do mês) — o que o
 *                   compositor produz, organizado por quando publica;
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

/** Coletor automático vazio não merece card. */
export function templateVisivel(t: TemplateClassificavel): boolean {
  const secao = secaoDoTemplate(t)
  if (secao === 'arquivo' && (t._count?.Page ?? 0) === 0) return false
  return true
}

/** A chave da semana (`AAAA-MM-DD` da segunda) quando a pasta é de programação. */
export function chaveDaSemana(t: TemplateClassificavel): string | null {
  const tag = (t.tags ?? []).find((x) => x.startsWith('semana:'))
  return tag ? tag.slice('semana:'.length) : null
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
    if (ka && kb) return kb.localeCompare(ka)
    if (ka) return -1
    if (kb) return 1
    return b.name.localeCompare(a.name, 'pt-BR')
  })
  g.arquivo.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return g
}
