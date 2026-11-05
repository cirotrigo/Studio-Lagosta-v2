/**
 * CP-X2b — o autosave da página recusado pelo servidor por forma vetorial inválida (422 `VETOR_INVALIDO`).
 * Módulo puro, sem React (o `PageSyncWrapper` o usa).
 *
 * Antes, o 422 seria silencioso: a fila só faz `console.error`, e na troca de página o design era substituído
 * pela página seguinte, com o `lastSaved` antigo — a edição recusada sumia sem ninguém saber. Aqui:
 * - a recusa fica guardada POR PÁGINA com o pendente inteiro (o que a pessoa tinha na tela);
 * - o MESMO conteúdo já recusado não é reenviado (`jaRecusado`): sem laço de 422. Qualquer edição nova muda a
 *   assinatura e volta a ser enviada;
 * - **LINHAGEM**: cada carga da página a partir do banco (troca de página, descarte) abre uma linhagem nova; a
 *   edição continua na linhagem de onde partiu, e Restaurar devolve a página à linhagem da recusa. A recusa só se
 *   resolve com uma gravação bem-sucedida da MESMA linhagem e mais nova que ela (a correção da edição recusada) ou
 *   pelo descarte explícito. Gravar outro estado — por exemplo só canvas ou áudio sobre a versão do banco, depois de
 *   trocar de página e voltar — não prova que o pendente recusado foi salvo nem substituído, e não o apaga. Uma
 *   confirmação antiga (sequência anterior à recusa) também não;
 * - quem mostra o aviso lê `todas()` (estável entre mudanças, para `useSyncExternalStore`).
 */

/** O que torna um pendente igual a outro (as serializações que o PageSync compara) e de onde ele veio. */
export interface PendenteAssinavel {
  pageId: string
  layersString: string
  canvasString: string
  audioString: string
  /** A linhagem do design de onde o pendente foi capturado (`linhagem(pageId)` na captura). */
  linhagem: number
  /** Ordem de captura (`proximaSeq()`): confirmação mais velha que a recusa não a resolve. */
  seq: number
}

export interface RecusaDoVetor<P extends PendenteAssinavel> {
  pageId: string
  pendente: P
  mensagem: string
}

const assinatura = (p: PendenteAssinavel) => `${p.layersString}\u0000${p.canvasString}\u0000${p.audioString}`

/** O PATCH da página só responde 422 para `VetorInvalido` (ver a rota e docs/regras/editor-e-galeria.md). */
export function ehRecusaDoVetor(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { status?: unknown }).status === 422
}

export function criarRecusas<P extends PendenteAssinavel>() {
  const porPagina = new Map<string, RecusaDoVetor<P>>()
  const linhagens = new Map<string, number>()
  const ouvintes = new Set<() => void>()
  let contador = 0
  let instantaneo: RecusaDoVetor<P>[] = []
  const mudou = () => {
    instantaneo = Array.from(porPagina.values())
    ouvintes.forEach((ouvinte) => ouvinte())
  }
  return {
    proximaSeq: () => ++contador,
    linhagem: (pageId: string) => linhagens.get(pageId) ?? 0,
    /** A página foi (re)carregada do banco: o que estiver na tela não descende de nenhuma edição anterior. */
    novaLinhagem(pageId: string) {
      linhagens.set(pageId, ++contador)
    },
    /** Restaurar: a tela volta a mostrar a edição recusada e a continua. */
    retomar(recusa: RecusaDoVetor<P>) {
      linhagens.set(recusa.pageId, recusa.pendente.linhagem)
    },
    registrar(pendente: P, mensagem: string) {
      const atual = porPagina.get(pendente.pageId)
      // uma recusa mais nova da mesma página não é trocada por uma mais velha que chegue depois
      if (atual && atual.pendente.seq > pendente.seq) return
      porPagina.set(pendente.pageId, { pageId: pendente.pageId, pendente, mensagem })
      mudou()
    },
    jaRecusado(pendente: PendenteAssinavel): boolean {
      const recusa = porPagina.get(pendente.pageId)
      return !!recusa && assinatura(recusa.pendente) === assinatura(pendente)
    },
    /** Gravação confirmada: resolve a recusa só se ela é a continuação da edição recusada (mesma linhagem, mais nova). */
    confirmado(pendente: PendenteAssinavel) {
      const recusa = porPagina.get(pendente.pageId)
      if (!recusa || recusa.pendente.linhagem !== pendente.linhagem || pendente.seq <= recusa.pendente.seq) return
      porPagina.delete(pendente.pageId)
      mudou()
    },
    /** Descarte explícito. */
    descartar(pageId: string) {
      if (porPagina.delete(pageId)) mudou()
    },
    de: (pageId: string | null): RecusaDoVetor<P> | null => (pageId ? porPagina.get(pageId) ?? null : null),
    todas: () => instantaneo,
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
}
