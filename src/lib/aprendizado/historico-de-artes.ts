/**
 * Leitura unificada dos DOIS livros-caixa de uso de modelo.
 *
 * O sistema registra "esta arte nasceu daquele modelo" em dois lugares que
 * nunca conversaram:
 *
 *  1. **`Generation.fieldValues->>'sourcePageId'`** — a via do chat/MCP
 *     (arte-rápida, `/api/external/creatives`) e o `finalize` do
 *     gerar-criativo. Json SEM índice: a leitura é varredura.
 *  2. **`AICreativeGeneration.layoutType = 'template:<pageId>'`** — a via da
 *     UI (`create-from-template` e, de novo, o `finalize`).
 *
 * Quem quisesse responder "qual modelo este cliente mais usa" precisava
 * conhecer os dois formatos, a ambiguidade do `sourcePageId` e a sobreposição
 * entre eles. `scripts/inventario-uso-modelos.ts` reconstruiu isso à mão em
 * 10/08/2026; este módulo é aquele conhecimento num lugar só.
 *
 * **Unifica a LEITURA, não os dados.** Nenhuma linha histórica é migrada: os
 * dois livros seguem sendo escritos por quem sempre os escreveu. O que se
 * padroniza daqui para a frente é o `source` na Generation (ver `finalize`) e
 * o espelho colunar `Generation.sourcePageId`, que tira a mineração da
 * varredura de Json.
 *
 * ⚠️ Duas armadilhas que este módulo resolve e que qualquer leitor novo
 * herdaria:
 *
 *   - **`sourcePageId` é AMBÍGUO**: `ajustar-arte` grava ali a página que ela
 *     mesma ajustou (a CÓPIA, não o modelo). Linhas `source = 'ajuste-arte'`
 *     são descartadas — a tool recusa página-modelo, então nenhum uso real se
 *     perde.
 *   - **O `finalize` escreve nos DOIS livros na mesma requisição**, então a
 *     união ingênua conta a mesma criação duas vezes e infla justamente a via
 *     da UI. A deduplicação por janela curta abaixo é o que impede isso.
 */

import { db } from '@/lib/db'

/** Por onde a arte foi criada. */
export type ViaDaArte =
  /** Chat/MCP/serviço — arte-rápida e `/api/external/creatives`. */
  | 'chat'
  /** Telas do Studio — `create-from-template` e o `finalize` do gerar-criativo. */
  | 'ui'

export interface UsoDeModelo {
  /** A página-MODELO que serviu de base. */
  modeloPageId: string
  via: ViaDaArte
  quando: Date
  /** A Generation que registrou o uso (só na via do chat). */
  generationId: string | null
  /** A página CÓPIA criada a partir do modelo (só na via da UI). */
  copiaPageId: string | null
}

export interface ContagemDeModelo {
  total: number
  chat: number
  ui: number
  /** Uso mais recente — `null` só se a lista vier vazia, o que não acontece. */
  ultimoUso: Date | null
}

/**
 * Janela em que uma linha de cada livro é tratada como a MESMA criação.
 *
 * O `finalize` grava a Generation e a AICreativeGeneration na mesma
 * requisição, com milissegundos de diferença. Um minuto é folgado o bastante
 * para uma requisição lenta e curto o bastante para não colar duas criações
 * humanas distintas do mesmo modelo — criar duas artes do mesmo template em
 * menos de 60 segundos exige automação, e automação usa uma via só.
 */
const JANELA_DE_DEDUPE_MS = 60_000

/** `source` de Generation cujo `sourcePageId` NÃO aponta para um modelo. */
const FONTES_QUE_NAO_SAO_USO_DE_MODELO = new Set(['ajuste-arte'])

interface LinhaDeGeneration {
  genId: string
  pid: string | null
  source: string | null
  criadaEm: Date
}

/**
 * O mínimo que este módulo precisa de um cliente Prisma.
 *
 * Estrutural (e não `typeof db`) para que os scripts de operação, que abrem o
 * PrismaClient cru de `prisma/generated/client`, possam reusar a leitura sem
 * abrir um segundo pool de conexões só por causa do singleton do app.
 */
export interface ClienteDeLeitura {
  $queryRaw: <T = unknown>(...args: any[]) => Promise<T>
  aICreativeGeneration: { findMany: (args: any) => Promise<any> }
}

/**
 * Todos os usos de modelo registrados, dos dois livros, já deduplicados e em
 * ordem cronológica.
 */
export async function lerUsosDeModelo(opts?: {
  projectId?: number
  /** Só usos a partir daqui. Sem isto, tudo — a instrumentação é recente. */
  desde?: Date
  /** Restringe a estes modelos (evita trazer o histórico inteiro). */
  modeloPageIds?: string[]
  /** Cliente alternativo (scripts de operação). Padrão: o singleton do app. */
  cliente?: ClienteDeLeitura
}): Promise<UsoDeModelo[]> {
  const projectId = opts?.projectId ?? null
  const desde = opts?.desde ?? null
  const filtro = opts?.modeloPageIds ? new Set(opts.modeloPageIds) : null
  const cliente: ClienteDeLeitura = opts?.cliente ?? db

  const [doChat, daUi] = await Promise.all([
    cliente.$queryRaw<LinhaDeGeneration[]>`
      select "id" as "genId",
             "fieldValues"->>'sourcePageId' as pid,
             "fieldValues"->>'source' as source,
             "createdAt" as "criadaEm"
        from "Generation"
       where "fieldValues"->>'sourcePageId' is not null
         and (${projectId}::int is null or "projectId" = ${projectId}::int)
         and (${desde}::timestamp is null or "createdAt" >= ${desde}::timestamp)`,
    cliente.aICreativeGeneration.findMany({
      where: {
        layoutType: { startsWith: 'template:' },
        ...(projectId ? { projectId } : {}),
        ...(desde ? { createdAt: { gte: desde } } : {}),
      },
      select: { pageId: true, layoutType: true, createdAt: true },
    }) as Promise<Array<{ pageId: string; layoutType: string; createdAt: Date }>>,
  ])

  const usos: UsoDeModelo[] = []

  for (const linha of doChat) {
    if (!linha.pid) continue
    if (linha.source && FONTES_QUE_NAO_SAO_USO_DE_MODELO.has(linha.source)) continue
    if (filtro && !filtro.has(linha.pid)) continue
    usos.push({
      modeloPageId: linha.pid,
      via: 'chat',
      quando: linha.criadaEm,
      generationId: linha.genId,
      copiaPageId: null,
    })
  }

  for (const linha of daUi) {
    const modeloPageId = linha.layoutType.slice('template:'.length)
    if (!modeloPageId) continue
    if (filtro && !filtro.has(modeloPageId)) continue
    usos.push({
      modeloPageId,
      via: 'ui',
      quando: linha.createdAt,
      generationId: null,
      copiaPageId: linha.pageId,
    })
  }

  usos.sort((a, b) => a.quando.getTime() - b.quando.getTime())
  return dedupar(usos)
}

/**
 * Colapsa o par que o `finalize` cria nos dois livros.
 *
 * A linha da UI vence: quando as duas existem, a criação aconteceu numa tela
 * do Studio, e é essa a via que o aprendizado precisa enxergar. A da UI também
 * é a que carrega a `copiaPageId`.
 *
 * Exportada para poder ser testada sem banco — a união é a parte fácil, o
 * risco todo está aqui.
 */
export function dedupar(usos: UsoDeModelo[]): UsoDeModelo[] {
  const ordenados = [...usos].sort((a, b) => a.quando.getTime() - b.quando.getTime())
  const out: UsoDeModelo[] = []
  /**
   * Linhas que JÁ absorveram o gêmeo. Sem esta trava, a linha fundida (que
   * passa a valer `ui`) volta a casar com a próxima linha `chat` da janela e
   * uma leva de três artes do mesmo modelo colapsa numa só — o defeito oposto
   * ao que a deduplicação existe para corrigir. Cada criação do `finalize`
   * produz UM par, nunca mais que isso.
   */
  const jaFundidas = new Set<number>()

  for (const uso of ordenados) {
    const gemeo = out.findIndex(
      (anterior, i) =>
        !jaFundidas.has(i) &&
        anterior.modeloPageId === uso.modeloPageId &&
        anterior.via !== uso.via &&
        Math.abs(anterior.quando.getTime() - uso.quando.getTime()) <= JANELA_DE_DEDUPE_MS,
    )
    if (gemeo < 0) {
      out.push(uso)
      continue
    }
    // Funde: fica a via da UI, mas o generationId do outro lado não se perde —
    // é o que liga a arte à galeria.
    const anterior = out[gemeo]
    out[gemeo] = {
      modeloPageId: uso.modeloPageId,
      via: 'ui',
      quando: anterior.quando,
      generationId: anterior.generationId ?? uso.generationId,
      copiaPageId: anterior.copiaPageId ?? uso.copiaPageId,
    }
    jaFundidas.add(gemeo)
  }

  return out
}

/** Agrega por modelo. Chave = `modeloPageId`. */
export function contarUsosPorModelo(usos: UsoDeModelo[]): Map<string, ContagemDeModelo> {
  const out = new Map<string, ContagemDeModelo>()
  for (const uso of usos) {
    const atual = out.get(uso.modeloPageId) ?? { total: 0, chat: 0, ui: 0, ultimoUso: null }
    atual.total += 1
    atual[uso.via] += 1
    if (!atual.ultimoUso || uso.quando > atual.ultimoUso) atual.ultimoUso = uso.quando
    out.set(uso.modeloPageId, atual)
  }
  return out
}
