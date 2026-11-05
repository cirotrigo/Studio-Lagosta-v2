/**
 * Conversão das camadas `rich-text` em `text` + `destaques` (T3 do plano
 * "destaque por marcação", 05/11/2026). SÓ LEITURA por padrão.
 *
 *   npx tsx scripts/converter-rich-text.ts                 # relatório por projeto, nada é gravado
 *   npx tsx scripts/converter-rich-text.ts --projeto Real  # só os projetos cujo nome contém "Real"
 *   npx tsx scripts/converter-rich-text.ts --aplicar       # GRAVA as conversíveis (ver abaixo)
 *
 * Cada camada rich-text sai CONVERSÍVEL (um só estilo de destaque, sombra
 * igual em todo o conteúdo) ou NÃO CONVERSÍVEL (dois estilos, tamanho,
 * espaçamento ou contorno por trecho, sem trecho) — a regra mora em
 * `src/lib/compositor/converter-rich-text.ts` e tem teste.
 *
 * `--aplicar` grava a página inteira pela mesma função do PATCH de camada do
 * editor (`gravarCamadasComRevisao`: compare-and-set em `updatedAt` + revisão do
 * contrato da copy, autor `sistema`) e, como manda a regra do repositório para
 * quem grava `Page.layers`, chama `invalidateScheduledRenders` E
 * `pedirRecomposicaoDaArteCongelada`. As camadas são lidas por `lerCamadas`
 * (o JSON de `Page.layers` pode vir duplamente codificado) e reclassificadas
 * sobre a página RELIDA a cada volta.
 *
 * 🔴 O `.env` aponta para PRODUÇÃO. Rode o relatório, leia, e só então decida
 * o `--aplicar` — nunca antes de os PRs do render (#297 e #298) estarem na
 * main: sem eles a camada `text` com `destaques` sai SEM destaque no PNG.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { lerCamadas } from '@/lib/posts/page-layers'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'
import { gravarCamadasComRevisao } from '@/lib/copy-autoral/persistir'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'
import { classificarRichText, converterCamadasDaPagina } from '@/lib/compositor/converter-rich-text'
import type { Layer } from '@/types/template'

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const iProjeto = args.indexOf('--projeto')
const FILTRO_PROJETO = iProjeto >= 0 ? (args[iProjeto + 1] ?? '').toLowerCase() : ''

interface LinhaDoRelatorio {
  projeto: string
  paginaId: string
  pagina: string
  template: string
  modelo: boolean
  camadaId: string
  camada: string
  texto: string
}

async function main() {
  // Pré-filtro no SQL: a coluna é Json e só uma fração das páginas tem rich-text. O texto do JSON
  // (inclusive o duplamente codificado) contém "rich-text" de qualquer forma.
  const ids = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Page" WHERE "layers"::text LIKE '%rich-text%'`
  const paginas = await db.page.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    select: { id: true, name: true, isTemplate: true, layers: true, Template: { select: { name: true, Project: { select: { name: true } } } } },
    orderBy: { id: 'asc' },
  })

  const porProjeto = new Map<string, { conversiveis: LinhaDoRelatorio[]; naoConversiveis: Array<LinhaDoRelatorio & { motivo: string }> }>()
  const paraAplicar: Array<{ id: string; projeto: string; n: number }> = []
  let ilegiveis = 0

  for (const p of paginas) {
    const projeto = p.Template.Project.name
    if (FILTRO_PROJETO && !projeto.toLowerCase().includes(FILTRO_PROJETO)) continue
    const lidas = lerCamadas(p.layers)
    if (!lidas.legivel) {
      ilegiveis++
      continue
    }
    const grupo = porProjeto.get(projeto) ?? { conversiveis: [], naoConversiveis: [] }
    porProjeto.set(projeto, grupo)
    let nConversiveis = 0
    for (const l of lidas.camadas as unknown as Layer[]) {
      if (l.type !== 'rich-text') continue
      const c = classificarRichText(l)
      const base = {
        projeto,
        paginaId: p.id,
        pagina: p.name,
        template: p.Template.name,
        modelo: p.isTemplate,
        camadaId: l.id,
        camada: String(l.name ?? ''),
      }
      if (c.veredito === 'conversivel') {
        grupo.conversiveis.push({ ...base, texto: c.conteudoMarcado })
        nConversiveis++
      } else {
        grupo.naoConversiveis.push({ ...base, texto: String(l.content ?? ''), motivo: c.detalhe ? `${c.motivo} (${c.detalhe})` : c.motivo })
      }
    }
    if (nConversiveis > 0) paraAplicar.push({ id: p.id, projeto, n: nConversiveis })
  }

  // ─── Relatório ───────────────────────────────────────────────────────────
  let totalC = 0
  let totalN = 0
  for (const [projeto, g] of [...porProjeto.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (g.conversiveis.length + g.naoConversiveis.length === 0) continue
    console.log(`\n=== ${projeto} — ${g.conversiveis.length} conversível(is), ${g.naoConversiveis.length} NÃO conversível(is) ===`)
    for (const r of g.conversiveis) {
      console.log(`  ✔ página ${r.paginaId} "${r.pagina}" · template "${r.template}"${r.modelo ? ' · MODELO' : ''} · camada ${r.camadaId} "${r.camada}"\n      → ${JSON.stringify(r.texto)}`)
    }
    for (const r of g.naoConversiveis) {
      console.log(`  ✘ página ${r.paginaId} "${r.pagina}" · template "${r.template}"${r.modelo ? ' · MODELO' : ''} · camada ${r.camadaId} "${r.camada}" — ${r.motivo}`)
    }
    totalC += g.conversiveis.length
    totalN += g.naoConversiveis.length
  }

  console.log('\n──── RESUMO POR PROJETO (conversíveis / não conversíveis) ────')
  for (const [projeto, g] of [...porProjeto.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (g.conversiveis.length + g.naoConversiveis.length === 0) continue
    console.log(`${projeto}: ${g.conversiveis.length} / ${g.naoConversiveis.length}`)
  }
  console.log(`TOTAL: ${totalC} conversíveis, ${totalN} não conversíveis · ${paraAplicar.length} página(s) a gravar${ilegiveis ? ` · ${ilegiveis} página(s) com camadas ilegíveis (puladas)` : ''}`)

  if (!APLICAR) {
    console.log('\nModo leitura: nada foi gravado. Para gravar: --aplicar (só depois de #297 e #298 na main).')
    return
  }

  // ─── Gravação ────────────────────────────────────────────────────────────
  console.log('\n--aplicar: gravando…')
  let paginasGravadas = 0
  for (const alvo of paraAplicar) {
    let convertidas: string[] = []
    const { invalidados } = await db.$transaction(
      async (tx) => {
        const g = await gravarCamadasComRevisao(tx, {
          pageId: alvo.id,
          quem: { autor: 'sistema', motivo: 'conversão rich-text → destaque por marcação', superficie: 'script' },
          reconciliarComAnteriores: true,
          camadas: (base) => {
            const lidas = lerCamadas(base.layers)
            if (!lidas.legivel) throw new Error('camadas ilegíveis')
            const r = converterCamadasDaPagina(lidas.camadas as unknown as Layer[])
            convertidas = r.convertidas
            return JSON.stringify(canonicalizeLayersForPersistence(r.camadas))
          },
        })
        if (!g) throw new Error('página sumiu')
        const r = convertidas.length > 0 ? await invalidateScheduledRenders(tx, { pageIds: [alvo.id] }) : { invalidados: 0 }
        return { invalidados: r.invalidados }
      },
      { maxWait: 10_000, timeout: 15_000 },
    )
    if (convertidas.length > 0) {
      const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
      await pedirRecomposicaoDaArteCongelada([alvo.id])
      paginasGravadas++
    }
    console.log(`  ${alvo.projeto} · página ${alvo.id}: ${convertidas.length} camada(s) convertida(s), ${invalidados} render(s) invalidado(s)`)
  }
  console.log(`Pronto: ${paginasGravadas} página(s) gravada(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
