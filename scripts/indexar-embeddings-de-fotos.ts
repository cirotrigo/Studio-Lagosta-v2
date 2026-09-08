/**
 * Indexação dos vetores das fotos do acervo (F2, 07/09/2026).
 *
 * Para cada foto do `_image-catalog.json` de um cliente que ainda não tem
 * linha em `PhotoEmbedding` na versão atual (ou cujo md5 mudou), baixa a
 * miniatura `=s400` do Drive, gera o vetor da IMAGEM e o vetor do TEXTO
 * (descrição+tags+bestFor+prato+pasta) no `gemini-embedding-2` e grava.
 *
 * Dry-run por padrão: imprime quantas fotos faltam e a conta. Só `--confirmar`
 * chama a API (≈ US$ 0,00012 por imagem na chave paga; o texto é desprezível).
 * Roda de fora da Vercel (Mac): 12,7k fotos são ~2,1k chamadas de imagem e
 * ~25k idas ao Drive — meia hora com `--concorrencia 4`.
 *
 * O dia a dia é do cron `reconciliar-catalogos`, que indexa a foto NOVA no
 * mesmo passo em que a cataloga. Este script é a carga inicial e o reparo.
 *
 * USO
 *   npx tsx scripts/indexar-embeddings-de-fotos.ts --projeto 1
 *   npx tsx scripts/indexar-embeddings-de-fotos.ts --todos --confirmar
 *   npx tsx scripts/indexar-embeddings-de-fotos.ts --projeto 1 --confirmar --limite 200 --concorrencia 4
 *   npx tsx scripts/indexar-embeddings-de-fotos.ts --todos --confirmar --so-md5   # só o hash, pelo files.get
 */
import 'dotenv/config'
import { db } from '../src/lib/db'
import { lerCatalogoDoProjeto } from '../src/lib/creatives/acervo'
import { indexarFotosDoCatalogo } from '../src/lib/creatives/indexar-fotos'
import { fotosIndexadas, gravarMd5DeFotos, reembedarTextos, textoDaFotoParaEmbedding, VERSAO_DO_EMBEDDING } from '../src/lib/creatives/embeddings-de-foto'
import { googleDriveService } from '../src/server/google-drive-service'

const args = process.argv.slice(2)
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const PROJETO = flag('--projeto') ? Number(flag('--projeto')) : null
const TODOS = args.includes('--todos')
const CONFIRMAR = args.includes('--confirmar')
const LIMITE = flag('--limite') ? Number(flag('--limite')) : Number.POSITIVE_INFINITY
const CONCORRENCIA = flag('--concorrencia') ? Number(flag('--concorrencia')) : 4
/** `--so-md5`: só preenche o hash das linhas sem md5, pelo files.get do Drive (o listing não o devolve). */
const SO_MD5 = args.includes('--so-md5')
const CUSTO_POR_IMAGEM_USD = 0.00012

async function main() {
  if (!PROJETO && !TODOS) {
    console.log('Informe --projeto <id> ou --todos. Dry-run por padrão; --confirmar gasta.')
    process.exit(1)
  }
  const projetos = await db.project.findMany({ where: PROJETO ? { id: PROJETO } : {}, select: { id: true, name: true }, orderBy: { id: 'asc' } })
  console.log(`versão do embedding: ${VERSAO_DO_EMBEDDING} · ${CONFIRMAR ? 'GASTANDO' : 'dry-run'}`)
  let totalFaltam = 0
  for (const p of projetos) {
    let todas
    try { ({ todas } = await lerCatalogoDoProjeto(p.id)) } catch { console.log(`\n${p.id} · ${p.name}: sem catálogo`); continue }
    const indexadas = await fotosIndexadas(p.id)
    if (SO_MD5) {
      const semMd5 = [...indexadas.entries()].filter(([, v]) => !v.md5).map(([id]) => id)
      console.log(`\n${p.id} · ${p.name}: ${semMd5.length} linha(s) sem md5`)
      if (!CONFIRMAR || semMd5.length === 0) continue
      let feitas = 0, prox = 0
      const worker = async () => {
        while (prox < semMd5.length) {
          const lote = semMd5.slice(prox, prox + 10); prox += 10
          const linhas: Array<{ driveFileId: string; md5: string }> = []
          await Promise.all(lote.map(async (id) => {
            try { const m = await googleDriveService.getFileMetadata(id, 'md5Checksum'); if (typeof m.md5Checksum === 'string' && m.md5Checksum) linhas.push({ driveFileId: id, md5: m.md5Checksum }) } catch { /* fica para a próxima */ }
          }))
          feitas += await gravarMd5DeFotos(p.id, linhas)
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, 8) }, worker))
      console.log(`   md5 gravados: ${feitas}`)
      continue
    }
    const faltam = todas.filter((f) => {
      const i = indexadas.get(f.driveFileId)
      return !i || !i.temImagem || !i.temTexto || (f.md5 && i.md5 && f.md5 !== i.md5)
    })
    // Descrição mudou (reenriquecimento v3)? Só o vetor de TEXTO é refeito —
    // sem Drive, sem chamada de imagem, custo desprezível.
    const faltamIds = new Set(faltam.map((f) => f.driveFileId))
    const textoMudou = todas
      .filter((f) => !faltamIds.has(f.driveFileId))
      .map((f) => ({ driveFileId: f.driveFileId, texto: textoDaFotoParaEmbedding(f) }))
      .filter((l) => (indexadas.get(l.driveFileId)?.texto ?? '') !== l.texto)
    totalFaltam += faltam.length
    console.log(`\n${p.id} · ${p.name}: ${todas.length} no catálogo · ${indexadas.size} indexadas · ${faltam.length} faltam (≈ US$ ${(faltam.length * CUSTO_POR_IMAGEM_USD).toFixed(2)}) · ${textoMudou.length} com texto novo`)
    if (!CONFIRMAR) continue
    if (textoMudou.length > 0) {
      let feitas = 0
      for (let k = 0; k < textoMudou.length; k += 20) {
        try { feitas += await reembedarTextos(p.id, textoMudou.slice(k, k + 20)) } catch (e) { console.warn('   reembed falhou:', String((e as Error)?.message ?? e)) }
      }
      console.log(`   texto reembedado: ${feitas}`)
    }
    if (faltam.length === 0) continue
    const alvo = faltam.slice(0, Number.isFinite(LIMITE) ? LIMITE : undefined)
    const inicio = Date.now()
    const r = await indexarFotosDoCatalogo({
      projectId: p.id,
      entradas: alvo,
      concorrencia: CONCORRENCIA,
      aoProgredir: (feitas, total) => { if (feitas % 60 === 0 || feitas === total) process.stdout.write(`   ${feitas}/${total}\r`) },
    })
    console.log(`   gravadas ${r.gravadas} · falhas ${r.falhas} · ${Math.round((Date.now() - inicio) / 1000)}s`)
  }
  console.log(`\ntotal que falta na carteira: ${totalFaltam} (≈ US$ ${(totalFaltam * CUSTO_POR_IMAGEM_USD).toFixed(2)})`)
  await db.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
