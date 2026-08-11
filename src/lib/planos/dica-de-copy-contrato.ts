/**
 * Dica de copy — o CONTRATO (parte PURA).
 *
 * Módulo SEM Prisma e SEM SDK de IA de propósito: `@/lib/db` **lança no
 * import** quando falta `DATABASE_URL`, e o que mora aqui precisa ser testável
 * sem banco. É a mesma separação que já obrigou `approval-checklist.ts`,
 * `revisao-ortografica-contrato.ts`, `learning-scope.ts`, `text-comparison.ts`
 * e `para-bancada.ts` a saírem dos seus serviços.
 *
 * O que mora aqui é o rigor:
 *
 * 1. **Reconciliação por ECO, nunca por índice.** O índice declarado pelo
 *    modelo veio DESLOCADO em produção (crivo do By Rock, 11/08/2026) —
 *    respondia a pergunta N e carimbava N-1. Cada dica copia as primeiras
 *    palavras da âncora da peça, e é o TEXTO que amarra. Herdada junto a
 *    correção da F2: empate entre âncoras de texto IDÊNTICO não é ambiguidade
 *    (uma semana repete "happy hour" duas vezes, e descartar as duas custava
 *    8 de 25 classificações num lote real do Wine Vix).
 * 2. **A guarda de preço/horário/data/promoção.** O prompt PEDE que esses
 *    dados venham da base; esta função CONFERE. Pedido não é trava — a mesma
 *    lição de "você não viu a imagem" no crivo, que não sobreviveu como regra
 *    de prompt. Aqui a trava é código: dado sem lastro numa entrada válida
 *    para AQUELE dia derruba o bloco inteiro e vira aviso.
 *
 * A vigência é conferida contra a data DO SLOT (`estaVigente(expiresAt,
 * pedido.quando)`), nunca contra `new Date()`: planejamento mira data futura, e
 * campanha que vence antes do slot não pode entrar na copy daquele slot.
 */

import { dadosProibidos, type TipoProibido } from '@/lib/aprendizado/causa-do-diff'
import { normalizeForComparison } from '@/lib/ai/text-comparison'
import { estaVigente } from '@/lib/knowledge/vigencia'
import type { Suspeita } from '@/lib/ai/revisao-ortografica-contrato'

/** Muda quando o prompt ou a regra muda — é a safra da dica. */
export const VERSAO_DA_DICA = 'dica-copy-v1'

/** Quantas palavras da âncora o modelo copia de volta. */
export const PALAVRAS_DO_ECO = 6

/** Teto de blocos por peça. Acima disso não é arte, é parágrafo. */
export const MAX_BLOCOS = 4

/** Teto de caracteres de um bloco de arte. */
export const MAX_CHARS_BLOCO = 180

/** Teto de caracteres da legenda. */
export const MAX_CHARS_LEGENDA = 1_200

/** Quanto de cada entrada da base o prompt mostra. Ver `montarPromptDeDica`. */
export const MAX_CHARS_ENTRADA = 900

export interface PedidoDeDica {
  /** Identificador estável do slot na leva. Volta no resultado. */
  ref: string
  /** Assunto/pilar do slot, legível. `null` no cold start. */
  tema?: string | null
  /** Quando o post vai ao ar — é contra ESTA data que a vigência da base é conferida. */
  quando: Date
  formato: 'story' | 'feed' | 'quadrado'
  /** Pedido livre de quem está conversando ("puxa o happy hour"), opcional. */
  observacao?: string | null
}

export interface DicaDeCopy {
  ref: string
  /** Blocos de texto da arte, na ordem (headline, apoio, CTA…). */
  blocos: string[]
  /** Legenda do post. Null em story. */
  legenda?: string | null
  /** Entradas da base que sustentam algum dado citado. Vazio quando não há dado sensível. */
  fontes: string[]
  avisos: string[]
  /** Suspeitas da revisão ortográfica, JÁ rodada nesta dica. */
  suspeitas: Suspeita[]
}

export interface ResultadoDasDicas {
  versao: string
  dicas: DicaDeCopy[]
  /** Refs que não receberam dica (modelo omitiu, eco ambíguo). */
  semDica: string[]
  avisos: string[]
  /** true = o modelo não respondeu. NUNCA é erro. */
  indisponivel: boolean
}

/**
 * Uma entrada da base como a dica precisa dela: com o conteúdo INTEIRO (é
 * contra ele que a guarda confere o dado) e com o prazo (é ele que decide se a
 * entrada vale para o slot).
 */
export interface EntradaDaBase {
  id: string
  titulo: string
  categoria: string
  conteudo: string
  expiresAt: Date | null
}

/** O que o serviço carregou da marca. Tudo opcional — cliente novo tem pouco. */
export interface InsumosDaDica {
  nomeDaMarca: string
  tomDeVoz: string | null
  regrasDeConteudo: string | null
  /**
   * As perguntas do crivo, como estão no DNA. Entram no prompt como PERGUNTAS
   * que alguém fará sobre a peça pronta — nunca como afirmações: a polaridade
   * da lista é MISTA (há pergunta cuja resposta "sim" reprova, tipo "Tem
   * emoji?"), e tratá-las como regras ensinaria o oposto em metade delas.
   */
  perguntasDoCrivo: string[]
  /** `perfilParaPrompt(...)` — já sanitizado, pronto para concatenar. */
  perfil: string | null
}

/** Um item da resposta do modelo. Tudo opcional: é saída de LLM. */
export interface ItemDaResposta {
  eco?: string | null
  ref?: string | null
  blocos?: Array<string | null | undefined> | null
  legenda?: string | null
}

/** Uma dica antes da guarda de dados: já amarrada ao pedido certo. */
export interface DicaCrua {
  ref: string
  blocos: string[]
  legenda: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Âncora e eco
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ÂNCORA da peça: o texto que o modelo copia de volta para dizer sobre qual
 * peça está falando.
 *
 * De propósito NÃO inclui o `ref`. Se incluísse, duas peças nunca teriam
 * âncoras iguais — e o caso "dois slots com o mesmo tema na mesma semana"
 * (comum: happy hour de quinta e de sexta) deixaria de existir, junto com a
 * regra que o trata.
 *
 * 🔴 Sem tema e sem observação — o COLD START, que hoje é o caso NORMAL, porque
 * nenhum projeto tem taxonomia de pilares aprovada — a âncora é a descrição
 * legível do slot ("story de quinta-feira, 19:00"), nunca o `ref`. Medido em
 * 11/08/2026 contra o By Rock: com `ref` na âncora ("slot-1"), o modelo
 * ignorou a instrução e copiou a PRÓPRIA headline no eco ("HAPPY HOUR TODO
 * DIA"), e a leva inteira — 4 de 4 — foi descartada. Pedir para copiar um
 * identificador opaco é pedir o que o modelo não faz; pedir para copiar uma
 * frase que descreve a peça, ele faz.
 */
export function ancoraDoPedido(pedido: PedidoDeDica): string {
  const tema = pedido.tema?.trim()
  if (tema) return tema
  const observacao = pedido.observacao?.trim()
  if (observacao) return observacao
  return descricaoDoSlot(pedido)
}

/** "story de quinta-feira, 19:00" — a âncora do cold start. */
export function descricaoDoSlot(pedido: PedidoDeDica): string {
  const quando = pedido.quando
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) return pedido.ref
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(quando)
  return `${pedido.formato} de ${partes}`
}

/** As primeiras palavras de um texto, normalizadas para comparação. */
export function ecoDaDica(texto: string, palavras = PALAVRAS_DO_ECO): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, palavras)
    .join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliação
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconciliacaoDasDicas {
  brutas: DicaCrua[]
  /** Refs que ficaram sem resposta amarrada. */
  semDica: string[]
  avisos: string[]
}

function limparBlocos(blocos: ItemDaResposta['blocos']): string[] {
  if (!Array.isArray(blocos)) return []
  const saida: string[] = []
  for (const bruto of blocos) {
    if (typeof bruto !== 'string') continue
    const texto = bruto.replace(/\s+/g, ' ').trim()
    if (!texto) continue
    if (texto.length > MAX_CHARS_BLOCO) continue
    if (saida.length >= MAX_BLOCOS) break
    saida.push(texto)
  }
  return saida
}

function limparLegenda(legenda: ItemDaResposta['legenda']): string | null {
  if (typeof legenda !== 'string') return null
  const texto = legenda.trim()
  if (!texto) return null
  return texto.length > MAX_CHARS_LEGENDA ? texto.slice(0, MAX_CHARS_LEGENDA).trimEnd() : texto
}

/** Nenhuma âncora casou com o eco: ele não é tentativa de âncora, é ruído. */
const SEM_CANDIDATO = -1
/** Mais de uma âncora DIFERENTE casou: resposta desalinhada, descarta. */
const AMBIGUO = -2

/**
 * Amarra cada resposta ao pedido CERTO, pelo eco.
 *
 * O `ref` copiado pelo modelo entra só quando o eco NÃO CASOU COM NADA — nunca
 * quando ele casou com várias. A distinção é a lição do By Rock (11/08/2026):
 * eco que bate em duas âncoras diferentes é resposta desalinhada, e aceitar o
 * `ref` dela seria carimbar a copy na peça errada; já eco que não bate com
 * âncora nenhuma costuma ser o modelo copiando a PRÓPRIA headline, e aí o
 * `ref` é o único vínculo que sobrou — descartar ali custou a leva inteira, 4
 * de 4, sem proteger nada.
 *
 * Isto não contradiz a regra do crivo ("o índice declarado não é confiável"):
 * lá o desempate era um NÚMERO DE POSIÇÃO, que desliza em bloco quando o
 * modelo pula um item. `ref` é um token copiado, e um token errado não tem como
 * ficar consistente com os outros da lista.
 *
 * Resposta que não se amarra a ninguém é descartada: a peça volta sem dica, que
 * é honesto, em vez de receber a copy da peça vizinha, que é mentira com
 * aparência de trabalho pronto.
 */
export function reconciliarDicas(
  pedidos: PedidoDeDica[],
  itens: Array<ItemDaResposta | null | undefined> | null | undefined,
): ReconciliacaoDasDicas {
  const ancoras = pedidos.map(ancoraDoPedido)
  const ecos = ancoras.map((a) => ecoDaDica(a))
  /** Âncora inteira normalizada — para saber se dois candidatos são o MESMO texto. */
  const inteiras = ancoras.map((a) => ecoDaDica(a, 400))
  const usados = new Set<number>()
  const brutas: DicaCrua[] = []
  const avisos: string[] = []

  const casarPorEco = (eco: string | null | undefined): number => {
    if (!eco) return SEM_CANDIDATO
    const alvo = ecoDaDica(eco)
    if (!alvo) return SEM_CANDIDATO
    const candidatos: number[] = []
    for (let i = 0; i < ecos.length; i++) {
      if (usados.has(i)) continue
      if (ecos[i] === alvo || ecos[i].startsWith(alvo) || alvo.startsWith(ecos[i])) candidatos.push(i)
    }
    if (candidatos.length === 1) return candidatos[0]
    if (candidatos.length === 0) return SEM_CANDIDATO

    // Empate entre âncoras IDÊNTICAS não é ambiguidade: em qual das duas a
    // resposta cai é indiferente, porque o texto é o mesmo. O descarte segue
    // valendo para âncoras DIFERENTES que só compartilham o começo — aí a
    // resposta pode mesmo ir para a peça errada.
    const primeira = inteiras[candidatos[0]]
    return candidatos.every((i) => inteiras[i] === primeira) ? candidatos[0] : AMBIGUO
  }

  const casarPorRef = (ref: string | null | undefined): number => {
    if (!ref) return SEM_CANDIDATO
    const alvo = ref.trim()
    if (!alvo) return SEM_CANDIDATO
    return pedidos.findIndex((p, idx) => !usados.has(idx) && p.ref === alvo)
  }

  for (const item of itens ?? []) {
    if (!item) continue
    let alvo = casarPorEco(item.eco)
    if (alvo === SEM_CANDIDATO) alvo = casarPorRef(item.ref)
    if (alvo < 0) {
      avisos.push(
        `Descartei uma proposta de copy: não deu para saber de que peça ela era ("${(item.eco ?? item.ref ?? '').slice(0, 40)}").`,
      )
      continue
    }

    const blocos = limparBlocos(item.blocos)
    const legenda = limparLegenda(item.legenda)
    if (blocos.length === 0 && !legenda) {
      avisos.push(`A proposta de "${ancoras[alvo]}" veio vazia.`)
      continue
    }

    usados.add(alvo)
    brutas.push({ ref: pedidos[alvo].ref, blocos, legenda })
  }

  return {
    brutas,
    semDica: pedidos.filter((_, i) => !usados.has(i)).map((p) => p.ref),
    avisos,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A guarda de preço, horário, data e promoção
// ─────────────────────────────────────────────────────────────────────────────

const NOME_DO_TIPO: Record<TipoProibido, string> = {
  preco: 'preço',
  horario: 'horário',
  data: 'data',
  promocao: 'promoção',
}

/** As entradas da base que ainda valem no dia em que a peça vai ao ar. */
export function entradasValidasPara(pedido: PedidoDeDica, entradas: EntradaDaBase[]): EntradaDaBase[] {
  return entradas.filter((e) => estaVigente(e.expiresAt, pedido.quando))
}

/** Forma de comparação: a mesma de `dadosProibidos`, sem espaço nenhum. */
function corpoComparavel(texto: string): string {
  return normalizeForComparison(texto).replace(/\s+/g, '')
}

export interface CopyGuardada {
  blocos: string[]
  legenda: string | null
  fontes: string[]
  avisos: string[]
}

/**
 * 🔴 A trava. Preço, horário, data e promoção SÓ sobrevivem quando o valor
 * exato aparece numa das entradas da base recuperadas para aquele slot.
 *
 * Não basta pedir isso no prompt — a arquitetura é a mesma de três portas do
 * `perfil.ts`, e o comentário de lá explica por quê: "uma trava que depende de
 * todas as anteriores terem funcionado não é uma trava".
 *
 * O que é removido é o BLOCO INTEIRO, não o valor. Tirar só o número deixaria
 * "HAPPY HOUR DAS  ÀS ", que é pior que a falta: parece copy e não é. A pessoa
 * vê o motivo no aviso e escreve a linha à mão, ou cadastra a informação na
 * base — que é onde ela devia estar desde o começo.
 */
export function aplicarGuardaDeDados(
  copy: { blocos: string[]; legenda?: string | null },
  entradas: EntradaDaBase[],
): CopyGuardada {
  const corpora = entradas.map((e) => ({
    titulo: e.titulo,
    corpo: corpoComparavel(`${e.titulo}\n${e.conteudo}`),
  }))

  const fontes = new Set<string>()
  const avisos: string[] = []

  /** `null` quando o texto cita dado sem lastro; o próprio texto quando passa. */
  const conferir = (texto: string, rotulo: string): string | null => {
    const { tipos, termos } = dadosProibidos(texto)
    if (termos.length === 0) return texto

    const semLastro: string[] = []
    const apoios = new Set<string>()
    for (const termo of termos) {
      const donos = corpora.filter((c) => c.corpo.includes(termo))
      if (donos.length === 0) semLastro.push(termo)
      else for (const dono of donos) apoios.add(dono.titulo)
    }

    if (semLastro.length > 0) {
      const classes = tipos.map((t) => NOME_DO_TIPO[t]).join(', ')
      avisos.push(
        `Tirei ${rotulo} porque ${semLastro.length === 1 ? 'o dado' : 'os dados'} ${semLastro
          .map((t) => `"${t}"`)
          .join(', ')} (${classes}) não ${semLastro.length === 1 ? 'está' : 'estão'} em nenhuma entrada da base válida para esta data — ${
          entradas.length === 0
            ? 'não havia nenhuma entrada disponível'
            : 'e preço, horário, data e promoção só podem sair de lá'
        }. Escreva a linha à mão, ou cadastre a informação na base.`,
      )
      return null
    }

    for (const apoio of apoios) fontes.add(apoio)
    return texto
  }

  const blocos: string[] = []
  copy.blocos.forEach((bloco, i) => {
    const passou = conferir(bloco, `o bloco ${i + 1} ("${bloco.slice(0, 40)}")`)
    if (passou !== null) blocos.push(passou)
  })

  const legendaBruta = copy.legenda?.trim() || null
  const legenda = legendaBruta ? conferir(legendaBruta, 'a legenda') : null

  return { blocos, legenda, fontes: [...fontes], avisos }
}

// ─────────────────────────────────────────────────────────────────────────────
// O prompt
// ─────────────────────────────────────────────────────────────────────────────

/** Data e hora do slot em Brasília, por extenso — sem passar por `new Date(texto)`. */
export function quandoEmBRT(quando: Date): string {
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) return 'data não informada'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(quando)
}

/** Só o dia da semana, em Brasília: "domingo", "quinta-feira". */
export function diaDaSemanaEmBRT(quando: Date): string {
  if (!(quando instanceof Date) || Number.isNaN(quando.getTime())) return 'dia não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
  }).format(quando)
}

const INSTRUCOES = [
  'Você escreve a COPY das peças de Instagram de um restaurante. Recebeu a marca, o que ela pode dizer e uma LEVA de peças para produzir de uma vez. Para cada peça, escreva os blocos de texto que vão DENTRO da arte e, quando o formato pedir, a legenda do post.',
  '',
  'COMO ESCREVER',
  `- Cada bloco é uma linha independente na arte (chamada, apoio, convite). De 1 a ${MAX_BLOCOS} blocos por peça; a maioria fica bem com 2 ou 3.`,
  '- Bloco é curto: o que não cabe numa respiração não cabe na arte.',
  '🔴 CADA BLOCO SE SUSTENTA SOZINHO. Ele vai para um campo próprio do layout, e os campos podem ficar longe um do outro, em tamanhos e cores diferentes. NÃO quebre uma frase em três blocos ("A cozinha da casa prepara" / "uma experiência especial" / "para a sua noite") — isso é uma frase só, e ela chega picada na arte. Escreva blocos inteiros: chamada, apoio, convite.',
  '- Português do Brasil, na voz desta marca. Sem emoji, sem hashtag dentro da arte, sem reticências.',
  '- Nada de clichê de agência ("venha conferir", "não perca", "imperdível", "o melhor da cidade").',
  '- STORY não tem legenda: deixe a legenda vazia. FEED e QUADRADO têm legenda.',
  '- A legenda tem uma ou duas frases PRÓPRIAS e só então o convite. Legenda que é só o CTA não é legenda.',
  '🔴 O DIA DA PEÇA JÁ ESTÁ DADO, e ela precisa fazer sentido NELE. Não anuncie no domingo o que a casa só faz de segunda a sexta, nem convide para um dia em que ela está fechada. Se o assunto não cabe naquele dia, escreva sobre outra coisa que caiba — as regras e o horário de funcionamento desta marca estão logo abaixo.',
  '',
  '🔴 PREÇO, HORÁRIO, DATA E PROMOÇÃO SÓ EXISTEM SE ESTIVEREM NA BASE DE CONHECIMENTO abaixo, e só nas entradas LIBERADAS para aquela peça. Copie o número exatamente como está na entrada — não arredonde, não aproxime, não "atualize".',
  '  Isso vale para "a partir de R$ X", "das X às Y", "só até dia X", "50% off", "chopp em dobro": se o dado não está numa entrada liberada, ele NÃO EXISTE, e a peça se escreve sem ele.',
  '  O sistema APAGA qualquer bloco com preço, horário, data ou promoção que ele não encontre na base — o bloco inventado não chega a ninguém, só deixa a peça capenga.',
  '- Não escreva a data nem a hora em que a peça vai ao ar. Aquilo é quando o post sai, não quando a coisa acontece; dia da semana por extenso ("sexta à noite") pode, número de calendário só vindo da base.',
  '- Porcentagem é lida como promoção, inclusive em figura de linguagem: "100% artesanal" cai junto com "50% off". Diga "artesanal" e pronto.',
  '',
  '🔴 A LEVA INTEIRA É SUA E VAI SER VISTA JUNTA. Não repita o mesmo gancho, a mesma abertura, o mesmo verbo de convite nem a mesma palavra de impacto em duas peças. Variedade entre as peças é parte do trabalho.',
  '',
  `🔴 COMO DIZER DE QUE PEÇA VOCÊ ESTÁ FALANDO. Em "eco", copie as primeiras ${PALAVRAS_DO_ECO} palavras da linha "âncora:" DAQUELA peça, exatamente como estão escritas lá. O eco NÃO é a sua headline, não é um resumo e não é texto novo: é cópia. Em "ref", repita o identificador da peça. Proposta que não se amarra a nenhuma peça é DESCARTADA.`,
  'Responda TODAS as peças, uma vez cada.',
].join('\n')

/** O prompt inteiro, montado. Exportado para inspeção e teste. */
export function montarPromptDeDica(
  insumos: InsumosDaDica,
  pedidos: PedidoDeDica[],
  entradas: EntradaDaBase[],
): string {
  const partes: string[] = [INSTRUCOES, '', `=== MARCA: ${insumos.nomeDaMarca} ===`]

  if (insumos.tomDeVoz) {
    partes.push('', 'COMO ESTA MARCA FALA:', insumos.tomDeVoz)
  }
  if (insumos.regrasDeConteudo) {
    partes.push('', 'REGRAS DE CONTEÚDO DESTA MARCA:', insumos.regrasDeConteudo)
  }

  if (insumos.perguntasDoCrivo.length > 0) {
    partes.push(
      '',
      '=== O QUE VÃO PERGUNTAR SOBRE A PEÇA PRONTA ===',
      'Estas são as perguntas que alguém desta casa faz ao olhar a peça antes de aprovar. São PERGUNTAS, não afirmações: em algumas a resposta boa é "sim" e em outras é "não". Leia cada uma e escreva uma copy que se saia bem nela.',
      ...insumos.perguntasDoCrivo.map((p) => `- ${p}`),
    )
  }

  if (insumos.perfil) {
    partes.push('', `=== ${insumos.perfil}`)
  }

  partes.push('', '=== BASE DE CONHECIMENTO DESTA MARCA ===')
  if (entradas.length === 0) {
    partes.push(
      'Nenhuma entrada disponível. Escreva SEM preço, SEM horário, SEM data e SEM promoção — não há de onde tirá-los.',
    )
  } else {
    partes.push(
      'É a ÚNICA origem possível de preço, horário, data e promoção. Cada peça diz abaixo quais entradas valem para ela.',
    )
    entradas.forEach((entrada, i) => {
      const conteudo =
        entrada.conteudo.length > MAX_CHARS_ENTRADA
          ? `${entrada.conteudo.slice(0, MAX_CHARS_ENTRADA).trimEnd()}…`
          : entrada.conteudo
      partes.push('', `[${i + 1}] (${entrada.categoria}) ${entrada.titulo}`, conteudo)
    })
  }

  partes.push('', '=== PEÇAS A ESCREVER ===')
  pedidos.forEach((pedido, i) => {
    const validas = entradas
      .map((e, idx) => (estaVigente(e.expiresAt, pedido.quando) ? idx + 1 : null))
      .filter((n): n is number => n !== null)
    const linhas = [
      `PEÇA ${i + 1}`,
      `  ref: ${pedido.ref}`,
      `  âncora: ${ancoraDoPedido(pedido)}`,
      // O dia da semana ganha linha própria e maiúsculas porque é a informação
      // que o modelo mais deixa passar num prompt longo — e a que mais estraga
      // a peça (anunciar no domingo o executivo que é de segunda a sexta,
      // convidar para uma casa que fecha aos domingos, usar o pré-título de
      // sábado numa peça de sexta).
      `  DIA DA SEMANA: ${diaDaSemanaEmBRT(pedido.quando)} — a peça é DESTE dia e só pode falar do que a casa faz NELE`,
      `  assunto: ${pedido.tema?.trim() || 'livre — escolha um que combine com o dia e com o que esta marca costuma publicar'}`,
      `  vai ao ar: ${quandoEmBRT(pedido.quando)} (horário de Brasília; NÃO escreva esta hora na copy)`,
      `  formato: ${pedido.formato}${pedido.formato === 'story' ? ' (sem legenda)' : ' (com legenda)'}`,
    ]
    const observacao = pedido.observacao?.trim()
    if (observacao) linhas.push(`  pedido de quem está montando: ${observacao}`)
    if (entradas.length > 0) {
      linhas.push(
        validas.length > 0
          ? `  entradas da base liberadas para esta data: ${validas.join(', ')}`
          : '  entradas da base liberadas para esta data: NENHUMA (as demais já terão vencido) — escreva sem preço, horário, data ou promoção',
      )
    }
    partes.push('', linhas.join('\n'))
  })

  return partes.join('\n')
}
