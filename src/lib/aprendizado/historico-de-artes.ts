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

export {
  contarUsosPorModelo,
  dedupar,
  JANELA_DE_DEDUPE_MS,
  type ContagemDeModelo,
  type UsoDeModelo,
  type ViaDaArte,
} from './historico-de-artes-contrato'
import { dedupar, JANELA_DE_DEDUPE_MS, type ContagemDeModelo, type UsoDeModelo, type ViaDaArte } from './historico-de-artes-contrato'

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
