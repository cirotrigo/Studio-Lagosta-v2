/**
 * O sinal de MODELO — qual página-modelo o sistema propôs e qual foi usada.
 *
 * `prepareCreative` é o **único ponto do sistema que enxerga os modelos
 * REJEITADOS**: ele casa tema/dia contra o acervo, ordena os candidatos,
 * entrega `candidates[0]` como principal e joga as alternativas na resposta —
 * onde morrem. Sem registrar a lista no momento da emissão, o corpus nunca
 * saberia que existiam outras opções, e "o modelo escolhido" viraria uma
 * constante em vez de uma preferência.
 *
 * As duas metades do sinal nascem em funções diferentes porque nascem em
 * chamadas diferentes: `prepareCreative` propõe (e a copy ainda vai ser
 * escrita pelo LLM), `createArteRapida` decide. Entre uma e outra passa uma
 * conversa inteira, e nenhuma das duas superfícies de hoje (MCP local, rotas
 * `/api/external/creatives`) carrega o id da proposta de volta — daí o
 * fechamento por RECONCILIAÇÃO abaixo.
 *
 * ⚠️ Nada aqui lança: é o contrato de `captura.ts`. Falhar em registrar a
 * preferência de modelo não pode impedir ninguém de criar a arte.
 */

import { db } from '@/lib/db'
import { registrarDesfecho, registrarSugestao } from './captura'
import type { Superficie } from './vocabulario'

/** Proveniência gravada em `LearningSignal.servico`. */
const SERVICO = 'prepare-creative'

/**
 * Versão da heurística de escolha (o casamento por tema/dia de
 * `prepareCreative`). Mudou a regra de ordenação? Suba isto, senão as safras
 * antiga e nova ficam indistinguíveis na agregação.
 */
export const VERSAO_ESCOLHA_DE_MODELO = '2'
// '2' (01/09/2026): casamento por tag apertado (`casar-tema.ts`) e fim do
// fallback só-dia com tema informado — a safra '1' propunha modelo de outro
// assunto quando o tema não casava.

/**
 * Janela em que a criação ainda pode ser atribuída a uma proposta.
 *
 * Seis horas cobre com folga o intervalo real entre propor e criar (uma
 * conversa), e é curta o bastante para não colar a arte de hoje na proposta de
 * ontem. Fora dela a proposta fica pendente e a varredura de expiração a fecha
 * como `expirada` — que é o registro honesto de "ninguém decidiu".
 */
const JANELA_DE_FECHAMENTO_MS = 6 * 3_600_000

/** Quantas propostas em aberto olhamos para achar a que casa com a página. */
const PROPOSTAS_INSPECIONADAS = 5

export interface ModeloProposto {
  projectId: number
  /** Tema pedido, como veio (a normalização é da heurística, não do registro). */
  tema: string
  dia?: string | null
  /** TODOS os candidatos que a heurística encontrou, na ordem em que ordenou. */
  candidatos: string[]
  /** O que foi entregue como principal — hoje, sempre `candidatos[0]`. */
  escolhido: string
}

/**
 * Idempotência da proposta.
 *
 * Sem chave, um LLM que chama `prepare-creative` três vezes antes de criar
 * infla o denominador do KPI em 3× — o defeito exato que `captura.ts` avisa
 * para evitar. O balde de uma hora colapsa a repetição (retry de rota, o
 * modelo reconsiderando o tema) sem colapsar propostas legitimamente
 * diferentes: tema, dia e escolhido entram na chave.
 */
function chaveDaProposta(p: ModeloProposto): string {
  const balde = new Date().toISOString().slice(0, 13) // YYYY-MM-DDTHH
  const dia = p.dia?.trim() || '-'
  return `modelo:${p.projectId}:${p.tema.trim().toLowerCase()}:${dia.toLowerCase()}:${p.escolhido}:${balde}`
}

/**
 * Registra a proposta de modelo NO MOMENTO EM QUE ELA É EMITIDA.
 *
 * Só vale a pena quando havia escolha de verdade: com um candidato único não
 * houve preferência nenhuma, e gravar a linha só encheria o denominador com
 * decisões que o sistema tomou sozinho.
 */
export async function registrarSugestaoDeModelo(proposta: ModeloProposto): Promise<string | null> {
  if (proposta.candidatos.length < 2) return null

  return registrarSugestao({
    projectId: proposta.projectId,
    tipo: 'modelo',
    sugerido: {
      tema: proposta.tema,
      dia: proposta.dia ?? null,
      candidatos: proposta.candidatos,
      escolhido: proposta.escolhido,
    },
    servico: SERVICO,
    versao: VERSAO_ESCOLHA_DE_MODELO,
    chave: chaveDaProposta(proposta),
    pageId: proposta.escolhido,
  })
}

/**
 * Fecha a proposta que originou esta arte.
 *
 * **Por reconciliação, não por id**: nenhuma superfície de hoje devolve o
 * `sugestaoId` de `prepareCreative` para `createArteRapida` (o MCP local
 * reimplementa o handler, e as skills passam só `sourcePageId`). Exigir o id
 * seria exigir uma mudança em cada chamador — e enquanto isso nenhuma proposta
 * fecharia, deixando a taxa de aceitação em zero por construção.
 *
 * A atribuição é conservadora: só fecha a proposta em aberto, do mesmo
 * projeto, dentro da janela, **cuja lista de candidatos contém a página usada**.
 * Página que não estava entre os candidatos não fecha nada — a pessoa foi
 * buscar um modelo fora da proposta, e a proposta merece expirar.
 *
 * `aceita-como-veio` quando a arte saiu do principal; `trocada` quando saiu de
 * uma alternativa — que é justamente o sinal que interessa aprender.
 */
export async function fecharSugestaoDeModelo(entrada: {
  projectId: number
  /** A página-modelo que de fato virou arte. */
  pageIdUsado: string
  generationId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
  /** Quando o chamador já sabe qual proposta fechar, pula a reconciliação. */
  sugestaoId?: string | null
}): Promise<void> {
  try {
    let sugestaoId = entrada.sugestaoId ?? null
    let escolhidoOriginal: string | null = null

    if (!sugestaoId) {
      const abertas = await db.learningSignal.findMany({
        where: {
          projectId: entrada.projectId,
          tipo: 'modelo',
          desfecho: null,
          sugeridoEm: { gte: new Date(Date.now() - JANELA_DE_FECHAMENTO_MS) },
        },
        orderBy: { sugeridoEm: 'desc' },
        take: PROPOSTAS_INSPECIONADAS,
        select: { id: true, sugerido: true },
      })

      for (const aberta of abertas) {
        const sugerido = (aberta.sugerido ?? {}) as { candidatos?: unknown; escolhido?: unknown }
        const candidatos = Array.isArray(sugerido.candidatos) ? sugerido.candidatos : []
        if (!candidatos.includes(entrada.pageIdUsado)) continue
        sugestaoId = aberta.id
        escolhidoOriginal = typeof sugerido.escolhido === 'string' ? sugerido.escolhido : null
        break
      }
    }

    if (!sugestaoId) return

    await registrarDesfecho({
      sugestaoId,
      desfecho: escolhidoOriginal && escolhidoOriginal !== entrada.pageIdUsado ? 'trocada' : 'aceita-como-veio',
      escolhido: { pageId: entrada.pageIdUsado },
      generationId: entrada.generationId ?? null,
      pageId: entrada.pageIdUsado,
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie ?? 'chat',
    })
  } catch (erro) {
    console.error('[aprendizado] falha ao fechar sugestão de modelo (seguindo sem ela):', erro)
  }
}
