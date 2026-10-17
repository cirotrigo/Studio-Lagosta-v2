/**
 * MERGE de `Generation.fieldValues` feito NO BANCO (`||` do jsonb), nunca por
 * `{ ...fieldValues }` capturado antes.
 *
 * Por quê (REV-R01 da revisão do Codex, 12/09/2026): a mesma arte é escrita
 * por dois lados que não se veem — o worker da fila (recomposição e
 * re-render) e o revisor (`ajustarArte`, que grava a trava
 * `somenteReRender` na transação do ajuste). O worker lia `fieldValues` no
 * começo, trabalhava dezenas de segundos e gravava `{ ...lido, patch }`: uma
 * trava nascida nesse intervalo era apagada, e a edição de texto seguinte
 * recompunha pela spec e desfazia o ajuste. Reler antes de um `update`
 * incondicional só encurtaria a janela. Aqui o patch é aplicado pelo
 * Postgres sobre o valor ATUAL da linha, numa instrução só: chave que o
 * patch não traz fica como está.
 *
 * O merge é RASO (uma chave = um valor inteiro): quem quer mexer dentro de
 * `recomposicao` manda o objeto inteiro. `fieldValues` que não for objeto
 * (nunca aconteceu; o schema exige Json) vira `{}` antes do merge.
 */

import { db } from '@/lib/db'
import type { Prisma } from '../../../prisma/generated/client'

export type ClienteDoBanco = Prisma.TransactionClient | typeof db

/**
 * Devolve a promessa do Prisma com o NÚMERO DE LINHAS afetadas (serve tanto
 * para `await` quanto para entrar num `db.$transaction([...])` em lote). Com
 * `client` de transação interativa, roda dentro dela.
 *
 * `somenteSe` (CP5b § 3.3): o merge só acontece se a Generation for do projeto
 * E da página indicados (`"fieldValues"->>'pageId'`, o vínculo que
 * `contextoDaMedicao` usa) E a página for do projeto (`EXISTS` por
 * `Template.projectId`, a mesma relação que `ver-geracao` usa — `fieldValues.pageId`
 * é JSON e não prova isso sozinho). 0 linhas = sem vínculo, nada gravado. Sem o
 * parâmetro o SQL é byte a byte o de sempre — os chamadores atuais não mudam.
 */
export function mesclarFieldValuesDaArte(
  client: ClienteDoBanco,
  generationId: string,
  patch: Record<string, unknown>,
  colunas: { resultUrl?: string; somenteSe?: { projectId: number; pageId: string } } = {},
) {
  const json = JSON.stringify(patch)
  const v = colunas.somenteSe
  if (v !== undefined && colunas.resultUrl !== undefined) {
    return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb, "resultUrl" = ${colunas.resultUrl} WHERE "id" = ${generationId} AND "projectId" = ${v.projectId} AND "fieldValues"->>'pageId' = ${v.pageId} AND EXISTS (SELECT 1 FROM "Page" p JOIN "Template" t ON t."id" = p."templateId" WHERE p."id" = ${v.pageId} AND t."projectId" = ${v.projectId})`
  }
  if (v !== undefined) {
    return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb WHERE "id" = ${generationId} AND "projectId" = ${v.projectId} AND "fieldValues"->>'pageId' = ${v.pageId} AND EXISTS (SELECT 1 FROM "Page" p JOIN "Template" t ON t."id" = p."templateId" WHERE p."id" = ${v.pageId} AND t."projectId" = ${v.projectId})`
  }
  if (colunas.resultUrl !== undefined) {
    return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb, "resultUrl" = ${colunas.resultUrl} WHERE "id" = ${generationId}`
  }
  return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb WHERE "id" = ${generationId}`
}

/**
 * CP5d § 4.3 — FECHA como `FAILED` uma Generation que ainda está `PROCESSING`, numa ÚNICA instrução: status,
 * `completedAt` e o patch do `fieldValues` (por merge raso — o registro do gate e o resto ficam) na mesma `UPDATE`,
 * condicionada ao status. Dois fechamentos concorrentes (o explícito de `ajustarArte` e o cron de órfãs): quem chegar
 * primeiro vence e grava o seu motivo; o segundo não escreve NADA (0 linhas) — em duas instruções (merge e depois
 * `updateMany`) o segundo sobrescrevia o motivo antes de perder o status (Codex R4 do contrato do CP5d). Devolve o
 * número de linhas (0 ou 1). `fieldValues` que não for objeto vira `{}` antes do merge.
 */
export function fecharGenerationComoFalha(client: ClienteDoBanco, generationId: string, patch: Record<string, unknown>) {
  const json = JSON.stringify(patch)
  return client.$executeRaw`UPDATE "Generation" SET "status" = 'FAILED'::"GenerationStatus", "completedAt" = NOW(), "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb WHERE "id" = ${generationId} AND "status" = 'PROCESSING'::"GenerationStatus"`
}

/**
 * Antes de o re-render SUBSTITUIR a copy visual (`slotValues`) de uma arte,
 * guarda a copy anterior como proposta de aprendizado quando a arte ainda não
 * tem uma válida. `lerProcedencia` usa `slotValues` como `copyProposta` na
 * ausência de `copyDeAprendizado` (a arte rápida grava só `slotValues`): a
 * recuperação forçada que regrava a copy visual sem o texto que o revisor
 * escondeu fazia a proposta perder esse texto, e ao agendar com página e
 * Generation `copyParaDecisao` (que conta a camada escondida pelo revisor)
 * voltava a acusar uma ADIÇÃO humana (REV-93D-02 da revisão do Codex,
 * 12/09/2026).
 *
 * Uma instrução condicional no Postgres: só escreve quando `slotValues` é
 * objeto E `copyDeAprendizado` NÃO é — uma gravação concorrente do ajuste
 * (que grava a proposta certa, com as ocultações contadas) nunca é
 * sobrescrita: se ela chegou antes, a condição falha; se chega depois, o
 * merge dela vence. Devolve quantas linhas mudaram (0 ou 1).
 */
export function preservarPropostaDeAprendizado(client: ClienteDoBanco, generationId: string) {
  return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = "fieldValues" || jsonb_build_object('copyDeAprendizado', "fieldValues"->'slotValues') WHERE "id" = ${generationId} AND jsonb_typeof("fieldValues") = 'object' AND jsonb_typeof("fieldValues"->'slotValues') = 'object' AND jsonb_typeof("fieldValues"->'copyDeAprendizado') IS DISTINCT FROM 'object'`
}
