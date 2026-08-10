/**
 * Stage 2 — Execução: consome um manifest e move/renomeia os arquivos no Drive.
 * Atualiza indice_mestre.csv após execução.
 *
 * Uso: npx dotenv-cli -e .env -- npx tsx scripts/bacana-execute.ts <manifest-file> [--dry-run]
 *
 * Exemplo:
 *   npx dotenv-cli -e .env -- npx tsx scripts/bacana-execute.ts .bacana-manifest-2026-04-19_14-30.json
 *   npx dotenv-cli -e .env -- npx tsx scripts/bacana-execute.ts .bacana-manifest-2026-04-19_14-30.json --dry-run
 */
import { googleDriveService } from '../src/server/google-drive-service'
import * as fs from 'fs'
import * as path from 'path'

const DRY_RUN = process.argv.includes('--dry-run')
const MANIFEST_ARG = process.argv.find((a) => a.endsWith('.json') && !a.includes('package'))

if (!MANIFEST_ARG) {
  console.error('Uso: npx tsx scripts/bacana-execute.ts <manifest-file.json> [--dry-run]')
  process.exit(1)
}

const FOLDER_MAP_PATH = path.join(__dirname, '../.bacana-folders.json')
if (!fs.existsSync(FOLDER_MAP_PATH)) {
  console.error('❌ .bacana-folders.json não encontrado. Rode bacana-setup-folders.ts primeiro.')
  process.exit(1)
}

const folderMap: Record<string, string> = JSON.parse(fs.readFileSync(FOLDER_MAP_PATH, 'utf-8'))

interface Operacao {
  id: string
  arquivo_origem: string
  file_id_drive: string
  destino: string
  destino_folder_id: string | null
  confianca: number
  acao: string
  revisar_recomendado: boolean
  novo_nome_sugerido?: string
  analise?: Record<string, unknown>
  erro?: string
}

interface Manifest {
  execucao_id: string
  cliente: string
  data: string
  total_fotos: number
  operacoes: Operacao[]
  resumo: Record<string, unknown>
}

// ── CSV ────────────────────────────────────────────────────────────────────────
function operacaoToCSVRow(op: Operacao, execId: string, novoNome: string): string {
  const a = op.analise ?? {}
  const cols = [
    novoNome,
    op.destino,
    op.file_id_drive,
    String(a.categoria ?? ''),
    String(a.corte ?? ''),
    String(a.metodo_preparo ?? ''),
    String(a.estilo_foto ?? ''),
    String(a.qualidade_tecnica ?? ''),
    String(a.contexto_foto ?? ''),
    String(a.mood ?? ''),
    String(a.tem_pessoas ?? 'nao'),
    String(a.tem_caneca_bacana ?? 'false'),
    String(a.tem_bebida ?? ''),
    Array.isArray(a.usos_recomendados) ? (a.usos_recomendados as string[]).join(';') : '',
    String(op.confianca),
    String(op.revisar_recomendado),
    new Date().toISOString(),
    execId,
    Array.isArray(a.tags) ? (a.tags as string[]).join(';') : '',
  ]
  return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')
}

const CSV_HEADER = [
  'arquivo', 'pasta_atual', 'file_id_drive', 'categoria', 'corte', 'metodo_preparo',
  'estilo_foto', 'qualidade_tecnica', 'contexto_foto', 'mood', 'tem_pessoas',
  'tem_caneca_bacana', 'tem_bebida', 'usos_recomendados', 'confianca',
  'revisar_recomendado', 'data_classificacao', 'execucao_id', 'tags',
].map((h) => `"${h}"`).join(',')

// ── MAIN ───────────────────────────────────────────────────────────────────────
async function main() {
  // Carrega manifest
  const manifestPath = path.isAbsolute(MANIFEST_ARG)
    ? MANIFEST_ARG
    : path.join(process.cwd(), MANIFEST_ARG)

  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest não encontrado: ${manifestPath}`)
    process.exit(1)
  }

  const manifest: Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const { execucao_id, operacoes } = manifest

  console.log(`=== Stage 2 — Execução${DRY_RUN ? ' (DRY RUN)' : ''} ===`)
  console.log(`Manifest: ${execucao_id} | ${operacoes.length} operações\n`)

  // Contadores
  let movidos = 0, revisados = 0, pulados = 0

  // Log de execução
  const logEntries: string[] = [
    `=== Execução ${execucao_id} | ${new Date().toISOString()} ===`,
    `DRY RUN: ${DRY_RUN}`,
    '',
  ]

  // Linhas CSV para o índice mestre
  const csvRows: string[] = []

  for (let i = 0; i < operacoes.length; i++) {
    const op = operacoes[i]
    const idx = String(i + 1).padStart(3, '0')
    const isMoveParaRevisao = op.destino === '99_Revisar-Manual' || op.confianca < 0.75
    const tag = isMoveParaRevisao ? 'REVISÃO' : op.confianca >= 0.9 ? '✓' : '~'

    // Resolve folder ID — pode estar no manifest ou no mapa local
    const targetFolderId = op.destino_folder_id ?? folderMap[op.destino] ?? null

    if (!targetFolderId) {
      const msg = `[${idx}] ❌ PASTA NÃO ENCONTRADA: ${op.destino} | arquivo: ${op.arquivo_origem}`
      console.log(msg)
      logEntries.push(msg)
      pulados++
      continue
    }

    // Gera nome de destino
    const ext = op.arquivo_origem.includes('.') ? op.arquivo_origem.split('.').pop()! : 'jpg'
    const baseName = op.novo_nome_sugerido
      ? op.novo_nome_sugerido.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : op.arquivo_origem.replace(/\.[^.]+$/, '')
    const novoNome = `${baseName}_${op.id}.${ext}`

    const msg = `[${idx}] ${tag} (${op.confianca}) ${op.arquivo_origem} → ${op.destino}/${novoNome}`
    console.log(msg)
    logEntries.push(msg)

    if (!DRY_RUN) {
      try {
        // Move o arquivo
        await googleDriveService.moveFiles([op.file_id_drive], targetFolderId)

        // Renomeia via update metadata
        const drive = (googleDriveService as unknown as { drive: { files: { update: (p: object) => Promise<unknown> } } }).drive
        if (drive?.files?.update) {
          await drive.files.update({
            fileId: op.file_id_drive,
            requestBody: { name: novoNome },
            fields: 'id,name',
          })
        }
      } catch (e) {
        const errMsg = `  ❌ ERRO ao mover: ${(e as Error).message}`
        console.log(errMsg)
        logEntries.push(errMsg)
        pulados++
        continue
      }
    }

    // Adiciona ao CSV
    csvRows.push(operacaoToCSVRow(op, execucao_id, novoNome))

    if (isMoveParaRevisao) revisados++
    else movidos++
  }

  // ── Salva log local ──────────────────────────────────────────────────────────
  logEntries.push('', `=== Resumo: movidos=${movidos} revisão=${revisados} pulados=${pulados} ===`)
  const logName = `${execucao_id}_execucao.log`
  const logPath = path.join(__dirname, `../.${logName}`)
  fs.writeFileSync(logPath, logEntries.join('\n'))
  console.log(`\n✓ Log salvo: ${logPath}`)

  if (!DRY_RUN && operacoes.length > 0) {
    // Upload log para _sistema/logs/
    const logsId = folderMap['_sistema/logs']
    if (logsId) {
      await googleDriveService.uploadFileToFolder({
        buffer: Buffer.from(logEntries.join('\n')),
        fileName: logName,
        mimeType: 'text/plain',
        folderId: logsId,
      })
      console.log(`✓ Log enviado para _sistema/logs/${logName}`)
    }

    // ── Atualiza indice_mestre.csv ─────────────────────────────────────────────
    const sistemaId = folderMap['_sistema']
    if (sistemaId && csvRows.length > 0) {
      // Tenta baixar CSV existente para append
      const existing = await googleDriveService.listFolderFiles(sistemaId)
      const csvFile = existing.find((f) => f.name === 'indice_mestre.csv')

      let fullCsv: string
      if (csvFile) {
        try {
          const { stream } = await googleDriveService.getFileStream(csvFile.id!)
          const chunks: Buffer[] = []
          for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
          const existingContent = Buffer.concat(chunks).toString('utf-8')
          // Append sem repetir header
          fullCsv = existingContent.trimEnd() + '\n' + csvRows.join('\n')
          // Deleta versão antiga antes de subir nova
          await googleDriveService.deleteFiles([csvFile.id!])
        } catch {
          fullCsv = CSV_HEADER + '\n' + csvRows.join('\n')
        }
      } else {
        fullCsv = CSV_HEADER + '\n' + csvRows.join('\n')
      }

      await googleDriveService.uploadFileToFolder({
        buffer: Buffer.from(fullCsv),
        fileName: 'indice_mestre.csv',
        mimeType: 'text/csv',
        folderId: sistemaId,
      })
      console.log(`✓ indice_mestre.csv atualizado (+${csvRows.length} linhas)`)
    }
  }

  console.log(`\n=== Resumo ===`)
  console.log(`Movidos: ${movidos} | Para revisão: ${revisados} | Pulados: ${pulados}`)
  if (revisados > 0) {
    console.log(`\n⚠ Confira 99_Revisar-Manual/ no Drive para as fotos com confiança baixa.`)
  }
}

main().catch(console.error)
