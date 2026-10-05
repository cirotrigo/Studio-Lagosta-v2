/**
 * Uma execução por CHAVE de cada vez, entre instâncias (R12-09, revisão final
 * do PR 12).
 *
 * Verificar-e-criar feito por duas execuções ao mesmo tempo cria duas vezes: as
 * duas leem a ausência antes de qualquer uma gravar, e sem unicidade no schema
 * o banco aceita as duas inserções. `fazer` roda numa transação curta que
 * PRIMEIRO pega a trava consultiva da chave: quem chega depois espera, e só lê
 * o que falta DEPOIS de a primeira ter commitado.
 *
 * - Trava de TRANSAÇÃO (`pg_advisory_xact_lock`), nunca de sessão: passa pelo
 *   pooler (o PgBouncer em modo transação não fixa backend, e a de sessão
 *   ficaria no backend de outro cliente). Some no commit e no rollback — o
 *   processo que morre não prende a chave.
 * - READ COMMITTED explícito: cada comando tira snapshot novo, então a releitura
 *   depois da espera enxerga o que a outra commitou. Em REPEATABLE READ ou
 *   SERIALIZABLE o snapshot é o do PRIMEIRO comando — a própria espera — e a
 *   releitura não veria nada (PR13-51). Não suba o isolamento.
 * - Dentro de `fazer`, só `tx`, e só banco: com o pooler o pool é de UMA
 *   conexão, e o `db` raiz ficaria esperando a conexão que a transação segura
 *   (P2028). Rede e Blob ficam fora.
 * - A espera pela trava conta no `timeout`: 20 s cobrem com folga uma seção
 *   crítica de poucos comandos; estourou, a transação volta atrás e quem chamou
 *   decide (os chamadores de hoje devolvem "não terminou", e repetir completa).
 */

import { db } from '@/lib/db'
import type { Prisma } from '../../prisma/generated/client'

export async function comTravaPorChave<T>(chave: string, fazer: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext(${chave}))`
      return fazer(tx)
    },
    { isolationLevel: 'ReadCommitted', maxWait: 10_000, timeout: 20_000 },
  )
}
