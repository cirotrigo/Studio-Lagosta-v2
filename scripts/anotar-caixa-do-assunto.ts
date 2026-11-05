/**
 * anotar-caixa-do-assunto.ts
 *
 * Backfill da caixa do assunto (F2b): grava `caixaDoAssunto` + `caixaAnalisadaEm` nas entradas do `_image-catalog.json`
 * que ainda não têm o carimbo. Uma chamada de visão por foto. Escreve no JSON do Drive, com backup local antes do
 * primeiro save, e só pelo save preservador (`escreverCatalogoPreservandoCaixas`).
 *
 * Uso:
 *   npx tsx scripts/anotar-caixa-do-assunto.ts --projeto "Empório" --dry-run --limit 4
 *   npx tsx scripts/anotar-caixa-do-assunto.ts --projeto 7 --drive-file-id 1McWb…
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../src/lib/db'
import { anotarCaixas, type DocumentoDoCatalogo } from '../src/lib/creatives/anotar-caixa-do-assunto'
import { montarPromptDaCaixa } from '../src/lib/creatives/catalogo-de-fotos'
import { baixarMiniatura, escreverCatalogoPreservandoCaixas } from '../src/lib/creatives/reconciliar-catalogo'
import { googleDriveService } from '../src/server/google-drive-service'

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const projeto = argumento('projeto')
  if (!projeto) throw new Error('informe --projeto "Nome do cliente" (ou o id)')
  const limit = argumento('limit') ? Number(argumento('limit')) : undefined
  const driveFileId = argumento('drive-file-id')
  const dryRun = process.argv.includes('--dry-run')

  const project = /^\d+$/.test(projeto)
    ? await db.project.findUnique({ where: { id: Number(projeto) } })
    : await db.project.findFirst({ where: { name: { contains: projeto, mode: 'insensitive' } } })
  if (!project) throw new Error(`cliente não encontrado (${projeto})`)
  const pasta = project.googleDriveImagesFolderId ?? project.googleDriveFolderId
  if (!pasta) throw new Error(`"${project.name}" não tem pasta de imagens`)
  const catalogoId = await googleDriveService.findFileInFolder(pasta, '_image-catalog.json')
  if (!catalogoId) throw new Error(`"${project.name}" não tem catálogo de imagens`)

  const model = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!).getGenerativeModel({
    model: process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  })

  console.log(`${project.name}${dryRun ? ' (--dry-run: nada será salvo no Drive)' : ''}`)
  const resultado = await anotarCaixas({
    limit,
    driveFileId,
    dryRun,
    lerDocumento: () => googleDriveService.readFileAsJson<DocumentoDoCatalogo>(catalogoId),
    pedirCaixa: async (entrada) => {
      const miniatura = await baixarMiniatura(entrada.driveFileId, 512)
      const resposta = await model.generateContent([
        montarPromptDaCaixa({ assunto: entrada.assunto }),
        { inlineData: { mimeType: 'image/jpeg', data: miniatura.toString('base64') } },
      ])
      return JSON.parse(resposta.response.text()).caixaDoAssunto
    },
    salvar: (documento, alteradas) => escreverCatalogoPreservandoCaixas(catalogoId, documento, { alteradas }),
    backup: async (documento) => {
      const pastaLocal = resolve(process.cwd(), 'human-output/backups')
      mkdirSync(pastaLocal, { recursive: true })
      const arquivo = resolve(pastaLocal, `catalogo-${project.id}-${Date.now()}.json`)
      writeFileSync(arquivo, JSON.stringify(documento, null, 2))
      console.log(`backup: ${arquivo}`)
    },
    aoAnotar: (entrada, r) => console.log(`  ${r.padEnd(8)} ${entrada.fileName ?? entrada.driveFileId}`),
  })
  console.log(`pendentes ${resultado.pendentes} · anotadas ${resultado.anotadas} · inválidas ${resultado.invalidas} · erros ${resultado.erros}`)
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error(`✗ ${e?.message ?? e}`)
  await db.$disconnect()
  process.exit(1)
})
