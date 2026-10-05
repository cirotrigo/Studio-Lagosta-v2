/**
 * Qual FORMA de arte propor a quem pediu uma peça — por cliente.
 *
 * Existe porque a casa tem sete motores de arte e quem opera não tem como
 * saber qual escolher. Na prática a equipe já escolhia: IA na bancada para uns
 * clientes, editor do Studio para outros, e os demais motores nunca. A escolha
 * morava na cabeça de uma pessoa; aqui ela vira dado.
 *
 * 🔴 **UMA recomendação, nunca um menu.** Para quem não é técnico, seis opções
 * é pior que nenhuma — é a mesma armadilha do crivo de aprovação, que virou
 * pedágio que se paga sem ler (11/08/2026). O contrato deste módulo é devolver
 * a forma JÁ ESCOLHIDA, o motivo em meia frase, e UMA alternativa. Quem chama
 * apresenta as duas e segue; não transforma isto em questionário.
 *
 * A decisão tem duas metades e elas não se misturam:
 *
 *  - **Mecânica** (o que existe): tem modelo cadastrado para este tema? Sem
 *    isso a via do modelo simplesmente não é oferecível. Medido em 16/08/2026:
 *    só 9 dos 30 pilares aprovados da carteira têm algum modelo.
 *  - **Declarada** (o que funciona): `PREFERENCIA_POR_PROJETO`, editada à mão
 *    por quem opera. Mesmo precedente de `CAIXA_DA_MANCHETE` e
 *    `PROJETOS_COM_MODELO_ESTRITO` — lista explícita, nunca derivada da prosa
 *    do DNA nem de um número que se move sozinho.
 *
 * 🔴 **O placar de feedback INFORMA a lista, não a substitui.** A tentação é
 * calcular a preferência direto de `LearningSignal`, e ela erraria hoje por
 * três razões medidas em 09/09/2026: "gostei" é subnotificado (quem aprova
 * agenda e segue, quem reprova clica); o compositor tem ZERO sinais, embora
 * seja o motor que produziu setembro inteiro; e parte dos números é de uma
 * leva só, com defeito já consertado (os 32 do TERO são os templates que
 * colidiam, 17/08). Placar velho condena motor que já melhorou. Por isso a
 * lista é declarada e o placar se revisita por `scripts/placar-de-motores.ts`.
 *
 * Módulo PURO — sem Prisma, sem rede. `@/lib/db` lança no import quando falta
 * `DATABASE_URL`, e esta decisão precisa ser conferível sozinha.
 */

/** Os motores que vale propor a quem opera. */
export type FormaDeArte =
  /** Preenche um modelo do cliente com copy e foto. Grátis, página editável. */
  | 'modelo'
  /** Monta pela assinatura do cliente, escolhendo a posição pela foto. Grátis, página editável. */
  | 'compositor'
  /** O gpt-image desenha a peça inteira. Cobra créditos, entrega imagem (não página). */
  | 'ia'
  /** Desenhar à mão no editor do Studio. Controle total. */
  | 'editor'
  /** Reusar uma arte já publicada e aprovada. Grátis, sem trabalho. */
  | 'repost'
  /** Peça escrita em HTML e renderizada pelo canvas de design. Melhor acabamento, exige o Claude montar. */
  | 'canvas'

/**
 * Como cada forma se chama para quem opera. 🔴 Nunca use o nome técnico na
 * conversa — mesma regra que já proíbe DRAFT, SCHEDULED e pageId.
 */
export const NOME_DA_FORMA: Record<FormaDeArte, string> = {
  modelo: 'usar um layout pronto do cliente',
  compositor: 'montar com a identidade do cliente',
  ia: 'deixar a IA desenhar',
  editor: 'fazer no editor do Studio',
  repost: 'repostar uma que já deu certo',
  canvas: 'pedir para o Claude montar no canvas',
}

/** O que cada forma custa, em linguagem de quem aprova. */
export const CUSTO_DA_FORMA: Record<FormaDeArte, string> = {
  modelo: 'sem crédito',
  compositor: 'sem crédito',
  ia: '25 créditos por peça',
  editor: 'sem crédito',
  repost: 'sem crédito',
  canvas: 'sem crédito',
}

/**
 * 🔴 A IA entrega uma IMAGEM, não uma página com camadas. "Ajustar depois" ali
 * só existe por "melhorar com IA", que é outra chamada paga e é redesenho, não
 * ajuste fino. É provavelmente por isso que a equipe foge para o editor em
 * alguns clientes — e nesses casos a resposta certa costuma ser o compositor,
 * que dá acabamento E página editável.
 */
export const RENDE_PAGINA_EDITAVEL: Record<FormaDeArte, boolean> = {
  modelo: true,
  compositor: true,
  ia: false,
  editor: true,
  repost: false,
  canvas: false,
}

export interface PreferenciaDeProjeto {
  /** A forma que costuma dar certo neste cliente. */
  primeira: FormaDeArte
  /** Formas que já foram reprovadas neste cliente. Nunca viram a primeira sugestão. */
  evitar?: FormaDeArte[]
  /** Meia frase, em português de quem opera. Vai para a conversa como está. */
  porque: string
}

/**
 * O placar que sustentou a lista abaixo — "gostei / preciso melhorar" por
 * cliente e motor, lido de `LearningSignal` em 09/09/2026 (201 sinais, tudo
 * que existia). Fica aqui congelado para a próxima pessoa saber POR QUE cada
 * linha é o que é; a leitura viva é `scripts/placar-de-motores.ts`.
 *
 *   Real Gelateria     IA 8/5     canvas 2/9
 *   By Rock            IA 2/0     canvas 0/9
 *   Espeto Gaúcho      IA 5/4     canvas 6/25
 *   Wine Vix           IA 5/9
 *   Lagosta Criativa   IA 3/6
 *   O Quintal Parrilla IA 2/21    modelo 0/1    canvas 0/7
 *   TERO               IA 0/11    modelo 0/32   canvas 1/20
 */
export const PREFERENCIA_POR_PROJETO: Record<number, PreferenciaDeProjeto> = {
  1: { primeira: 'ia', porque: 'a IA vem acertando bem neste cliente' },
  7: { primeira: 'ia', porque: 'a IA vem acertando bem neste cliente' },
  6: { primeira: 'ia', porque: 'a IA vem acertando bem neste cliente' },
  2: {
    primeira: 'compositor',
    evitar: ['ia'],
    porque: 'a IA vem sendo reprovada neste cliente',
  },
  3: {
    primeira: 'compositor',
    evitar: ['ia'],
    porque: 'a IA vem sendo reprovada neste cliente',
  },
  11: { primeira: 'compositor', porque: 'a IA fica irregular aqui; a identidade cadastrada acerta mais' },
  8: { primeira: 'compositor', porque: 'a IA fica irregular aqui; a identidade cadastrada acerta mais' },
}

/**
 * Sem linha na lista, o padrão é o compositor: é grátis, funciona em qualquer
 * tema, usa a identidade cadastrada do cliente e entrega página editável.
 * Todos os 10 restaurantes têm assinatura cadastrada (medido em 09/09/2026),
 * então ele nunca falta.
 */
export const PADRAO: PreferenciaDeProjeto = {
  primeira: 'compositor',
  porque: 'usa a identidade cadastrada do cliente e sai sem gastar crédito',
}

export interface ContextoDaEscolha {
  projectId: number
  /**
   * Existe modelo cadastrado que casa com o tema pedido? Sai de
   * `prepare-creative` / `escolher-modelo`. Sem isso a via do modelo não é
   * oferecível — e ela FALHA quando nada casa, em vez de escolher qualquer um.
   */
  temModeloDoTema?: boolean
  /** O cliente tem assinatura cadastrada? Sem ela o compositor recusa (`ASSINATURA_INCOMPLETA`). */
  temAssinatura?: boolean
  /** A pessoa já disse como quer. Respeitar vence qualquer recomendação. */
  pedidoExplicito?: FormaDeArte
}

export interface Recomendacao {
  forma: FormaDeArte
  /** Meia frase para a conversa. Já em português de quem opera. */
  porque: string
  /** A ÚNICA saída oferecida. `null` quando não há segunda opção que faça sentido. */
  alternativa: FormaDeArte | null
  /** Por que essa seria a alternativa. */
  alternativaPorque: string | null
}

/**
 * A recomendação para um pedido de arte. Devolve uma escolha feita, não uma
 * lista — quem chama apresenta "vou fazer X porque Y; prefere Z?" e segue.
 */
export function recomendarFormaDeArte(ctx: ContextoDaEscolha): Recomendacao {
  const pref = PREFERENCIA_POR_PROJETO[ctx.projectId] ?? PADRAO
  const evitar = new Set(pref.evitar ?? [])

  // Pedido explícito vence tudo. Quem já sabe o que quer não recebe conselho.
  if (ctx.pedidoExplicito) {
    return {
      forma: ctx.pedidoExplicito,
      porque: 'foi o que você pediu',
      alternativa: null,
      alternativaPorque: null,
    }
  }

  // O modelo do cliente é o layout que a marca já aprovou: quando existe um
  // para o tema, ele ganha do compositor — salvo cliente onde já foi reprovado.
  if (ctx.temModeloDoTema && !evitar.has('modelo')) {
    return {
      forma: 'modelo',
      porque: 'este cliente tem um layout pronto para esse tema',
      alternativa: alternativaPara('modelo', pref, evitar, ctx),
      alternativaPorque: motivoDaAlternativa(alternativaPara('modelo', pref, evitar, ctx)),
    }
  }

  // A preferência declarada, desde que o motor exista para este cliente.
  let forma = pref.primeira
  let porque = pref.porque
  if (forma === 'compositor' && ctx.temAssinatura === false) {
    forma = 'ia'
    porque = 'este cliente ainda não tem a identidade cadastrada para montar sem IA'
  }

  const alternativa = alternativaPara(forma, pref, evitar, ctx)
  return { forma, porque, alternativa, alternativaPorque: motivoDaAlternativa(alternativa) }
}

/**
 * A segunda opção — uma só. Nunca devolve uma forma que este cliente evita, e
 * nunca repete a primeira.
 */
function alternativaPara(
  primeira: FormaDeArte,
  pref: PreferenciaDeProjeto,
  evitar: Set<FormaDeArte>,
  ctx: ContextoDaEscolha,
): FormaDeArte | null {
  const candidatas: FormaDeArte[] =
    primeira === 'ia'
      ? ['compositor', 'editor']
      : primeira === 'modelo'
        ? [pref.primeira === 'modelo' ? 'compositor' : pref.primeira, 'compositor']
        : ['ia', 'editor']

  for (const c of candidatas) {
    if (c === primeira || evitar.has(c)) continue
    if (c === 'compositor' && ctx.temAssinatura === false) continue
    return c
  }
  return null
}

function motivoDaAlternativa(forma: FormaDeArte | null): string | null {
  if (!forma) return null
  const motivos: Record<FormaDeArte, string> = {
    ia: 'se quiser uma composição nova, fora do layout de sempre',
    compositor: 'se quiser a peça já editável para ajustar depois',
    modelo: 'se quiser o layout de sempre desse cliente',
    editor: 'se você mesma quiser desenhar',
    repost: 'se for um horário de rotina que uma arte antiga resolve',
    canvas: 'se a leva merecer acabamento de designer — aí eu monto',
  }
  return motivos[forma]
}

/**
 * A frase pronta para a conversa. Existe para que as duas skills digam a mesma
 * coisa — se cada uma escrever a sua, elas divergem.
 */
export function fraseDaRecomendacao(r: Recomendacao): string {
  const base = `vou ${NOME_DA_FORMA[r.forma]} (${CUSTO_DA_FORMA[r.forma]}), porque ${r.porque}`
  if (!r.alternativa) return base
  return `${base}. Prefere ${NOME_DA_FORMA[r.alternativa]} — ${r.alternativaPorque}?`
}
