/**
 * Quais blocos da copy são SERVIÇO — horário e endereço.
 *
 * Serviço tem lugar fixo na peça: o RODAPÉ, agrupado, no menor nível. É a
 * convenção das artes aprovadas de todos os clientes, e não depende do modelo
 * escolhido: o `style-guide` manda na diagramação, mas ele é uma peça ANTIGA e
 * pode simplesmente não ter linha de serviço nenhuma. Quando a copy tem e o
 * modelo não, faltava quem dissesse onde essa linha mora — e o gpt-image a
 * pendurava junto da manchete, no meio do quadro (pedido do Ciro, 17/08/2026).
 *
 * Módulo PURO, sem Prisma e sem SDK de IA: ele é regra de copy, e precisa ser
 * testável sem banco — mesma razão de `caixa-da-copy.ts` e `art-direction.ts`.
 *
 * 🔴 A classificação é conservadora de propósito. Frase que só MENCIONA um
 * horário ("Almoço com a família e amigos, a partir das 11h") é apoio, não
 * serviço: mandá-la para o rodapé rebaixaria a promessa da peça a letra miúda.
 * O corte é o que SOBRA da frase depois de tirar o dado — sobrando quase nada,
 * o bloco É o dado.
 */

/** Janela de horário: "11h às 17h", "das 17h às 19h", "11h-00h", "a partir das 11h". */
const HORARIO =
  /\b(?:das\s+|a\s+partir\s+d[ae]s?\s+)?\d{1,2}\s*(?:h|:\d{2}|hs|horas)?\s*(?:às|as|a|até|-|–|—)\s*\d{1,2}\s*(?:h|:\d{2}|hs|horas)?\b|\ba\s+partir\s+d[ae]s?\s+\d{1,2}\s*(?:h|:\d{2}|hs|horas)\b/i

/** Logradouro no começo do bloco, ou CEP em qualquer lugar. */
const ENDERECO = /^\s*(?:rua|r\.|av\.?|avenida|travessa|trav\.|praç?a|estrada|rod\.|rodovia|alameda|al\.)\s+/i
const CEP = /\b\d{5}-?\d{3}\b/

/** Rótulos que anunciam serviço mesmo sem número ("Funcionamento", "Aberto de…"). */
const ROTULO_DE_SERVICO = /\b(?:funcionamento|horário\s+de\s+funcionamento|aberto\s+d[eo]s?)\b/i

/**
 * O que pode sobrar da frase, em caracteres, para ela ainda ser SERVIÇO.
 *
 * Calibrado nas copies reais da leva do O Quintal:
 *   "Hoje das 11h às 17h"                            → sobra "Hoje" (4)      ✔ serviço
 *   "Happy hour das 17h às 19h"                      → sobra "Happy hour" (10) ✔ serviço
 *   "Funcionamento - 11h às 00h"                     → sobra "Funcionamento -" (15) ✔ serviço
 *   "Almoço com a família e amigos, a partir das 11h" → sobra 30 chars        ✘ apoio
 */
const SOBRA_MAXIMA = 20

export type PapelDoBloco = 'horário' | 'endereço'

export interface BlocoDeServico {
  /** Índice do bloco na lista de copy, começando em 0. */
  indice: number
  texto: string
  papel: PapelDoBloco
}

/** O bloco é predominantemente um horário? */
function ehHorario(bloco: string): boolean {
  const achado = bloco.match(HORARIO)
  if (!achado) return ROTULO_DE_SERVICO.test(bloco) && bloco.trim().length <= SOBRA_MAXIMA * 2
  const sobra = bloco.replace(achado[0], ' ').replace(/\s+/g, ' ').trim()
  return sobra.length <= SOBRA_MAXIMA
}

/** Os blocos de serviço da copy, na ordem em que aparecem. */
export function blocosDeServico(copy: string[]): BlocoDeServico[] {
  const achados: BlocoDeServico[] = []
  copy.forEach((bruto, indice) => {
    const texto = bruto.replace(/\s+/g, ' ').trim()
    if (!texto) return
    if (ENDERECO.test(texto) || CEP.test(texto)) {
      achados.push({ indice, texto, papel: 'endereço' })
      return
    }
    if (ehHorario(texto)) achados.push({ indice, texto, papel: 'horário' })
  })
  return achados
}

/**
 * Elemento gráfico que só existe para acompanhar uma linha de serviço.
 *
 * 🔴 Sem isto o ícone vira ÓRFÃO. Medido em 17/08/2026 na peça de sobremesas:
 * o modelo escolhido tem relógio e pin de localização ao lado do horário e do
 * endereço, e o MODELO SPINE manda desenhar os elementos gráficos
 * "obrigatoriamente — são a assinatura do modelo". A copy da peça nova não tem
 * serviço nenhum, e a arte saiu com os dois ícones sozinhos no canto inferior,
 * apontando para nada.
 */
const ICONE_DE_SERVICO = /rel[óo]gio|hor[áa]ri|localiza|endere[çc]|servi[çc]o|\bpin\b|marcador\s+de\s+lugar/i

/**
 * Os elementos gráficos que fazem sentido nesta peça.
 *
 * Só filtra quando a copy NÃO tem serviço — havendo horário ou endereço, o
 * ícone tem a quem acompanhar e é assinatura da marca, como o modelo manda.
 */
export function elementosQueFazemSentido(
  elementos: string[] | null,
  copy: string[],
): { manter: string[] | null; descartados: string[] } {
  if (!elementos || blocosDeServico(copy).length > 0) return { manter: elementos, descartados: [] }
  const manter = elementos.filter((e) => !ICONE_DE_SERVICO.test(e))
  return { manter, descartados: elementos.filter((e) => ICONE_DE_SERVICO.test(e)) }
}

/**
 * A ordem que vai para o prompt. Vazia quando não há serviço na copy — e aí
 * NADA é dito: inventar uma zona de rodapé numa peça que não tem serviço é
 * criar layout que ninguém pediu.
 */
export function instrucaoDeServico(copy: string[]): string | null {
  const servico = blocosDeServico(copy)
  if (servico.length === 0) return null
  const lista = servico.map((b) => `- ${b.papel}: "${b.texto}"`).join('\n')
  return [
    '[SERVIÇO — LUGAR FIXO NO RODAPÉ]',
    'Estes blocos da copy são informação de serviço:',
    lista,
    'Eles vão AGRUPADOS NO RODAPÉ da peça, um por linha, no MENOR nível de texto, alinhados entre si — nunca no meio do quadro, nunca colados à manchete e nunca no tamanho dela.',
    /**
     * 🔴 Dizer ONDE eles vão não basta: é preciso dizer de onde eles SAEM.
     *
     * Medido em 17/08/2026, duas vezes na peça de funcionamento: a copy lista o
     * horário como 2º bloco, logo abaixo da manchete, e o modelo escolhido tem
     * uma zona de manchete com DOIS níveis (título + subtítulo). O gpt-image
     * preencheu o subtítulo com o horário E o repetiu no rodapé — atendendo às
     * duas forças ao mesmo tempo. A regra genérica "cada bloco aparece uma
     * única vez", três linhas acima, não segurou.
     */
    'ELES SAEM DA SEQUÊNCIA DE CIMA: o bloco de texto principal contém apenas a manchete e o apoio que NÃO são serviço. Não repita horário nem endereço junto da manchete, e não os use para preencher o nível de subtítulo do modelo — se sobrar um nível lá sem conteúdo, ele não existe nesta peça.',
    // A exceção precisa ser dita: o parágrafo do modelo manda copiar as zonas
    // dele, e o modelo pode ser uma peça antiga sem linha de serviço nenhuma.
    'Esta é a única zona que NÃO depende do modelo a seguir: se ele não tiver linha de serviço, crie a zona de rodapé mesmo assim, no estilo dele. Se tiver, use exatamente aquela.',
    // "Rodapé" é a palavra que puxa para a borda: sem esta linha o bloco de
    // serviço desce até encostar. O limite é o mesmo da regra 9 — e ele é
    // repetido aqui porque a regra 9 fala de safe area em geral, enquanto quem
    // decide onde o serviço pousa é este parágrafo.
    'O rodapé é a faixa LOGO ACIMA da área reservada do story, não a borda: o serviço termina antes dos ~7/8 da altura. Sobrando espaço embaixo, o bloco SOBE — nunca desce para preencher.',
  ].join('\n')
}
