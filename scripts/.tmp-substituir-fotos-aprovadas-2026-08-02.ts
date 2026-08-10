/**
 * Substituição APROVADA (Ciro, 02/08/2026) das fotos de fundo das 15 páginas
 * QUEBRADAS À VISTA do manifesto lh3 de 01/08 (acao=irrecuperavel, coberta=false).
 * As 23 páginas cobertas por foto viva ficam intactas.
 *
 * Escolhas aprovadas na prancheta:
 *  - By Rock "mesa RW" geral (Começou/Último dia)  → week-2026-cmt05594 (Drive)
 *  - By Rock "mesa RW" páginas Grego Moka          → week-2026-cmt05563 (Drive)
 *  - By Rock "gnocchi 3 pratos"                    → close CMT05478 (resgate do
 *    upload da era viva no Blob, redimensionado a 1920px)
 *  - TERO "Dom 20. Brunch"                         → salao-_f3a3344 (Drive)
 *
 * Mesma mecânica do reparar-lh3-legado.ts: troca só camadas lh3, preserva a
 * codificação (dupla) do JSON, grava manifesto com layersAntes e chama
 * invalidateScheduledRenders (regra da casa ao gravar Page.layers).
 * Trava extra: a página só é alterada se a URL morta atual for EXATAMENTE a
 * registrada no levantamento de hoje (scratchpad/broken-pages.json).
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/.tmp-substituir-fotos-aprovadas-2026-08-02.ts            # dry-run
 *   npx dotenv-cli -e .env -- npx tsx scripts/.tmp-substituir-fotos-aprovadas-2026-08-02.ts --aplicar  # grava
 */
import { put } from '@vercel/blob'
import { db } from '@/lib/db'
import { resolveImageUrl } from '@/lib/creatives/persist'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import * as fs from 'fs'

const APLICAR = process.argv.includes('--aplicar')
const LH3 = /lh3\.googleusercontent\.com\/(drive-storage|.*=s\d+)/
const SCRATCH =
  '/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2--claude-worktrees-inspiring-einstein-8e78c9/d7f4e704-614b-4ce0-90ad-affc6c635dfd/scratchpad'
const RECOVERED_CMT05478 = `${SCRATCH}/candidates/recovered-cmt05478.jpg`

type Acao = { tipo: 'drive'; fileId: string } | { tipo: 'blobFile'; nome: string; arquivo: string }

interface Regra {
  nota: string
  acao: Acao
  pages: string[]
}

const REGRAS: Regra[] = [
  {
    nota: 'By Rock · mesa RW geral → cmt05594 (prato na mesa)',
    acao: { tipo: 'drive', fileId: '1ztxlg2yelx9-g6TElc35acU7-bhWaTFf' },
    pages: [
      'cmn6yx2zq0009swe3vpi3u3y7', // Desejo Pag.03 — Começou!
      'cmn6yx0zu0001swe3xrr3gaa2', // Desejo Pag.10 — Começou!
      'cmn6yx2k10007swe3hip2mpmx', // Desejo Pag.11 — Começou!
      'cmn7zi2z90007swemxu1dbfu0', // Desejo Pag.09 — Último dia
    ],
  },
  {
    nota: 'By Rock · mesa RW páginas Grego Moka → cmt05563 (sobremesa)',
    acao: { tipo: 'drive', fileId: '1igFoCsfFlpVmEjbK5j0LwMjC-IQFrhpD' },
    pages: [
      'cmn7zi2fq0001swemjrkcs8k4', // Desejo Pag.06
      'cmn7zi2p80003swemkr173qi0', // Desejo Pag.07
      'cmn7zi2ua0005swem42rpp9z2', // Desejo Pag.08
    ],
  },
  {
    nota: 'By Rock · gnocchi → close CMT05478 (resgate Blob, 1920px)',
    acao: { tipo: 'blobFile', nome: 'cmt05478', arquivo: RECOVERED_CMT05478 },
    pages: [
      'cmn7jq6kw0003swugc6u6hiuy', // Desejo Pag.12
      'cmn7s0bfy0003swckcdkbk634', // Desejo Pag.20
      'cmn7s0c5u000fswckbvpziknh', // Desejo Pag.25
      'cmn7s0cmw000nswck56p4ymrb', // Desejo Pag.29
      'cmn7s0d3r000vswck4mfstk9d', // Desejo Pag.33
      'cmn7jq6xw0009swugs2lv5cql', // Desejo Pag.38 — Último dia
      'cmn83jucg000rl7040cke93hb', // Week Feed Pag.12
    ],
  },
  {
    nota: 'TERO · Dom 20. Brunch → salao-_f3a3344 (mesma varanda)',
    acao: { tipo: 'drive', fileId: '1Oy9cJR7rhlDBgSB76nM-pBP3oQj4Dood' },
    pages: ['cmnifpt960013swnv7m9b75ut'],
  },
]

// URL morta esperada por página (levantamento de hoje) — trava de segurança
const ESPERADAS: Record<string, string> = Object.fromEntries(
  JSON.parse(fs.readFileSync(`${SCRATCH}/broken-pages.json`, 'utf8')).map((p: any) => [
    p.pageId,
    p.deadUrls[0]?.url,
  ]),
)

function parseLayers(raw: unknown): { layers: any[]; depth: number } {
  let v: unknown = raw
  let d = 0
  while (typeof v === 'string' && d < 3) {
    try {
      v = JSON.parse(v)
      d++
    } catch {
      return { layers: [], depth: -1 }
    }
  }
  return Array.isArray(v) ? { layers: v, depth: d } : { layers: [], depth: -1 }
}

function encodeLayers(layers: any[], depth: number): unknown {
  if (depth <= 0) return layers
  let out: unknown = layers
  for (let i = 0; i < depth; i++) out = JSON.stringify(out)
  return out
}

/** Neon fecha conexão ociosa na fase lenta do Drive; P1017 exige reconectar. */
async function comReconexao<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (e) {
      const msg = (e as Error).message ?? ''
      const conexao = (e as { code?: string }).code === 'P1017' || /closed the connection|Connection reset/i.test(msg)
      if (!conexao || tentativa >= 3) throw e
      console.log(`  (conexão caiu — reconectando, tentativa ${tentativa + 1})`)
      await db.$disconnect().catch(() => {})
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

async function main() {
  console.log(`modo: ${APLICAR ? 'APLICAR' : 'dry-run'}\n`)

  const vistos = new Set<string>()
  for (const r of REGRAS)
    for (const p of r.pages) {
      if (vistos.has(p)) throw new Error(`página em duas regras: ${p}`)
      if (!ESPERADAS[p]) throw new Error(`página fora do levantamento: ${p}`)
      vistos.add(p)
    }

  const paginas = new Map<string, any>()
  for (const r of REGRAS)
    for (const pageId of r.pages) {
      const page = await comReconexao(() =>
        db.page.findUnique({
          where: { id: pageId },
          select: { id: true, name: true, layers: true, Template: { select: { projectId: true, name: true } } },
        }),
      )
      if (page) paginas.set(pageId, page)
    }

  // resolve as URLs-alvo (uma por foto)
  const urlPorRegra = new Map<Regra, string>()
  for (const r of REGRAS) {
    if (r.acao.tipo === 'drive') {
      const res = await resolveImageUrl(undefined, r.acao.fileId)
      if (!res.url) throw new Error(`resolveImageUrl falhou para ${r.acao.fileId}: ${res.warning}`)
      urlPorRegra.set(r, res.url)
      console.log(`drive ${r.acao.fileId} → ${res.url}`)
    } else {
      if (!fs.existsSync(r.acao.arquivo)) throw new Error(`arquivo não encontrado: ${r.acao.arquivo}`)
      if (APLICAR) {
        const blob = await put(`drive-cache/recovered-${r.acao.nome}.jpg`, fs.readFileSync(r.acao.arquivo), {
          access: 'public',
          contentType: 'image/jpeg',
          addRandomSuffix: false,
          allowOverwrite: true,
        })
        urlPorRegra.set(r, blob.url)
        console.log(`resgate ${r.acao.nome} → ${blob.url}`)
      } else {
        urlPorRegra.set(r, `https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/recovered-${r.acao.nome}.jpg`)
        console.log(`resgate ${r.acao.nome} → (upload só no --aplicar)`)
      }
    }
  }

  const manifest: any[] = []
  let alteradas = 0
  let puladas = 0
  console.log('')
  for (const r of REGRAS) {
    for (const pageId of r.pages) {
      const page = paginas.get(pageId)
      if (!page) {
        console.log(`  [PULADA] ${pageId} não existe mais (${r.nota})`)
        puladas++
        continue
      }
      const { layers, depth } = parseLayers(page.layers)
      const lh3Layers = layers.filter((l: any) => typeof l.fileUrl === 'string' && LH3.test(l.fileUrl))
      if (lh3Layers.length === 0) {
        console.log(`  [PULADA] ${pageId} "${page.name}" já sem lh3 (${r.nota})`)
        puladas++
        continue
      }
      const inesperada = lh3Layers.find((l: any) => l.fileUrl !== ESPERADAS[pageId])
      if (inesperada) {
        console.log(`  [PULADA — URL INESPERADA] ${pageId} "${page.name}": ${String(inesperada.fileUrl).slice(0, 90)}…`)
        puladas++
        continue
      }

      const urlNova = urlPorRegra.get(r)!
      const novasLayers = layers.map((l: any) =>
        typeof l.fileUrl === 'string' && LH3.test(l.fileUrl) ? { ...l, fileUrl: urlNova } : l,
      )

      manifest.push({
        pageId,
        projeto: page.Template.projectId,
        nome: page.name,
        template: page.Template.name,
        acao: r.acao.tipo === 'drive' ? `drive:${r.acao.fileId}` : `resgate:${r.acao.nome}`,
        urlsAntigas: [...new Set(lh3Layers.map((l: any) => l.fileUrl as string))],
        urlNova,
        camadasTrocadas: lh3Layers.length,
        layersAntes: page.layers,
      })

      if (APLICAR) {
        await comReconexao(() =>
          db.page.update({ where: { id: pageId }, data: { layers: encodeLayers(novasLayers, depth) as any } }),
        )
      }
      alteradas++
      console.log(
        `  [${APLICAR ? 'ok' : 'dry'}] proj ${page.Template.projectId} ${pageId} "${page.name}" ← ${r.nota} (${lh3Layers.length} camada)`,
      )
    }
  }

  let invalidados = 0
  if (APLICAR) {
    const todas = REGRAS.flatMap((r) => r.pages)
    const r = await comReconexao(() => invalidateScheduledRenders(db, { pageIds: todas }))
    invalidados = r.invalidados
    if (r.congelados.length > 0) {
      console.warn(
        `⚠️  ${r.congelados.length} post(s) já entregues ao publicador não recebem a troca: ${r.congelados.join(', ')}`,
      )
    }
  }

  const manifestPath = `scripts/.tmp-troca-fotos-manifest-${new Date().toISOString().slice(0, 10)}${APLICAR ? '' : '-dryrun'}.json`
  fs.writeFileSync(manifestPath, JSON.stringify({ aplicado: APLICAR, data: new Date().toISOString(), paginas: manifest }, null, 2))

  console.log(`\n${alteradas} páginas ${APLICAR ? 'alteradas' : 'a alterar'} · ${puladas} puladas · posts devolvidos à fila de render: ${invalidados}`)
  console.log(`manifest: ${manifestPath}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
