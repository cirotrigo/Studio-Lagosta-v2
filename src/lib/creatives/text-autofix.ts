/**
 * Autocorreção geométrica de texto — pós-layout, pré-render.
 *
 * Quando a validação (text-geometry) acusa overflow ou colisão, tenta
 * resolver SEM tocar no conteúdo, na ordem:
 *
 *  1. reduzir fontSize em passos de 4% (piso: 80% do original E nunca abaixo
 *     de 24px na base 1080);
 *  2. reduzir line-height até 0.92 (limite de headline do DNA);
 *  3. expandir a caixa da camada quando os glifos não colidem com ninguém e
 *     ficam dentro da área segura (só "legaliza" a caixa — glifo não se move);
 *  4. nada resolveu → BLOQUEIO estruturado. Nunca renderiza torto, nunca
 *     trunca.
 *
 * Proibições absolutas (regra de negócio — copy aprovada não se reescreve):
 * nunca alterar/encurtar conteúdo, remover camada, mover camada, trocar
 * família/cor/alinhamento, nem "resolver" removendo quebra de linha.
 *
 * Guardas: máximo 3 passadas; cada passada precisa REDUZIR estritamente a
 * métrica de overflow (senão aborta); idempotente (arte já corrigida → issues
 * zero → no-op); determinístico e sem IA — não confundir com melhorar-arte,
 * que é generativa, paga, e NUNCA é chamada daqui.
 */
import { db } from '@/lib/db'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { CANVAS_MARGIN } from '@/lib/canvas-margin'
import {
  checkTextGeometry,
  measureTextLayers,
  TEXT_DRAW_PADDING,
  type MeasureTextBox,
  type TextGeometryIssue,
} from '@/lib/creatives/text-geometry'
import { createServerTextBoxMeasurer } from '@/lib/creatives/server-text-measurer'

const FONT_STEP_RATIO = 0.04
const FONT_FLOOR_RATIO = 0.8
const MIN_FONT_PX_BASE_1080 = 24
const LINE_HEIGHT_FLOOR = 0.92
const MAX_PASSES = 3

export interface AutofixAjuste {
  camada: string
  layerId: string
  propriedade: 'fontSize' | 'lineHeight' | 'boxHeight'
  de: number
  para: number
  motivo: string
}

export interface AutofixReport {
  /** Havia problema geométrico a corrigir? */
  necessaria: boolean
  aplicada: boolean
  iteracoes: number
  ajustes: AutofixAjuste[]
  /** Problemas registrados mas não corrigíveis sem mover camada (área segura). */
  pendencias: string[]
  /** Preenchidos quando a escada não resolveu. */
  bloqueio?: string
  camadasEnvolvidas?: string[]
  /** true quando a flag do projeto/template desligou a correção. */
  desligada?: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function bloqueantes(issues: TextGeometryIssue[]): TextGeometryIssue[] {
  return issues.filter((i) => i.tipo === 'overflow' || i.tipo === 'colisao')
}

function metrica(issues: TextGeometryIssue[]): number {
  return bloqueantes(issues).reduce((sum, i) => sum + i.px, 0)
}

/**
 * Camadas a encolher: overflow aponta a própria camada; colisão prefere a
 * camada cujo conteúdo mudou neste preenchimento e, sem essa pista, a de CIMA
 * (o crescimento é para baixo — quem invade é quem cresceu).
 */
function ofensoras(
  issues: TextGeometryIssue[],
  layers: Layer[],
  changedIds: Set<string>,
): Set<string> {
  const porId = new Map(layers.map((l) => [l.id, l]))
  const alvo = new Set<string>()
  for (const issue of bloqueantes(issues)) {
    if (issue.tipo === 'overflow') {
      alvo.add(issue.layerIds[0])
      continue
    }
    const [idA, idB] = issue.layerIds
    const mudouA = changedIds.has(idA)
    const mudouB = changedIds.has(idB)
    if (mudouA !== mudouB) {
      alvo.add(mudouA ? idA : idB)
      continue
    }
    const yA = porId.get(idA)?.position?.y ?? 0
    const yB = porId.get(idB)?.position?.y ?? 0
    alvo.add(yA <= yB ? idA : idB)
  }
  return alvo
}

function patchLayer(layers: Layer[], layerId: string, patch: (l: Layer) => Layer): Layer[] {
  return layers.map((l) => (l.id === layerId ? patch(l) : l))
}

function setFontSize(layers: Layer[], layerId: string, fontSize: number): Layer[] {
  return patchLayer(layers, layerId, (l) => ({
    ...l,
    style: { ...l.style, fontSize },
  }))
}

/** A entrelinha mora em DOIS campos e o render prefere autoWrap.lineHeight — escrever sempre nos dois. */
function setLineHeight(layers: Layer[], layerId: string, lineHeight: number): Layer[] {
  return patchLayer(layers, layerId, (l) => ({
    ...l,
    style: { ...l.style, lineHeight },
    textboxConfig: l.textboxConfig
      ? {
          ...l.textboxConfig,
          autoWrap: { ...l.textboxConfig.autoWrap, lineHeight },
        }
      : l.textboxConfig,
  }))
}

export interface AutofixResult {
  layers: Layer[]
  report: AutofixReport
  /** Issues que sobraram (para avisos — inclui área segura). */
  issues: TextGeometryIssue[]
}

export function autofixTextGeometry(
  inputLayers: Layer[],
  canvas: { width: number; height: number },
  measure: MeasureTextBox,
  opts?: { changedLayerIds?: Iterable<string> },
): AutofixResult {
  const changedIds = new Set(opts?.changedLayerIds ?? [])
  const original = new Map(
    inputLayers
      .filter((l) => l.type === 'text')
      .map((l) => [l.id, { fontSize: l.style?.fontSize ?? 16, name: l.name ?? l.id }]),
  )
  const minFont = MIN_FONT_PX_BASE_1080 * (canvas.width / 1080)

  let layers = inputLayers
  let { issues } = checkTextGeometry(layers, canvas, measure)
  const pendencias = issues
    .filter((i) => i.tipo === 'fora-da-area-segura')
    .map((i) => i.detalhe)

  if (bloqueantes(issues).length === 0) {
    return {
      layers,
      issues,
      report: { necessaria: false, aplicada: false, iteracoes: 0, ajustes: [], pendencias },
    }
  }

  const ajustes: AutofixAjuste[] = []
  let passes = 0
  let metricaAnterior = metrica(issues)

  while (passes < MAX_PASSES && bloqueantes(issues).length > 0) {
    passes++
    const motivo = bloqueantes(issues)
      .map((i) => i.detalhe)
      .join('; ')
    const alvos = ofensoras(issues, layers, changedIds)

    for (const layerId of alvos) {
      const orig = original.get(layerId)
      if (!orig) continue

      // Degrau 1: fontSize em passos de 4% do ORIGINAL, até o piso.
      const piso = Math.max(round2(orig.fontSize * FONT_FLOOR_RATIO), round2(minFont))
      let atual = layers.find((l) => l.id === layerId)?.style?.fontSize ?? orig.fontSize
      while (atual > piso && bloqueantes(checkTextGeometry(layers, canvas, measure).issues).some((i) => i.layerIds.includes(layerId))) {
        const proximo = Math.max(piso, round2(atual - orig.fontSize * FONT_STEP_RATIO))
        if (proximo >= atual) break
        layers = setFontSize(layers, layerId, proximo)
        ajustes.push({
          camada: orig.name,
          layerId,
          propriedade: 'fontSize',
          de: atual,
          para: proximo,
          motivo,
        })
        atual = proximo
      }

      // Degrau 2: line-height até o piso 0.92.
      const layer = layers.find((l) => l.id === layerId)
      const lhAtual =
        layer?.textboxConfig?.autoWrap?.lineHeight ?? layer?.style?.lineHeight ?? 1.2
      const aindaFalha = bloqueantes(checkTextGeometry(layers, canvas, measure).issues).some(
        (i) => i.layerIds.includes(layerId),
      )
      if (aindaFalha && lhAtual > LINE_HEIGHT_FLOOR) {
        layers = setLineHeight(layers, layerId, LINE_HEIGHT_FLOOR)
        ajustes.push({
          camada: orig.name,
          layerId,
          propriedade: 'lineHeight',
          de: lhAtual,
          para: LINE_HEIGHT_FLOOR,
          motivo,
        })
      }

      // Degrau 3: expandir a caixa quando só falta a caixa "oficializar" o
      // texto — glifo não colide com ninguém e cabe na área segura.
      const check3 = checkTextGeometry(layers, canvas, measure)
      const overflowProprio = check3.issues.find(
        (i) => i.tipo === 'overflow' && i.layerIds[0] === layerId,
      )
      const temColisao = check3.issues.some(
        (i) => i.tipo === 'colisao' && i.layerIds.includes(layerId),
      )
      if (overflowProprio && !temColisao) {
        const m = measureTextLayers(layers, measure).find((x) => x.layerId === layerId)
        const limiteBase = canvas.height - CANVAS_MARGIN.bottom * (canvas.width / 1080)
        if (m && m.glyphBottom <= limiteBase && m.realHeight > m.box.height) {
          layers = patchLayer(layers, layerId, (l) => ({
            ...l,
            size: { width: l.size?.width ?? 0, height: m.realHeight },
          }))
          ajustes.push({
            camada: orig.name,
            layerId,
            propriedade: 'boxHeight',
            de: Math.round(m.box.height),
            para: m.realHeight,
            motivo: `${motivo} (caixa expandida — há espaço livre)`,
          })
        }
      }
    }

    issues = checkTextGeometry(layers, canvas, measure).issues
    const metricaAtual = metrica(issues)
    if (metricaAtual >= metricaAnterior && bloqueantes(issues).length > 0) {
      // Passada sem redução estrita: parar já evita loop infinito.
      break
    }
    metricaAnterior = metricaAtual
  }

  const restantes = bloqueantes(issues)
  if (restantes.length > 0) {
    const camadasEnvolvidas = Array.from(new Set(restantes.flatMap((i) => i.camadas)))
    return {
      // Bloqueio devolve as camadas ORIGINAIS: arte pela metade não interessa.
      layers: inputLayers,
      issues,
      report: {
        necessaria: true,
        aplicada: false,
        iteracoes: passes,
        ajustes: [],
        pendencias,
        bloqueio:
          `${restantes.map((i) => i.detalhe).join('; ')}. ` +
          `Nem no piso de fonte (80% do original) o texto coube sem sobrepor. ` +
          `Encurte o texto, tire uma linha ou use outra camada/modelo.`,
        camadasEnvolvidas,
      },
    }
  }

  return {
    layers,
    issues,
    report: {
      necessaria: true,
      aplicada: true,
      iteracoes: passes,
      ajustes,
      pendencias,
    },
  }
}

// ─── Orquestrador do pipeline (flags + erro estruturado) ─────────────

export interface AplicarAutofixParams {
  projectId: number
  layers: Layer[]
  canvas: { width: number; height: number }
  changedLayerIds?: Iterable<string>
  /** Template FONTE (o modelo), quando houver — é a flag dele que vale. */
  sourceTemplateId?: number
}

export interface AplicarAutofixResult {
  layers: Layer[]
  autocorrecao: AutofixReport
  avisos: string[]
}

/**
 * Ponto único chamado pelos três geradores (arte de modelo, arte livre e
 * ajuste) ANTES de persistir/renderizar. As fontes do projeto precisam estar
 * registradas. Flag desligada (projeto OU template) → não corrige, mas AVISA;
 * ligada e incorrigível → CreativeError TEXTO_NAO_CABE com o diagnóstico —
 * nunca renderiza torto em silêncio.
 */
export async function aplicarAutofixOuFalhar(
  params: AplicarAutofixParams,
): Promise<AplicarAutofixResult> {
  const [project, template] = await Promise.all([
    db.project.findUnique({
      where: { id: params.projectId },
      select: { textAutofixEnabled: true },
    }),
    params.sourceTemplateId
      ? db.template.findUnique({
          where: { id: params.sourceTemplateId },
          select: { textAutofixEnabled: true },
        })
      : Promise.resolve(null),
  ])
  const habilitada =
    (project?.textAutofixEnabled ?? true) && (template?.textAutofixEnabled ?? true)

  const measure = await createServerTextBoxMeasurer()

  if (!habilitada) {
    const { issues } = checkTextGeometry(params.layers, params.canvas, measure)
    return {
      layers: params.layers,
      autocorrecao: {
        necessaria: bloqueantes(issues).length > 0,
        aplicada: false,
        desligada: true,
        iteracoes: 0,
        ajustes: [],
        pendencias: issues
          .filter((i) => i.tipo === 'fora-da-area-segura')
          .map((i) => i.detalhe),
      },
      avisos: bloqueantes(issues).map((i) => i.detalhe),
    }
  }

  const result = autofixTextGeometry(params.layers, params.canvas, measure, {
    changedLayerIds: params.changedLayerIds,
  })

  // Telemetria: template que dispara correção toda hora tem caixa mal
  // dimensionada — o conserto certo é no template, não a cada render.
  if (result.report.necessaria) {
    console.log(
      '[text-autofix]',
      JSON.stringify({
        projectId: params.projectId,
        sourceTemplateId: params.sourceTemplateId ?? null,
        aplicada: result.report.aplicada,
        iteracoes: result.report.iteracoes,
        ajustes: result.report.ajustes.map((a) => ({
          camada: a.camada,
          prop: a.propriedade,
          de: a.de,
          para: a.para,
        })),
        bloqueio: result.report.bloqueio ?? null,
      }),
    )
  }

  if (result.report.bloqueio) {
    throw new CreativeError('TEXTO_NAO_CABE', result.report.bloqueio, 422, {
      autocorrecao: result.report,
      camadasEnvolvidas: result.report.camadasEnvolvidas,
    })
  }

  return {
    layers: result.layers,
    autocorrecao: result.report,
    avisos: result.report.pendencias,
  }
}
