/**
 * Saneamento da entrelinha divergente entre os dois campos da camada de texto.
 *
 * Contexto: o render server-side (RenderEngine) resolve a entrelinha como
 * `textboxConfig.autoWrap.lineHeight ?? style.lineHeight ?? 1.2` — o autoWrap
 * ganha. O editor (Konva) lê só `style.lineHeight`. Enquanto
 * `buildComboLayers` gravava o valor do catálogo no style e um 1 fixo no
 * autoWrap (corrigido em 82e09c4), toda combinação aplicada saía achatada na
 * arte agendada, sem que o editor mostrasse qualquer diferença.
 *
 * Este script alinha o autoWrap ao style nas camadas já gravadas. O style é a
 * intenção: é o que o usuário viu e aprovou no editor.
 *
 * O que NÃO é tocado:
 *  - Camadas sem `style.lineHeight` — não há intenção registrada para copiar.
 *  - Camadas sem `textboxConfig.autoWrap` — sem o campo, o render já cai no
 *    style, que é o comportamento correto.
 *  - Camadas que não são de texto.
 *  - Qualquer outro campo da camada.
 *
 * ⚠️  Alterar isto muda a arte de posts AGENDADOS que ainda não renderizaram.
 * O relatório mostra quantos são antes de qualquer gravação.
 *
 * Uso:
 *   npx tsx scripts/fix-lineheight-divergente.ts                 # dry-run (padrão)
 *   npx tsx scripts/fix-lineheight-divergente.ts --apply         # grava
 *   npx tsx scripts/fix-lineheight-divergente.ts --template=57   # restringe a um template
 *   npx tsx scripts/fix-lineheight-divergente.ts --verbose       # lista cada camada
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const VERBOSE = process.argv.includes('--verbose')
const TEMPLATE_FILTER = (() => {
  const arg = process.argv.find((a) => a.startsWith('--template='))
  return arg ? Number(arg.split('=')[1]) : null
})()

type LayerLite = {
  id?: string
  name?: string
  type?: string
  style?: { lineHeight?: unknown; [k: string]: unknown } | null
  textboxConfig?: { autoWrap?: { lineHeight?: unknown; [k: string]: unknown } | null; [k: string]: unknown } | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * Page.layers ora é array, ora string JSON, ora string dupla-codificada.
 * Preserva-se a profundidade original para não mudar o formato ao gravar.
 */
function parseLayers(raw: unknown): { layers: LayerLite[]; depth: number } | null {
  let value = raw
  let depth = 0
  while (typeof value === 'string' && depth < 3) {
    try {
      value = JSON.parse(value)
      depth++
    } catch {
      return null
    }
  }
  if (!Array.isArray(value)) return null
  return { layers: value as LayerLite[], depth }
}

function encodeLayers(layers: LayerLite[], depth: number): unknown {
  let value: unknown = layers
  for (let i = 0; i < depth; i++) value = JSON.stringify(value)
  return value
}

const ehNumeroUtil = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

interface Divergencia {
  onde: string
  layerId: string
  nome: string
  style: number
  autoWrap: number
  deCombinacao: boolean
}

/**
 * Corrige as camadas divergentes de uma lista, no lugar.
 * Devolve o que foi (ou seria) alterado.
 */
function sanear(layers: LayerLite[], onde: string): Divergencia[] {
  const achados: Divergencia[] = []

  for (const layer of layers) {
    if (layer?.type !== 'text') continue

    const style = layer.style?.lineHeight
    const autoWrap = layer.textboxConfig?.autoWrap
    if (!autoWrap || typeof autoWrap !== 'object') continue

    const atual = autoWrap.lineHeight
    // Sem intenção no style não há de onde copiar; sem número no autoWrap o
    // render já cai no style e está correto
    if (!ehNumeroUtil(style) || !ehNumeroUtil(atual)) continue
    if (Math.abs(style - atual) < 1e-9) continue

    achados.push({
      onde,
      layerId: String(layer.id ?? '?'),
      nome: String(layer.name ?? layer.id ?? '?'),
      style,
      autoWrap: atual,
      deCombinacao: Boolean(layer.metadata?.presetId),
    })

    autoWrap.lineHeight = style
  }

  return achados
}

async function main() {
  console.log(
    APPLY
      ? '⚠️  MODO APPLY — o banco será alterado\n'
      : '🔍 DRY-RUN — nada será gravado (use --apply para gravar)\n',
  )

  const templates = await db.template.findMany({
    where: TEMPLATE_FILTER ? { id: TEMPLATE_FILTER } : undefined,
    select: {
      id: true,
      name: true,
      designData: true,
      Page: { select: { id: true, name: true, layers: true }, orderBy: { order: 'asc' } },
    },
    orderBy: { id: 'asc' },
  })

  const todas: Divergencia[] = []
  const paginasAlteradas: Array<{ id: string; payload: unknown; quantas: number }> = []
  const templatesAlterados: Array<{ id: number; payload: unknown; quantas: number }> = []
  const paginasIlegiveis: string[] = []
  const templatesAtingidos = new Set<number>()

  for (const template of templates) {
    // ── Páginas: é daqui que o story agendado renderiza ─────────────────────
    for (const page of template.Page) {
      const parsed = parseLayers(page.layers)
      if (!parsed) {
        paginasIlegiveis.push(`${template.id}/${page.id}`)
        continue
      }
      const achados = sanear(parsed.layers, `template ${template.id} · página "${page.name}"`)
      if (achados.length > 0) {
        todas.push(...achados)
        templatesAtingidos.add(template.id)
        paginasAlteradas.push({
          id: page.id,
          payload: encodeLayers(parsed.layers, parsed.depth),
          quantas: achados.length,
        })
      }
    }

    // ── designData do template: usado por thumbnail e pelo editor sem páginas ─
    const design = template.designData as { layers?: unknown } | null
    if (design && typeof design === 'object' && Array.isArray(design.layers)) {
      const layers = design.layers as LayerLite[]
      const achados = sanear(layers, `template ${template.id} · designData`)
      if (achados.length > 0) {
        todas.push(...achados)
        templatesAtingidos.add(template.id)
        templatesAlterados.push({
          id: template.id,
          payload: { ...design, layers },
          quantas: achados.length,
        })
      }
    }
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  console.log(`templates varridos:        ${templates.length}`)
  console.log(`camadas divergentes:       ${todas.length}`)
  console.log(`  vindas de combinação:    ${todas.filter((d) => d.deCombinacao).length}`)
  console.log(`  de outras origens:       ${todas.filter((d) => !d.deCombinacao).length}`)
  console.log(`páginas a atualizar:       ${paginasAlteradas.length}`)
  console.log(`designData a atualizar:    ${templatesAlterados.length}`)
  console.log(`templates atingidos:       ${templatesAtingidos.size}`)
  if (paginasIlegiveis.length > 0) {
    console.log(`⚠️  páginas ilegíveis (puladas): ${paginasIlegiveis.length}`)
  }

  if (todas.length > 0) {
    const pares = new Map<string, number>()
    for (const d of todas) {
      const k = `${d.autoWrap} → ${d.style}`
      pares.set(k, (pares.get(k) ?? 0) + 1)
    }
    console.log('\ndistribuição (autoWrap atual → style, que passará a valer):')
    for (const [par, n] of [...pares.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${par.padEnd(18)} ${n}`)
    }
  }

  // ── Impacto em conteúdo agendado ──────────────────────────────────────────
  const idsPaginas = paginasAlteradas.map((p) => p.id)
  if (idsPaginas.length > 0) {
    const agendados = await db.socialPost.findMany({
      where: { pageId: { in: idsPaginas }, status: { in: ['DRAFT', 'SCHEDULED'] } },
      select: { id: true, status: true, scheduledDatetime: true, pageId: true },
      orderBy: { scheduledDatetime: 'asc' },
    })
    console.log(`\nposts DRAFT/SCHEDULED nessas páginas: ${agendados.length}`)
    if (agendados.length > 0) {
      console.log('  (a arte deles muda quando renderizarem — é a correção, mas é uma mudança)')
      for (const p of agendados.slice(0, 10)) {
        console.log(`  · ${p.status.padEnd(10)} ${p.scheduledDatetime?.toISOString() ?? 'sem data'}  post ${p.id}`)
      }
      if (agendados.length > 10) console.log(`  … e mais ${agendados.length - 10}`)
    }
  }

  if (VERBOSE && todas.length > 0) {
    console.log('\ndetalhe por camada:')
    for (const d of todas) {
      const tag = d.deCombinacao ? '[combo]' : '[outra]'
      console.log(`  ${tag} ${d.onde} · "${d.nome}" (${d.layerId}): ${d.autoWrap} → ${d.style}`)
    }
  }

  if (!APPLY) {
    console.log('\n🔍 dry-run: nada foi gravado. Rode com --apply para aplicar.')
    return
  }

  if (todas.length === 0) {
    console.log('\nnada a fazer.')
    return
  }

  await db.$transaction([
    ...paginasAlteradas.map((p) => db.page.update({ where: { id: p.id }, data: { layers: p.payload as never } })),
    ...templatesAlterados.map((t) =>
      db.template.update({ where: { id: t.id }, data: { designData: t.payload as never } }),
    ),
  ])
  console.log(`\n✅ ${todas.length} camadas corrigidas em ${paginasAlteradas.length} páginas e ${templatesAlterados.length} designData.`)

  // ── Conferência: relê e confirma que não sobrou divergência ───────────────
  const recheck = await db.page.findMany({
    where: { id: { in: idsPaginas } },
    select: { id: true, layers: true },
  })
  let sobraram = 0
  for (const page of recheck) {
    const parsed = parseLayers(page.layers)
    if (!parsed) continue
    sobraram += sanear(parsed.layers, 'recheck').length
  }
  console.log(sobraram === 0 ? '✅ conferência: nenhuma divergência restante.' : `❌ conferência: ainda restam ${sobraram}.`)
}

main()
  .catch((error) => {
    console.error('Falhou:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
