import { randomInt } from 'node:crypto'

/**
 * A FICHA de uma reserva de render (Codex, B1d checkpoint d). Enquanto a linha está RENDERING, `nextRenderAt`
 * não é lido por ninguém (o cron e o executor só o olham em PENDING); cada reserva carimba ali um instante
 * aleatório do passado (2000–2008: se a linha voltar a PENDING com ele, entra na fila na hora), e TODA gravação
 * posterior exige RENDERING + esta ficha. Outra reserva carimba outra ficha. Sem ela, uma execução antiga gravava por cima da reserva de outra
 * depois de uma edição (PNG ou falha do pedido velho sobre o novo).
 * ponytail: coluna emprestada; vira coluna própria (`renderReservation`) se a prova do render (checkpoint e) pedir.
 */
export function fichaDeReserva(): Date {
  return new Date(Date.UTC(2000, 0, 1) + randomInt(2 ** 38))
}
