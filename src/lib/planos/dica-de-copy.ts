/**
 * Dica de copy para os itens de uma leva (F3, trilho B — fatia B1).
 *
 * ⚠️⚠️ **ESTE ARQUIVO É UM ESQUELETO.** A implementação de verdade é da fatia
 * B1, que roda em paralelo: ela junta tema do slot + base de conhecimento (com
 * vigência conferida contra a DATA DO SLOT) + DNA + referência de estilo +
 * perfil aprendido, e devolve os blocos de texto de cada peça. Quem mesclar as
 * duas fatias deve **substituir este arquivo inteiro** pelo da B1 — a
 * assinatura abaixo é o contrato combinado entre as duas e não muda.
 *
 * Enquanto o esqueleto está aqui, `propor-semana` roda inteiro e persiste a
 * leva com horários, assuntos e fotos; só a copy vem vazia, exatamente como
 * viria num dia em que o modelo de texto estivesse fora do ar. É o mesmo
 * contrato da B1 (`indisponivel: true`), e é o que garante que a proposta
 * nunca depende de a copy existir.
 *
 * ── O CONTRATO QUE NÃO MUDA ───────────────────────────────────────────────
 *  - **nunca lança**: falha vira `indisponivel: true` com o motivo em
 *    `avisos`, e a leva é persistida do mesmo jeito;
 *  - **nunca cobra crédito de imagem** e nunca dispara geração;
 *  - `ref` é opaco para a dica: quem chama escolhe (aqui, o horário do slot) e
 *    usa para casar `dicas[i]` com o item certo.
 */

/** Versão do gerador de dica. Entra na chave de idempotência do sinal. */
export const VERSAO_DA_DICA = 'dica-de-copy-esqueleto'

export interface PedidoDeDica {
  /** Identificador opaco, devolvido em `dicas[].ref` / `semDica[]`. */
  ref: string
  tema?: string | null
  quando: Date
  formato: 'story' | 'feed' | 'quadrado'
  observacao?: string | null
}

export interface DicaDeCopy {
  ref: string
  /** Os blocos da arte, na ordem de leitura. */
  blocos: string[]
  legenda?: string | null
  /** De onde saiu cada afirmação (entrada da base, DNA, perfil). */
  fontes: string[]
  avisos: string[]
  /** Trechos que pedem conferência humana (preço, horário, promessa). */
  suspeitas: Array<{ trecho: string; sugestao: string; motivo: string }>
}

export interface ResultadoDasDicas {
  versao: string
  dicas: DicaDeCopy[]
  /** Os `ref` que ficaram sem copy — nunca some um pedido em silêncio. */
  semDica: string[]
  avisos: string[]
  /** `true` quando NENHUMA dica saiu (modelo fora do ar, base vazia, esqueleto). */
  indisponivel: boolean
}

export async function montarDicasDeCopy(input: {
  projectId: number
  pedidos: PedidoDeDica[]
}): Promise<ResultadoDasDicas> {
  return {
    versao: VERSAO_DA_DICA,
    dicas: [],
    semDica: input.pedidos.map((p) => p.ref),
    avisos:
      input.pedidos.length > 0
        ? ['A dica de copy ainda não está ligada neste ambiente — a leva vai sem texto.']
        : [],
    indisponivel: true,
  }
}
