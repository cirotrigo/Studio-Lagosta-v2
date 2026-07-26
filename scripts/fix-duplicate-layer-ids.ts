/**
 * Saneamento de ids de layers duplicados entre páginas do mesmo template.
 *
 * Contexto: até o fix da rota de duplicação (PR #22), duplicar uma página
 * copiava as layers mantendo os ids originais. Páginas distintas passavam a
 * ter layers com o mesmo id e, como os overrides por layerId assumem id único
 * por página, edições e overrides acertavam a layer errada.
 *
 * O que este script NÃO toca:
 *  - Slots semânticos ("titulo", "subtitulo", "logo", "rodape-1", ...). Repetir
 *    esses ids entre páginas é intencional — é assim que o agendamento preenche
 *    conteúdo por página.
 *  - Qualquer id que apareça como chave de slotValues em algum post.
 *  - A primeira página onde o id apareceu (a original mantém seus ids; só as
 *    cópias, criadas depois, são renomeadas).
 *
 * Uso:
 *   npx tsx scripts/fix-duplicate-layer-ids.ts                 # dry-run (padrão)
 *   npx tsx scripts/fix-duplicate-layer-ids.ts --apply         # grava
 *   npx tsx scripts/fix-duplicate-layer-ids.ts --template=57   # restringe a um template
 *   npx tsx scripts/fix-duplicate-layer-ids.ts --verbose       # lista cada id alterado
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
  parentId?: string | null
  metadata?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Nomes de slot conhecidos — nunca renomeados, mesmo que o formato engane */
const SLOT_ALLOWLIST = new Set([
  'titulo',
  'subtitulo',
  'pre-titulo',
  'rodape',
  'rodape-1',
  'rodape-2',
  'badge',
  'cta',
  'logo',
  'background',
  'bg',
  'grad-top',
  'grad-bottom',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CUID_RE = /^c[a-z0-9]{20,}$/i
const OPAQUE_PREFIX_RE = /^(layer|text|image|logo|gradient|element|shape|video)[-_][a-z0-9]{6,}$/i

/**
 * Um id é "opaco" (gerado por máquina, seguro para renomear) quando casa com
 * UUID/cuid/prefixo+hash. Slugs legíveis são tratados como slots semânticos.
 */
function isOpaqueId(id: string): boolean {
  if (SLOT_ALLOWLIST.has(id.toLowerCase())) return false
  return UUID_RE.test(id) || CUID_RE.test(id) || OPAQUE_PREFIX_RE.test(id)
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

async function main() {
  console.log(APPLY ? '⚠️  MODO APPLY — o banco será alterado\n' : '🔍 DRY-RUN — nada será gravado (use --apply para gravar)\n')

  // ── Proteção: todo id usado como chave de slotValues fica intocado ──────────
  const posts = await db.socialPost.findMany({ select: { slotValues: true } })
  const protectedBySlot = new Set<string>()
  for (const post of posts) {
    const slots = post.slotValues as Record<string, unknown> | null
    if (slots && typeof slots === 'object' && !Array.isArray(slots)) {
      for (const key of Object.keys(slots)) protectedBySlot.add(key)
    }
  }
  console.log(`ids protegidos por aparecerem em slotValues: ${protectedBySlot.size}`)

  const templates = await db.template.findMany({
    where: TEMPLATE_FILTER ? { id: TEMPLATE_FILTER } : undefined,
    select: {
      id: true,
      name: true,
      Page: {
        select: { id: true, name: true, layers: true, order: true, createdAt: true },
        // A página mais antiga é a canônica: mantém os ids; as cópias mudam
        orderBy: [{ createdAt: 'asc' }, { order: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: { id: 'asc' },
  })

  let templatesAlterados = 0
  let paginasAlteradas = 0
  let idsRenomeados = 0
  let gruposRenomeados = 0
  const ignoradosPorProtecao = new Set<string>()
  const paginasIlegiveis: string[] = []
  const encodingDepths = new Map<number, number>()

  for (const template of templates) {
    const firstSeenLayer = new Map<string, string>() // layerId -> pageId
    const firstSeenGroup = new Map<string, string>() // groupId -> pageId
    const updates: Array<{ pageId: string; pageName: string; payload: unknown; renamed: string[]; groups: number }> = []

    for (const page of template.Page) {
      const parsed = parseLayers(page.layers)
      if (!parsed) {
        paginasIlegiveis.push(`${template.id}/${page.id}`)
        continue
      }
      const { layers, depth } = parsed
      encodingDepths.set(depth, (encodingDepths.get(depth) ?? 0) + 1)

      // 1ª passada: decidir quais ids desta página precisam mudar
      const idMap = new Map<string, string>()
      const groupMap = new Map<string, string>()

      for (const layer of layers) {
        const id = layer?.id
        if (!id) continue

        const seenIn = firstSeenLayer.get(id)
        if (seenIn === undefined) {
          firstSeenLayer.set(id, page.id)
        } else if (seenIn !== page.id && !idMap.has(id)) {
          // Repetido em página anterior → candidato a renomear
          if (!isOpaqueId(id)) continue // slot semântico: intencional
          if (protectedBySlot.has(id)) {
            ignoradosPorProtecao.add(id)
            continue
          }
          idMap.set(id, crypto.randomUUID())
        }

        // metadata.groupId (agrupamento de combinações) segue a mesma regra
        const groupId = layer.metadata?.groupId
        if (typeof groupId === 'string' && groupId) {
          const gSeen = firstSeenGroup.get(groupId)
          if (gSeen === undefined) {
            firstSeenGroup.set(groupId, page.id)
          } else if (gSeen !== page.id && !groupMap.has(groupId)) {
            groupMap.set(groupId, `combo-${crypto.randomUUID()}`)
          }
        }
      }

      if (idMap.size === 0 && groupMap.size === 0) continue

      // 2ª passada: reescrever ids, parentId e groupId
      const nextLayers = layers.map((layer) => {
        const next: LayerLite = { ...layer }
        if (layer.id && idMap.has(layer.id)) next.id = idMap.get(layer.id)!
        // parentId referencia outra layer da MESMA página
        if (typeof layer.parentId === 'string' && idMap.has(layer.parentId)) {
          next.parentId = idMap.get(layer.parentId)!
        }
        const groupId = layer.metadata?.groupId
        if (typeof groupId === 'string' && groupMap.has(groupId)) {
          next.metadata = { ...layer.metadata, groupId: groupMap.get(groupId)! }
        }
        return next
      })

      updates.push({
        pageId: page.id,
        pageName: page.name,
        payload: encodeLayers(nextLayers, depth),
        renamed: [...idMap.keys()],
        groups: groupMap.size,
      })
    }

    if (updates.length === 0) continue

    templatesAlterados++
    paginasAlteradas += updates.length
    idsRenomeados += updates.reduce((sum, u) => sum + u.renamed.length, 0)
    gruposRenomeados += updates.reduce((sum, u) => sum + u.groups, 0)

    console.log(
      `\n#${template.id} ${template.name} — ${updates.length} página(s), ` +
        `${updates.reduce((s, u) => s + u.renamed.length, 0)} id(s)`,
    )
    for (const u of updates) {
      console.log(`   ${u.pageName.padEnd(12)} ${u.renamed.length} id(s)${u.groups ? ` + ${u.groups} grupo(s)` : ''}`)
      if (VERBOSE) for (const id of u.renamed) console.log(`      ${id}`)
    }

    if (APPLY) {
      await db.$transaction(
        updates.map((u) => db.page.update({ where: { id: u.pageId }, data: { layers: u.payload as never } })),
      )
      console.log(`   ✅ gravado`)
    }
  }

  console.log('\n═══ RESUMO ═══')
  console.log(`templates analisados:        ${templates.length}`)
  console.log(`templates a alterar:         ${templatesAlterados}`)
  console.log(`páginas a alterar:           ${paginasAlteradas}`)
  console.log(`ids de layer a renomear:     ${idsRenomeados}`)
  console.log(`groupIds a renomear:         ${gruposRenomeados}`)
  console.log(`ids ignorados por proteção:  ${ignoradosPorProtecao.size}`)
  console.log(`formatos de layers (profundidade → páginas): ${[...encodingDepths.entries()].map(([d, n]) => `${d}→${n}`).join(', ')}`)
  if (paginasIlegiveis.length) {
    console.log(`⚠️  páginas com layers ilegíveis (ignoradas): ${paginasIlegiveis.length}`)
    for (const p of paginasIlegiveis.slice(0, 5)) console.log(`     ${p}`)
  }

  if (APPLY) {
    // Verificação pós-gravação: nenhum id opaco pode seguir repetido
    const check = await db.template.findMany({
      where: TEMPLATE_FILTER ? { id: TEMPLATE_FILTER } : undefined,
      select: { id: true, name: true, Page: { select: { id: true, layers: true } } },
    })
    let restantes = 0
    for (const t of check) {
      const seen = new Map<string, string>()
      for (const p of t.Page) {
        const parsed = parseLayers(p.layers)
        if (!parsed) continue
        for (const l of parsed.layers) {
          if (!l?.id || !isOpaqueId(l.id) || protectedBySlot.has(l.id)) continue
          const seenIn = seen.get(l.id)
          if (seenIn && seenIn !== p.id) restantes++
          else if (!seenIn) seen.set(l.id, p.id)
        }
      }
    }
    console.log(`\n🔎 verificação pós-gravação — ids opacos ainda repetidos: ${restantes}`)
    if (restantes > 0) console.log('   ⚠️  revise antes de considerar concluído')
  } else {
    console.log('\nNada foi gravado. Para aplicar:')
    console.log('  npx tsx scripts/fix-duplicate-layer-ids.ts --template=<id> --apply   (comece por um)')
    console.log('  npx tsx scripts/fix-duplicate-layer-ids.ts --apply                   (tudo)')
  }

  await db.$disconnect()
}

main().catch(async (error) => {
  console.error('ERRO:', error instanceof Error ? error.message : error)
  await db.$disconnect()
  process.exit(1)
})
