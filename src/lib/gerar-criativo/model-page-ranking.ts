import {
  buildTemplateContextFromLayers,
  inferTemplateFormatFromDimensions,
  type ExtractedTemplateContext,
} from '@/lib/gerar-criativo/template-context'
import type { Layer } from '@/types/template'

interface RankableModelPage {
  id: string
  name: string
  templateName: string | null
  templateId: number
  order: number
  width: number
  height: number
  layers: Layer[]
}

interface BriefSignals {
  normalizedBrief: string
  wordCount: number
  topic: string | null
  needsDescription: boolean
  needsFooterSupport: boolean
  needsCta: boolean
  desiredDensity: 'low' | 'medium' | 'high'
  intent: 'promotional' | 'menu' | 'event' | 'informational' | 'generic'
}

export interface RankedModelPage<TPage extends RankableModelPage> {
  page: TPage
  score: number
  reasons: string[]
  label: 'Mais indicado' | 'Boa opcao' | 'Neutro'
  templateContext: ExtractedTemplateContext | null
}

const TOPIC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /almoco executivo|almoço executivo/i, label: 'Almoco executivo' },
  { pattern: /happy hour/i, label: 'Happy hour' },
  { pattern: /jantar/i, label: 'Jantar' },
  { pattern: /almoco|almoço/i, label: 'Almoco' },
  { pattern: /cafe da manha|café da manhã/i, label: 'Cafe da manha' },
  { pattern: /brunch/i, label: 'Brunch' },
  { pattern: /comunicado|aviso/i, label: 'Comunicado' },
  { pattern: /menu|cardapio|cardápio/i, label: 'Menu' },
  { pattern: /evento|agenda/i, label: 'Evento' },
]

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferBriefSignals(brief: string): BriefSignals {
  const normalizedBrief = normalizeText(brief)
  const wordCount = normalizedBrief.split(/\s+/).filter(Boolean).length
  const topic =
    TOPIC_PATTERNS.find((item) => item.pattern.test(brief))?.label
    ?? null

  const needsFooterSupport = /(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo|horario|horário|funcionamento|endereco|endereço|bairro|rua|avenida|whats|whatsapp|reserva|delivery|agenda|evento|comunicado)/i.test(brief)
  const needsCta = /(promocao|promoção|oferta|desconto|peca|peça|reserve|chame|saiba mais|garanta|hoje|aproveite|combo)/i.test(brief)
  const needsDescription = wordCount >= 8 || /(ingrediente|descricao|descrição|acompanha|molho|sabor|detalhe|prato)/i.test(brief)

  let intent: BriefSignals['intent'] = 'generic'
  if (/(menu|cardapio|cardápio|prato|hamburguer|hambúrguer|pizza|sobremesa|drink)/i.test(brief)) {
    intent = 'menu'
  } else if (/(evento|agenda|sexta|sabado|sábado|domingo|hoje|amanha|amanhã|comunicado)/i.test(brief)) {
    intent = 'event'
  } else if (/(institucional|marca|manifesto|comunicado)/i.test(brief)) {
    intent = 'informational'
  } else if (needsCta || /(promocao|promoção|oferta|desconto|combo|imperdivel|imperdível)/i.test(brief)) {
    intent = 'promotional'
  }

  const desiredDensity = wordCount <= 6
    ? 'low'
    : wordCount <= 16
      ? 'medium'
      : 'high'

  return {
    normalizedBrief,
    wordCount,
    topic,
    needsDescription,
    needsFooterSupport,
    needsCta,
    desiredDensity,
    intent,
  }
}

function buildTemplateContext(page: RankableModelPage): ExtractedTemplateContext | null {
  return buildTemplateContextFromLayers({
    templateId: String(page.templateId),
    templateName: page.templateName || page.name,
    format: inferTemplateFormatFromDimensions(page.width, page.height),
    pageId: page.id,
    pageName: page.name,
    layers: page.layers,
  })
}

function scoreModelPage(
  context: ExtractedTemplateContext | null,
  signals: BriefSignals,
): { score: number; reasons: string[] } {
  if (!context) {
    return {
      score: -10,
      reasons: ['Sem contexto de texto dinamico'],
    }
  }

  let score = 0
  const reasons: string[] = []
  const fieldKeys = new Set(context.slots.map((slot) => slot.fieldKey))
  const footerCount = context.slots.filter((slot) => slot.fieldKey.startsWith('footer_info')).length

  if (signals.topic && fieldKeys.has('pre_title')) {
    score += 3
    reasons.push(`Bom para assunto em pre-titulo`)
  }

  if (signals.needsDescription && fieldKeys.has('description')) {
    score += 3
    reasons.push('Tem area para complemento/descritivo')
  } else if (signals.needsDescription && !fieldKeys.has('description')) {
    score -= 2
  }

  if (signals.needsFooterSupport && footerCount > 0) {
    score += footerCount >= 2 ? 4 : 2
    reasons.push(footerCount >= 2 ? 'Tem rodape em duas camadas' : 'Tem rodape de apoio')
  } else if (signals.needsFooterSupport && footerCount === 0) {
    score -= 3
  }

  if (signals.needsCta && fieldKeys.has('cta')) {
    score += 3
    reasons.push('Tem CTA dedicado')
  } else if (signals.needsCta && fieldKeys.has('badge')) {
    score += 1
  }

  if (context.stats.textDensity === signals.desiredDensity) {
    score += 2
    reasons.push(`Densidade ${signals.desiredDensity} compativel`)
  } else if (
    (signals.desiredDensity === 'high' && context.stats.textDensity === 'low') ||
    (signals.desiredDensity === 'low' && context.stats.textDensity === 'high')
  ) {
    score -= 2
  }

  if (signals.intent === 'menu' && context.inferredPurpose === 'menu') {
    score += 4
    reasons.push('Estrutura boa para prato/produto')
  }

  if (signals.intent === 'event' && context.inferredPurpose === 'event') {
    score += 4
    reasons.push('Estrutura boa para agenda/comunicado')
  }

  if (signals.intent === 'promotional' && context.inferredPurpose === 'promotional') {
    score += 3
    reasons.push('Layout com perfil promocional')
  }

  if (signals.intent === 'informational' && context.inferredPurpose === 'informational') {
    score += 3
    reasons.push('Layout com perfil informativo')
  }

  if (context.visualHierarchy.layoutStyle === 'hero-title' && !signals.needsDescription) {
    score += 1
  }

  if (context.visualHierarchy.layoutStyle === 'info-dense' && (signals.needsDescription || signals.needsFooterSupport)) {
    score += 2
  }

  return {
    score,
    reasons: reasons.slice(0, 3),
  }
}

export function rankModelPagesForBrief<TPage extends RankableModelPage>(
  pages: TPage[],
  brief: string,
): RankedModelPage<TPage>[] {
  const trimmedBrief = brief.trim()
  if (!trimmedBrief) {
    return pages.map((page) => ({
      page,
      score: 0,
      reasons: [],
      label: 'Neutro',
      templateContext: null,
    }))
  }

  const signals = inferBriefSignals(trimmedBrief)

  return pages
    .map((page) => {
      const templateContext = buildTemplateContext(page)
      const result = scoreModelPage(templateContext, signals)
      const label = result.score >= 8
        ? 'Mais indicado'
        : result.score >= 4
          ? 'Boa opcao'
          : 'Neutro'

      return {
        page,
        score: result.score,
        reasons: result.reasons,
        label,
        templateContext,
      } satisfies RankedModelPage<TPage>
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      return (left.page.order ?? 0) - (right.page.order ?? 0)
    })
}
