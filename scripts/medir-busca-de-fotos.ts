/**
 * Medição da busca de fotos do acervo — SOMENTE LEITURA.
 *
 * Responde, por cliente, as três perguntas do diagnóstico de 07/09/2026
 * (docs/PLANO-2026-09-07-BUSCA-DE-FOTOS.md):
 *   1. O catálogo está descrito? (fotos, sem descrição, sem tags, md5)
 *   2. As buscas fecham? (desfechos dos LearningSignal de foto × PhotoUsage)
 *   3. A busca acerta? Para cada tema REAL já pesquisado no cliente, refaz o
 *      ranking de produção e conta quantas das 5 do topo têm TODAS as
 *      palavras do tema em descrição+tags+bestFor+pasta.
 *
 * 🔴 NUNCA chama `buscarNoAcervo` — ela registra um `LearningSignal` por
 * busca. Usa `lerCatalogoDoProjeto` + `montarInsumosDeRanking` + os módulos
 * puros, como `validar-ranking-do-acervo.ts`.
 *
 * USO
 *   npx tsx scripts/medir-busca-de-fotos.ts                 # carteira inteira
 *   npx tsx scripts/medir-busca-de-fotos.ts --projeto 1     # um cliente
 *   npx tsx scripts/medir-busca-de-fotos.ts --projeto 1 --dias 60 --detalhe
 *   npx tsx scripts/medir-busca-de-fotos.ts --projeto 1 --sem-vetor   # só a F1, sem o embedding
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import { lerCatalogoDoProjeto, montarInsumosDeRanking, ultimoUsoDoCatalogo } from '../src/lib/creatives/acervo'
import { mesclarUsos } from '../src/lib/creatives/uso-de-foto'
import { sinonimosDe } from '../src/lib/creatives/sinonimos-do-acervo'
import { buscarSemelhantes, embedarConsulta, normalizarPorRank } from '../src/lib/creatives/embeddings-de-foto'
import { calcularIdf, filtrarAcervo, gruposDoTema, palavrasDoTema, ranquearAcervo } from '../src/lib/creatives/ranquear-acervo'

const args = process.argv.slice(2)
const flag = (nome: string) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : undefined }
const PROJETO = flag('--projeto') ? Number(flag('--projeto')) : null
const DIAS = Number(flag('--dias') ?? 30)
const DETALHE = args.includes('--detalhe')
/** `--sem-vetor` mede só a F1 (a linha de base lexical). */
const SEM_VETOR = args.includes('--sem-vetor')

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const hojeBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

async function medirProjeto(projectId: number, nome: string) {
  console.log(`\n══ ${projectId} · ${nome}`)
  let todas: any[]
  try { ({ todas } = await lerCatalogoDoProjeto(projectId) as any) } catch { console.log('   sem catálogo'); return }

  const semDesc = todas.filter((i) => !i.description).length
  const semTags = todas.filter((i) => !i.tags?.length).length
  const comMd5 = todas.filter((i) => i.md5).length
  console.log(`   catálogo: ${todas.length} fotos · sem descrição ${semDesc} · sem tags ${semTags} · com md5 ${comMd5}`)

  const desde = new Date(Date.now() - DIAS * 86_400_000)
  const sinais = await db.learningSignal.findMany({ where: { projectId, tipo: 'foto', createdAt: { gte: desde } }, select: { desfecho: true, sugerido: true } })
  const porDesfecho = new Map<string, number>()
  for (const s of sinais) porDesfecho.set(s.desfecho ?? 'pendente', (porDesfecho.get(s.desfecho ?? 'pendente') ?? 0) + 1)
  const usos = await db.photoUsage.count({ where: { projectId, usedAt: { gte: desde } } })
  const expiradas = porDesfecho.get('expirada') ?? 0
  const fechadasComDecisao = sinais.length - expiradas - (porDesfecho.get('pendente') ?? 0)
  console.log(`   buscas (${DIAS}d): ${sinais.length} · ${[...porDesfecho.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')} · usos de foto ${usos}`)
  console.log(`   fechamento com decisão: ${sinais.length ? Math.round((100 * fechadasComDecisao) / sinais.length) : 0}%`)

  const temas = [...new Set(sinais.map((s) => (s.sugerido as any)?.criterios?.theme).filter((t): t is string => typeof t === 'string' && t.trim().length > 0))]
  if (temas.length === 0) { console.log('   nenhum tema pesquisado no período'); return }

  const { preferencias, destaques, pilares, usos: usosPorFoto } = await montarInsumosDeRanking(projectId)
  const ultimoUso = new Map<string, string>()
  for (const i of todas) { const u = mesclarUsos(usosPorFoto.get(i.driveFileId), ultimoUsoDoCatalogo(i)); if (u) ultimoUso.set(i.driveFileId, u) }
  const texto = (e: any) => norm([e.description, ...(e.tags ?? []), ...(e.bestFor ?? []), e.folder].join(' '))

  // O MESMO caminho de `buscarNoAcervo` (F1): grupos com maioria e sinônimos, idf do acervo inteiro.
  const idf = calcularIdf(todas)
  let simplesOk = 0, simplesN = 0, compostoOk = 0, compostoN = 0
  for (const tema of temas) {
    const grupos = gruposDoTema(tema, pilares)
    const lexicais = filtrarAcervo(todas, { temQualidadeNoCatalogo: true, palavrasDoTema: grupos.flat(), gruposDoTema: grupos, idf })
    // F2: o mesmo pelotão semântico de `buscarNoAcervo` (sem registrar sinal).
    let similaridade: Map<string, number> | undefined
    let filtradas = lexicais
    if (!SEM_VETOR) {
      const vetor = await embedarConsulta(tema)
      const semelhantes = vetor ? await buscarSemelhantes(projectId, vetor, 200) : new Map()
      if (semelhantes.size > 0) {
        similaridade = normalizarPorRank(semelhantes)
        const ja = new Set(lexicais.map((i) => i.driveFileId))
        filtradas = [...lexicais, ...todas.filter((i) => (similaridade!.get(i.driveFileId) ?? 0) >= 0.6 && !ja.has(i.driveFileId))]
      }
    }
    const r = ranquearAcervo({ imagens: filtradas, tema, pilares, preferencias, ultimoUso, destaques, hojeBRT: hojeBRT(), idf, similaridade })
    const top = r.slice(0, 5).map((f) => f.imagem as any)
    const base = palavrasDoTema(tema).map(norm)
    const presente = (t: string, p: string) => t.includes(p) || sinonimosDe(p).some((s) => t.includes(norm(s)))
    const completas = top.filter((e) => base.every((p) => presente(texto(e), p))).length
    const composto = base.length >= 2
    if (composto) { compostoOk += completas; compostoN += 5 } else { simplesOk += completas; simplesN += 5 }
    if (DETALHE) console.log(`   ${composto ? 'composto' : 'simples '} ${tema.padEnd(44)} passam ${String(filtradas.length).padStart(5)} · top-5 completas ${completas}/5`)
  }
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '—')
  console.log(`   precisão top-5 · tema simples ${pct(simplesOk, simplesN)} (${simplesN / 5} temas) · tema composto ${pct(compostoOk, compostoN)} (${compostoN / 5} temas)`)
}

async function main() {
  const projetos = await db.project.findMany({ where: PROJETO ? { id: PROJETO } : {}, select: { id: true, name: true }, orderBy: { id: 'asc' } })
  for (const p of projetos) await medirProjeto(p.id, p.name)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
