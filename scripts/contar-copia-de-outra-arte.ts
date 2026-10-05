/**
 * PR6-F01 — quantos posts em PRODUÇÃO carregam cópia textual que a agenda
 * afirma pela mídia SEM evidência de que ela seja daquela arte.
 *
 * SOMENTE LEITURA. Nenhum update, nenhum delete, nenhuma migration: só os
 * SELECTs abaixo. É o molde dos outros medidores da casa (`medir-melhoria.ts`,
 * `medir-busca-de-fotos.ts`), que leem produção para contar.
 *
 * O estado que o achado descreve: post `NOT_NEEDED` (a página virou vínculo
 * histórico, ou nunca existiu), UMA mídia, cópia MARCADA (`_copiaDaPagina`)
 * gravada antes do conserto da escrita, e a arte casada pela URL sendo
 * RE-RENDERIZADA sem o marcador da copy visual regravada. Nesse estado
 * `midiaEDeOutraArte` devolve falso pela exceção de R13 (re-render é a MESMA
 * peça refeita) e as duas portas de `_copiaDaPagina` devolvem o texto antigo.
 *
 * A classificação usa os MESMOS predicados exportados que `ver-agenda` usa
 * (`arteDosFieldValues`, `paginaDoPostEHistorica`, `arteEntregue`) — medir com
 * uma cópia das regras mediria outra coisa.
 *
 * Uso:
 *   npx tsx scripts/contar-copia-de-outra-arte.ts
 *   npx tsx scripts/contar-copia-de-outra-arte.ts --ids   # lista os ids do balde F01
 */
import { db } from '../src/lib/db'
import { arteDosFieldValues, arteEntregue, paginaDoPostEHistorica } from '../src/lib/posts/textos-da-peca'

interface Candidato {
  id: string
  projectId: number
  status: string
  renderStatus: string
  mediaUrls: string[]
  slotValues: unknown
  pageId: string | null
  laterPostId: string | null
  createdAt: Date
  updatedAt: Date
}

const objeto = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** A cópia MARCADA pela escrita (`comoCopiaDaPagina`), com pelo menos um texto. */
function copiaMarcadaComTexto(slotValues: unknown): boolean {
  const o = objeto(slotValues)
  if (!o || o._copiaDaPagina !== true) return false
  return Object.entries(o).some(([k, v]) => !k.startsWith('_') && texto(v))
}

/** Copy PRÓPRIA do post (sem a marca), com pelo menos um texto. */
function copyPropriaComTexto(slotValues: unknown): boolean {
  const o = objeto(slotValues)
  if (!o || o._copiaDaPagina === true) return false
  return Object.entries(o).some(([k, v]) => !k.startsWith('_') && texto(v))
}

function texto(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0
  const o = objeto(v)
  return !!o && typeof o.content === 'string' && o.content.trim().length > 0
}

function faixa(datas: Date[]): string {
  if (datas.length === 0) return '—'
  const ord = [...datas].sort((a, b) => a.getTime() - b.getTime())
  return `${ord[0].toISOString().slice(0, 10)} a ${ord[ord.length - 1].toISOString().slice(0, 10)}`
}

function conta<T>(itens: T[], chave: (t: T) => string): Record<string, number> {
  const r: Record<string, number> = {}
  for (const i of itens) r[chave(i)] = (r[chave(i)] ?? 0) + 1
  return r
}

async function main() {
  const endpoint = (process.env.DATABASE_URL ?? '').match(/@([^.]+)/)?.[1] ?? '(ilegível)'
  console.log(`banco: ${endpoint} — SOMENTE LEITURA\n`)

  // 1. Os candidatos: NOT_NEEDED, uma mídia, cópia textual de verdade.
  //    🔴 `"slotValues" IS NOT NULL` conta as ~3.800 linhas com o JSON `null` (armadilha registrada
  //    na F2): o corte de verdade é `::text <> 'null'`.
  const candidatos = await db.$queryRaw<Candidato[]>`
    SELECT p.id, p."projectId", p.status::text AS status, p."renderStatus"::text AS "renderStatus", p."mediaUrls", p."slotValues",
           p."pageId", p."laterPostId", p."createdAt", p."updatedAt"
    FROM "SocialPost" p
    WHERE p."renderStatus" = 'NOT_NEEDED'
      AND p."slotValues" IS NOT NULL
      AND p."slotValues"::text <> 'null'
      AND array_length(p."mediaUrls", 1) = 1
  `
  console.log(`candidatos (NOT_NEEDED + 1 mídia + slotValues real): ${candidatos.length}`)

  // 2. A arte casada pela URL — a regra de `artes-do-post.ts`: a mais recente por (projeto, URL).
  const urls = [...new Set(candidatos.map((c) => c.mediaUrls[0]).filter(Boolean))]
  const porUrl = new Map<string, { fieldValues: unknown; createdAt: Date }>()
  for (let i = 0; i < urls.length; i += 500) {
    const lote = await db.generation.findMany({
      where: { resultUrl: { in: urls.slice(i, i + 500) } },
      select: { projectId: true, resultUrl: true, fieldValues: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })
    for (const g of lote) if (g.resultUrl) porUrl.set(`${g.projectId}|${g.resultUrl}`, { fieldValues: g.fieldValues, createdAt: g.createdAt })
  }
  console.log(`mídias distintas: ${urls.length} — com arte casada: ${porUrl.size}\n`)

  // 3. Classificação, com os predicados do próprio leitor.
  //    A pergunta é SEMPRE a mesma: a agenda afirma esta cópia pela mídia atual, e com que prova?
  const BALDES = [
    'F01 · marcada + arte RE-RENDERIZADA sem marcador — a leitura AFIRMA sem evidência',
    'marcada + SEM arte casada (R12: sem testemunha; a cópia é o registro da entrega)',
    'marcada + arte íntegra (R53/R54 comparam: igual afirma, divergente declara)',
    'própria + arte RE-RENDERIZADA (R42 já invalida)',
    'própria + SEM arte casada (R12)',
    'própria + arte íntegra (R53/R54 comparam)',
    'fora do escopo: página PRÓPRIA ativa (a mídia sai do render dela)',
    'fora do escopo: slotValues sem texto nenhum',
  ] as const
  const baldes: Record<string, Candidato[]> = Object.fromEntries(BALDES.map((b) => [b, [] as Candidato[]]))

  for (const c of candidatos) {
    const bruta = porUrl.get(`${c.projectId}|${c.mediaUrls[0]}`)
    const arte = bruta ? arteDosFieldValues(bruta.fieldValues) : undefined
    const semPaginaPropria = !c.pageId || paginaDoPostEHistorica(c as never, arte)
    const marcada = copiaMarcadaComTexto(c.slotValues)
    const propria = copyPropriaComTexto(c.slotValues)

    const balde = !marcada && !propria
      ? 'fora do escopo: slotValues sem texto nenhum'
      : !semPaginaPropria
        ? 'fora do escopo: página PRÓPRIA ativa (a mídia sai do render dela)'
        : !arte
          ? marcada
            ? 'marcada + SEM arte casada (R12: sem testemunha; a cópia é o registro da entrega)'
            : 'própria + SEM arte casada (R12)'
          : arte.reRenderizada && !arte.copyVisualRegravada
            ? marcada
              ? 'F01 · marcada + arte RE-RENDERIZADA sem marcador — a leitura AFIRMA sem evidência'
              : 'própria + arte RE-RENDERIZADA (R42 já invalida)'
            : marcada
              ? 'marcada + arte íntegra (R53/R54 comparam: igual afirma, divergente declara)'
              : 'própria + arte íntegra (R53/R54 comparam)'
    baldes[balde].push(c)
  }

  for (const nome of BALDES) {
    const itens = baldes[nome]
    console.log(`${itens.length.toString().padStart(5)}  ${nome}`)
    if (itens.length > 0 && !nome.startsWith('fora do escopo')) {
      console.log(`        por situação: ${JSON.stringify(conta(itens, (i) => (arteEntregue(i as never) ? `${i.status}(entregue)` : i.status)))}`)
      console.log(`        por projeto:  ${JSON.stringify(conta(itens, (i) => String(i.projectId)))}`)
      console.log(`        criados em:   ${faixa(itens.map((i) => i.createdAt))} · última escrita: ${faixa(itens.map((i) => i.updatedAt))}`)
    }
  }

  console.log(`  candidatos com pageId: ${candidatos.filter((c) => c.pageId).length} · sem pageId: ${candidatos.filter((c) => !c.pageId).length}`)
  console.log(`  candidatos com cópia MARCADA: ${candidatos.filter((c) => copiaMarcadaComTexto(c.slotValues)).length} · com copy própria: ${candidatos.filter((c) => copyPropriaComTexto(c.slotValues)).length}`)

  const f01 = baldes[BALDES[0]]
  if (process.argv.includes('--ids') && f01.length > 0) console.log(`\nids do balde F01:\n${f01.map((c) => `  ${c.id} (projeto ${c.projectId}, ${c.status})`).join('\n')}`)

  // 4. A contra-prova, pelo OUTRO lado: F01 exige arte RE-RENDERIZADA. Contar quantas existem
  //    (e quem as usa) fecha a evidência sem depender da classificação acima.
  const [artes] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Generation"
    WHERE "fieldValues"->'recomposicao'->>'estado' = 're-renderizada'`
  const [semMarcador] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "Generation"
    WHERE "fieldValues"->'recomposicao'->>'estado' = 're-renderizada'
      AND COALESCE("fieldValues"->'recomposicao'->>'copyVisualRegravada', '') <> 'true'`
  const posts = await db.$queryRaw<{ id: string; status: string; midias: number; marcada: boolean }[]>`
    SELECT DISTINCT p.id, p.status::text AS status, coalesce(array_length(p."mediaUrls", 1), 0) AS midias,
           coalesce(p."slotValues"->>'_copiaDaPagina', '') = 'true' AS marcada
    FROM "SocialPost" p
    JOIN "Generation" g ON g."resultUrl" = ANY(p."mediaUrls") AND g."projectId" = p."projectId"
    WHERE g."fieldValues"->'recomposicao'->>'estado' = 're-renderizada'`
  console.log(`\ncontra-prova — artes RE-RENDERIZADAS em toda a base: ${artes.n} (sem copyVisualRegravada: ${semMarcador.n})`)
  console.log(`  posts que as usam como mídia: ${posts.length}`)
  for (const p of posts) console.log(`    ${p.id} · ${p.status} · ${p.midias} mídia(s) · cópia marcada: ${p.marcada}`)

  console.log(`\nF01 em produção: ${f01.length} linha(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
