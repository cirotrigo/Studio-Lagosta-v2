/**
 * Fila de gravação de UMA página no editor (módulo puro, sem React).
 *
 * O autosave do PageSync não tinha trava de gravação em voo: enquanto o PATCH
 * não voltava, `lastSavedLayersRef` continuava velho, e todo re-render que
 * mexesse nas dependências do efeito (a identidade de `savePageState` muda com
 * o estado da mutação) agendava OUTRO PATCH com o mesmo conteúdo. Medido em
 * 03/10/2026 no banco de dev (PATCH de ~5 s): 15 gravações da mesma página em
 * 100 s, com a miniatura alternando entre null e o JPEG.
 *
 * Duas peças:
 * - `criarFila`: toda escrita da página (estado, miniatura) passa por ela, uma
 *   de cada vez, na ordem de chegada — nunca dois PATCHes em voo, e uma
 *   miniatura velha nunca chega ao servidor DEPOIS do estado que a apagou;
 * - `criarAutosave`: o pedido de "salvar o que estiver pendente". O pendente é
 *   lido quando a vez CHEGA (nunca quando foi pedido), então a edição feita
 *   durante o voo sai no PATCH seguinte com o estado mais novo, e pedidos
 *   repetidos enquanto um já espera a vez se fundem nele.
 */

export interface Fila {
  /** Roda a tarefa depois de todas as anteriores (que tenham dado certo ou não). */
  enfileirar<T>(tarefa: () => Promise<T>): Promise<T>
  /** Quantas tarefas estão na fila, contando a que está rodando. */
  pendentes(): number
}

export function criarFila(): Fila {
  let cauda: Promise<unknown> = Promise.resolve()
  let pendentes = 0
  return {
    enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
      pendentes++
      const vez = cauda.then(tarefa).finally(() => {
        pendentes--
      })
      // A falha de uma tarefa é de quem a pediu; a fila segue.
      cauda = vez.catch(() => undefined)
      return vez
    },
    pendentes: () => pendentes,
  }
}

export interface OpcoesDoAutosave<P> {
  fila: Fila
  /** O que falta gravar AGORA, ou null. Lido quando a vez chega. */
  pendente: () => P | null
  enviar: (p: P) => Promise<void>
  /** Marca `p` como gravado (só é chamado depois de `enviar` dar certo). */
  confirmar: (p: P) => void
  /** Roda depois de cada gravação confirmada, sem segurar a fila. */
  aposGravar?: (p: P) => void
}

export interface Autosave<P> {
  /**
   * Salva o pendente depois do que já estiver na fila. Devolve o que foi
   * gravado, ou null se não havia nada. Rejeita se o PATCH falhar.
   */
  salvar(): Promise<P | null>
}

export function criarAutosave<P>(opcoes: OpcoesDoAutosave<P>): Autosave<P> {
  // O pedido que está na fila e ainda não começou: quem pedir de novo entra
  // nele. Assim que ele começa, o próximo pedido vira uma vez nova — é ela que
  // leva a edição feita durante o voo.
  let esperando: Promise<P | null> | null = null

  return {
    salvar() {
      if (esperando) return esperando
      const vez = opcoes.fila.enfileirar(async () => {
        esperando = null
        const p = opcoes.pendente()
        if (p === null) return null
        await opcoes.enviar(p)
        opcoes.confirmar(p)
        opcoes.aposGravar?.(p)
        return p
      })
      esperando = vez
      // Se a vez falhar antes de começar a tarefa (não acontece com a fila
      // acima, mas não depender disso), o próximo pedido não pode ficar preso.
      vez.catch(() => {
        if (esperando === vez) esperando = null
      })
      return vez
    },
  }
}
