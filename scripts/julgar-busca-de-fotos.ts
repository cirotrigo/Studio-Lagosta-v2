/**
 * Juiz de VISÃO para a busca de fotos — SOMENTE LEITURA (07/09/2026).
 *
 * A métrica de `medir-busca-de-fotos.ts` ("todas as palavras do tema estão
 * no texto da foto") é lexical por construção e NÃO enxerga o acerto da via
 * semântica: uma foto de salão lotado atende "salão cheio" sem ter nenhuma
 * das duas palavras no catálogo. Aqui um modelo de visão olha as 5 do topo e
 * responde se cada uma ATENDE ao pedido — para a busca só com texto (F1) e
 * para a busca com embedding (F1+F2), lado a lado.
 *
 * Custa visão (~65 chamadas por braço num cliente com 13 temas compostos,
 * centavos). Nunca chama `buscarNoAcervo` (registraria sinal).
 *
 * USO
 *   npx tsx scripts/julgar-busca-de-fotos.ts --projeto 1 [--dias 30] [--todos-os-temas]
 */
import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../src/lib/db'
import { lerCatalogoDoProjeto, montarInsumosDeRanking, ultimoUsoDoCatalogo } from '../src/lib/creatives/acervo'
import { mesclarUsos } from '../src/lib/creatives/uso-de-foto'
import { calcularIdf, filtrarAcervo, gruposDoTema, palavrasDoTema, ranquearAcervo } from '../src/lib/creatives/ranquear-acervo'
import { buscarSemelhantes, embedarConsulta, normalizarPorRank, type Semelhanca } from '../src/lib/creatives/embeddings-de-foto'
import { PESOS } from '../src/lib/creatives/ranquear-acervo'

/** Varredura: PESO_SIM (peso), FRACAO_IMG (0..1, quanto da posição vem da imagem), LIMIAR (corte dos extras), FRACA (teto da lexical fraca; 99999 = sempre). */
const PESO_SIM = Number(process.env.PESO_SIM ?? PESOS.SIMILARIDADE)
const FRACAO_IMG = Number(process.env.FRACAO_IMG ?? 0.9)
const LIMIAR = Number(process.env.LIMIAR ?? 0.5)
const FRACA = Number(process.env.FRACA ?? 99999)
function porRankPonderado(sem: Map<string, Semelhanca>): Map<string, number> {
  const img = [...sem.entries()].filter(([, x]) => x.imagem !== null).sort((a, b) => b[1].imagem! - a[1].imagem!)
  const txt = [...sem.entries()].filter(([, x]) => x.texto !== null).sort((a, b) => b[1].texto! - a[1].texto!)
  const pos = (l: Array<[string, Semelhanca]>) => new Map(l.map(([id], i) => [id, l.length <= 1 ? 1 : 1 - i / (l.length - 1)]))
  const pi = pos(img), pt = pos(txt)
  const out = new Map<string, number>()
  for (const id of sem.keys()) { const v = FRACAO_IMG * (pi.get(id) ?? 0) + (1 - FRACAO_IMG) * (pt.get(id) ?? 0); if (v > 0) out.set(id, v) }
  return out
}
import { googleDriveService } from '../src/server/google-drive-service'

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const PROJETO = Number(flag('--projeto') ?? 1)
const DIAS = Number(flag('--dias') ?? 30)
const TODOS = args.includes('--todos-os-temas')
/** `--tema X` (repetível) mede temas escolhidos à mão em vez dos sinais. */
const TEMAS_MANUAIS = args.flatMap((a, i) => (a === '--tema' && args[i + 1] ? [args[i + 1]] : []))
const hojeBRT = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
const juiz = genAI.getGenerativeModel({ model: process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash', generationConfig: { temperature: 0 } })
const cacheThumb = new Map<string, Promise<Buffer>>()
function thumb(id: string): Promise<Buffer> {
  if (!cacheThumb.has(id)) cacheThumb.set(id, (async () => {
    const meta = await googleDriveService.getFileMetadata(id, 'thumbnailLink')
    const r = await fetch(String(meta.thumbnailLink).replace(/=s\d+$/, '=s400'))
    return Buffer.from(await r.arrayBuffer())
  })())
  return cacheThumb.get(id)!
}
import * as fs from 'fs'
const ARQUIVO_CACHE = `.juiz-cache-${PROJETO}.json`
const emDisco: Record<string, boolean> = fs.existsSync(ARQUIVO_CACHE) ? JSON.parse(fs.readFileSync(ARQUIVO_CACHE, 'utf8')) : {}
const cacheVeredito = new Map<string, Promise<boolean>>()
function atende(tema: string, id: string): Promise<boolean> {
  const k = `${tema}|${id}`
  if (k in emDisco) return Promise.resolve(emDisco[k])
  if (!cacheVeredito.has(k)) cacheVeredito.set(k, (async () => {
    const b = await thumb(id)
    const r = await juiz.generateContent([
      `Uma equipe de conteúdo de restaurante pediu uma foto para o tema: "${tema}". Esta foto ATENDE ao pedido? Considere o assunto principal e o clima. Responda só "sim" ou "não".`,
      { inlineData: { mimeType: 'image/jpeg', data: b.toString('base64') } },
    ])
    const v = /^\s*sim/i.test(r.response.text())
    emDisco[k] = v
    fs.writeFileSync(ARQUIVO_CACHE, JSON.stringify(emDisco))
    return v
  })())
  return cacheVeredito.get(k)!
}

async function main() {
  const { todas } = await lerCatalogoDoProjeto(PROJETO)
  const { preferencias, destaques, pilares, usos } = await montarInsumosDeRanking(PROJETO)
  const ultimoUso = new Map<string, string>()
  for (const i of todas) { const u = mesclarUsos(usos.get(i.driveFileId), ultimoUsoDoCatalogo(i)); if (u) ultimoUso.set(i.driveFileId, u) }
  const sinais = await db.learningSignal.findMany({ where: { projectId: PROJETO, tipo: 'foto', createdAt: { gte: new Date(Date.now() - DIAS * 86_400_000) } }, select: { sugerido: true } })
  const temas = TEMAS_MANUAIS.length > 0
    ? TEMAS_MANUAIS
    : [...new Set(sinais.map((s) => (s.sugerido as any)?.criterios?.theme).filter((t): t is string => typeof t === 'string' && t.trim().length > 0))]
        .filter((t) => TODOS || palavrasDoTema(t).length >= 2)
  const idf = calcularIdf(todas)

  let somaF1 = 0, somaF2 = 0, somaImg = 0, somaTxt = 0, somaRrf = 0, n = 0
  console.log(`projeto ${PROJETO} · ${temas.length} temas · juiz ${process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash'}\n`)
  for (const tema of temas) {
    const grupos = gruposDoTema(tema, pilares)
    const lexicais = filtrarAcervo(todas, { temQualidadeNoCatalogo: true, palavrasDoTema: grupos.flat(), gruposDoTema: grupos, idf })
    const base = { tema, pilares, preferencias, ultimoUso, destaques, hojeBRT: hojeBRT(), idf }
    const f1 = ranquearAcervo({ imagens: lexicais, ...base }).slice(0, 5).map((r) => r.imagem.driveFileId)
    const vetor = await embedarConsulta(tema)
    const semelhantes = vetor ? await buscarSemelhantes(PROJETO, vetor, 200) : new Map()
    const similaridade = process.env.PESO_SIM || process.env.FRACAO_IMG ? porRankPonderado(semelhantes) : normalizarPorRank(semelhantes)
    const ja = new Set(lexicais.map((i) => i.driveFileId))
    const candidatas = [...lexicais, ...(lexicais.length < FRACA ? todas.filter((i) => (similaridade.get(i.driveFileId) ?? 0) >= LIMIAR && !ja.has(i.driveFileId)) : [])]
    const f2 = ranquearAcervo({ imagens: candidatas, ...base, similaridade }, { ...PESOS, SIMILARIDADE: PESO_SIM }).slice(0, 5).map((r) => r.imagem.driveFileId)
    // Os vetores SOZINHOS, para saber se carregam sinal: por imagem e por texto.
    const porImagem = [...semelhantes.entries()].filter(([, s]) => s.imagem !== null).sort((a, b) => b[1].imagem! - a[1].imagem!).slice(0, 5).map(([id]) => id)
    const porTexto = [...semelhantes.entries()].filter(([, s]) => s.texto !== null).sort((a, b) => b[1].texto! - a[1].texto!).slice(0, 5).map(([id]) => id)
    // RRF: posição na lista lexical (ranking aprendido, sem vetor) × posição
    // na lista vetorial (média das posições imagem/texto), k = 60.
    const lexRank = new Map(ranquearAcervo({ imagens: lexicais, ...base }).map((r, i) => [r.imagem.driveFileId, i + 1]))
    const vetRank = new Map([...similaridade.entries()].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]))
    const K = 60
    const rrf = candidatas
      .map((i) => ({ id: i.driveFileId, s: 1 / (K + (lexRank.get(i.driveFileId) ?? 10_000)) + 1 / (K + (vetRank.get(i.driveFileId) ?? 10_000)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => x.id)
    const conta = async (ids: string[]) => (await Promise.all(ids.map((id) => atende(tema, id)))).filter(Boolean).length
    const [okF1, okF2, okImg, okTxt, okRrf] = await Promise.all([conta(f1), conta(f2), conta(porImagem), conta(porTexto), conta(rrf)])
    somaF1 += okF1; somaF2 += okF2; somaImg += okImg; somaTxt += okTxt; somaRrf += okRrf; n += 5
    console.log(`${tema.padEnd(46)} F1 ${okF1}/5 · F1+F2 ${okF2}/5 · RRF ${okRrf}/5 · só-imagem ${okImg}/5 · só-texto ${okTxt}/5   (lexicais ${lexicais.length})`)
  }
  const pct = (x: number) => `${Math.round((100 * x) / n)}%`
  console.log(`\nprecisão top-5 pelo juiz · F1 ${pct(somaF1)} · F1+F2 ${pct(somaF2)} · RRF ${pct(somaRrf)} · só vetor-imagem ${pct(somaImg)} · só vetor-texto ${pct(somaTxt)} (${n / 5} temas)`)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
