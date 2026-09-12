/**
 * A parte PURA do histórico de artes — tipos, a janela e a deduplicação dos
 * dois livros-caixa — separada de `historico-de-artes.ts` porque aquele
 * importa o Prisma (`@/lib/db` LANÇA no import sem `DATABASE_URL`), e o teste
 * da deduplicação falhava por isso em toda máquina sem `.env` (medido nos
 * gates de 12/09/2026: o único arquivo vermelho da suíte inteira). A leitura
 * (`lerUsosDeModelo`) continua lá; quem só precisa da conta importa daqui.
 */

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
export const JANELA_DE_DEDUPE_MS = 60_000

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
