/**
 * O backfill da caixa do assunto (F2b): nas entradas sem `caixaAnalisadaEm`, pede SÓ a caixa à visão e grava SÓ
 * `caixaDoAssunto` + `caixaAnalisadaEm`. Não é um modo do `enriquecer-catalogo.ts`, que sincroniza pastas, salva antes da
 * análise e, nos caminhos de erro, altera descrição, tags e `analiseBloqueada`.
 *
 * Testável sem Drive nem banco: quem fala com o mundo é injetado (`scripts/anotar-caixa-do-assunto.ts`).
 */
import { lerCaixaDaVisao } from './catalogo-de-fotos'

interface Entrada {
  driveFileId: string
  fileName?: string
  assunto?: string | null
  caixaAnalisadaEm?: string
}

export interface DocumentoDoCatalogo {
  images: Entrada[]
  lastUpdated?: string
}

export interface AnotarCaixasInput {
  lerDocumento: () => Promise<DocumentoDoCatalogo>
  /** A resposta crua da visão para `caixaDoAssunto`. Lançar conta como erro da foto, que não grava nem carimba. */
  pedirCaixa: (entrada: Entrada) => Promise<unknown>
  salvar: (documento: DocumentoDoCatalogo, alteradas: Set<string>) => Promise<void>
  /** Antes do PRIMEIRO save: recuperação, não prevenção. */
  backup: (documento: DocumentoDoCatalogo) => Promise<void>
  limit?: number
  driveFileId?: string
  dryRun?: boolean
  salvarACada?: number
  aoAnotar?: (entrada: Entrada, resultado: 'anotada' | 'invalida' | 'erro') => void
}

export async function anotarCaixas(input: AnotarCaixasInput) {
  const { lerDocumento, pedirCaixa, salvar, backup, limit = Infinity, driveFileId, dryRun = false, salvarACada = 25, aoAnotar } = input
  const inicial = await lerDocumento()
  const pendentes = (inicial.images ?? []).filter((e) => !e.caixaAnalisadaEm && (!driveFileId || e.driveFileId === driveFileId)).slice(0, limit)

  const patches = new Map<string, { caixaDoAssunto: unknown; caixaAnalisadaEm: string }>()
  let copiaGuardada = false
  let invalidas = 0
  let erros = 0

  /** Parte do FRESCO, para a entrada que o cron acrescentou durante a rodada sobreviver. Os patches são cumulativos. */
  const gravar = async () => {
    if (dryRun || patches.size === 0) return
    if (!copiaGuardada) {
      await backup(inicial)
      copiaGuardada = true
    }
    const fresco = await lerDocumento()
    const images = fresco.images.map((e) => ({ ...e, ...patches.get(e.driveFileId) }))
    await salvar({ ...fresco, images, lastUpdated: new Date().toISOString() }, new Set(patches.keys()))
  }

  // ponytail: uma foto por vez; paralelizar se um acervo inteiro virar pedido (hoje é `--limit` por cliente).
  let desdeOUltimoSave = 0
  for (const entrada of pendentes) {
    try {
      const lida = lerCaixaDaVisao(await pedirCaixa(entrada))
      if (!lida) {
        invalidas++
        aoAnotar?.(entrada, 'invalida')
        continue
      }
      patches.set(entrada.driveFileId, { caixaDoAssunto: lida.caixa, caixaAnalisadaEm: new Date().toISOString() })
      aoAnotar?.(entrada, 'anotada')
      desdeOUltimoSave++
    } catch (erro) {
      erros++
      aoAnotar?.(entrada, 'erro')
      console.warn(`[anotar-caixa] ${entrada.fileName ?? entrada.driveFileId}: ${erro instanceof Error ? erro.message : String(erro)}`)
    }
    if (desdeOUltimoSave >= salvarACada) {
      await gravar()
      desdeOUltimoSave = 0
    }
  }
  if (desdeOUltimoSave > 0) await gravar()

  return { pendentes: pendentes.length, anotadas: patches.size, invalidas, erros }
}
