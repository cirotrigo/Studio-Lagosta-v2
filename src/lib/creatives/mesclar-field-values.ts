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
 * Devolve a promessa do Prisma (serve tanto para `await` quanto para entrar
 * num `db.$transaction([...])` em lote). Com `client` de transação
 * interativa, roda dentro dela.
 */
export function mesclarFieldValuesDaArte(
  client: ClienteDoBanco,
  generationId: string,
  patch: Record<string, unknown>,
  colunas: { resultUrl?: string } = {},
) {
  const json = JSON.stringify(patch)
  if (colunas.resultUrl !== undefined) {
    return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb, "resultUrl" = ${colunas.resultUrl} WHERE "id" = ${generationId}`
  }
  return client.$executeRaw`UPDATE "Generation" SET "fieldValues" = (CASE WHEN jsonb_typeof("fieldValues") = 'object' THEN "fieldValues" ELSE '{}'::jsonb END) || ${json}::jsonb WHERE "id" = ${generationId}`
}
