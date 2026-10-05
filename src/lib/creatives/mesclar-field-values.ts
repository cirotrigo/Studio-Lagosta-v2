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
