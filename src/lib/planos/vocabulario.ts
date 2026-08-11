/**
 * Vocabulário do plano de conteúdo (F3).
 *
 * Um PLANO é uma leva — a semana que alguém combinou de publicar. Cada ITEM é
 * um post pretendido, com a via por onde a arte vai nascer (modelo do cliente
 * ou geração por IA) e uma situação que avança do "proposto" ao "agendado".
 *
 * Este módulo NÃO importa Prisma nem `@/lib/db`, de propósito: a bancada é
 * client e vai precisar dos rótulos e das regras de transição. `@/lib/db`
 * **lança no import** quando falta `DATABASE_URL`, então bastaria um import
 * para derrubar a tela. Mesma razão de `learning-scope.ts`,
 * `approval-checklist.ts` e `art-direction.ts`.
 *
 * Os valores são gravados como TEXT no banco, e não como enum do Postgres,
 * pelo precedente da F1 (`LearningSignal.tipo`) e por uma razão operacional:
 * `migrate deploy` roda cada migration numa transação, e
 * `ALTER TYPE … ADD VALUE` não pode ser usado no mesmo bloco em que o tipo é
 * criado. Vocabulário que ainda se move fica em TEXT; a validação mora aqui,
 * num lugar só.
 */

// ── Situação do item ────────────────────────────────────────────────────────

/**
 * Onde o item está.
 *
 * `erro` é acréscimo deliberado ao que o plano de evolução listava. O próprio
 * plano pede o progresso agregado — *"3 prontas, 2 gerando, 1 falhou: motivo"*
 * —, o que só existe se a falha for um estado e não um campo solto; e é o mesmo
 * vocabulário que a fila da bancada (`BancadaStatus`) já usa hoje, o que evita
 * duas palavras para a mesma coisa quando as duas superfícies se encontrarem.
 */
export type StatusDoItem =
  /** Como o sistema propôs. Ninguém mexeu ainda. */
  | 'proposto'
  /** Alguém mexeu: mudou copy, horário, foto ou formato. */
  | 'editado'
  /** Liberado para virar arte. */
  | 'aprovado'
  /** Recusado, com motivo — nunca beco sem saída: dá para editar e reenviar. */
  | 'reprovado'
  /** Esperando a fila durável de geração (F0.3). */
  | 'na-fila'
  /** A arte está sendo produzida agora. */
  | 'gerando'
  /** A arte existe e está esperando ir para a agenda. */
  | 'pronto'
  /** A geração falhou. O item continua no plano, retentável. */
  | 'erro'
  /** Virou post na agenda. Daqui em diante quem manda é o post. */
  | 'agendado'

export const STATUS_DO_ITEM: StatusDoItem[] = [
  'proposto',
  'editado',
  'aprovado',
  'reprovado',
  'na-fila',
  'gerando',
  'pronto',
  'erro',
  'agendado',
]

export const STATUS_INICIAL: StatusDoItem = 'proposto'

/**
 * Como cada situação é dita para gente.
 *
 * A regra da casa proíbe jargão de banco na conversa e nas telas (nada de
 * DRAFT/SCHEDULED/pageId), e o mesmo vale aqui: `na-fila` é um valor de coluna,
 * "na fila" é o que a pessoa lê.
 */
export const ROTULO_DO_STATUS: Record<StatusDoItem, string> = {
  proposto: 'proposto',
  editado: 'editado',
  aprovado: 'aprovado',
  reprovado: 'reprovado',
  'na-fila': 'na fila',
  gerando: 'gerando a arte',
  pronto: 'arte pronta',
  erro: 'falhou',
  agendado: 'na agenda',
}

/** O mesmo rótulo no plural, para o progresso agregado. */
const PLURAL_DO_STATUS: Record<StatusDoItem, string> = {
  proposto: 'propostas',
  editado: 'editadas',
  aprovado: 'aprovadas',
  reprovado: 'reprovadas',
  'na-fila': 'na fila',
  gerando: 'gerando',
  pronto: 'prontas',
  erro: 'falharam',
  agendado: 'na agenda',
}

/**
 * Para onde cada situação pode ir.
 *
 * Duas regras de desenho ficam explícitas na tabela:
 *
 *  1. **`reprovado` não é beco.** A reprovação com motivo é um SINAL (o plano
 *     de evolução é literal: "vira transição registrada E sinal, não beco"), e
 *     por isso sempre há caminho de volta — editar e reenviar para a fila.
 *  2. **`agendado` é terminal.** A partir daí a verdade é o post na agenda;
 *     cancelar ou reagendar são ações do POST, não do item do plano. Deixar o
 *     item voltar criaria duas fontes de verdade para a mesma publicação.
 *
 * A ida para `na-fila` é permitida a partir de qualquer situação editável
 * porque é ela que a execução usa — inclusive para RETENTAR o que falhou.
 */
const TRANSICOES: Record<StatusDoItem, StatusDoItem[]> = {
  proposto: ['editado', 'aprovado', 'reprovado', 'na-fila'],
  editado: ['aprovado', 'reprovado', 'na-fila'],
  aprovado: ['editado', 'reprovado', 'na-fila'],
  reprovado: ['editado', 'aprovado', 'na-fila'],
  'na-fila': ['gerando', 'erro', 'reprovado'],
  gerando: ['pronto', 'erro'],
  pronto: ['agendado', 'reprovado', 'na-fila'],
  erro: ['editado', 'aprovado', 'reprovado', 'na-fila'],
  agendado: [],
}

/**
 * `true` quando a mudança de situação faz sentido.
 *
 * Ficar na MESMA situação é permitido de propósito: é no-op, e o retry de uma
 * rota ou a repetição de uma tool no chat não podem virar erro — é o mesmo
 * instinto de idempotência da chave de sugestão da F1.
 */
export function transicaoPermitida(de: StatusDoItem, para: StatusDoItem): boolean {
  if (de === para) return true
  return TRANSICOES[de]?.includes(para) ?? false
}

/**
 * O item ainda pode ter conteúdo alterado?
 *
 * Só antes de a arte existir. `na-fila`, `gerando`, `pronto` e `agendado`
 * recusam: mudar a copy de um item que já está sendo gerado (ou que já virou
 * arte, ou post) faria o plano mentir sobre o que foi produzido — o mesmo
 * defeito que a janela de congelamento resolveu na agenda.
 */
export function itemEditavel(status: StatusDoItem): boolean {
  return (
    status === 'proposto' ||
    status === 'editado' ||
    status === 'aprovado' ||
    status === 'reprovado' ||
    status === 'erro'
  )
}

/** Frase curta explicando por que aquele item não aceita edição. */
export function motivoDeNaoEditavel(status: StatusDoItem): string {
  if (status === 'agendado') return 'este item já virou post na agenda — a mudança agora é lá'
  if (status === 'pronto') return 'a arte deste item já foi criada'
  if (status === 'gerando') return 'a arte deste item está sendo criada agora'
  if (status === 'na-fila') return 'este item já foi enviado para a fila de geração'
  return 'este item não aceita mais edição'
}

// ── Via de criação ──────────────────────────────────────────────────────────

/**
 * Por onde a arte nasce.
 *
 * `template` é o padrão porque é a via MAIS usada e não gasta API de imagem —
 * IA é a exceção, pedida quando nenhum modelo serve.
 */
export type ViaDoItem = 'template' | 'ia'

export const VIAS: Array<{ valor: ViaDoItem; rotulo: string; custo: string }> = [
  {
    valor: 'template',
    rotulo: 'modelo do cliente',
    custo: 'Não gasta crédito de imagem — a arte é montada sobre um modelo já aprovado.',
  },
  {
    valor: 'ia',
    rotulo: 'gerada por IA',
    custo: 'Gasta crédito de imagem a cada arte.',
  },
]

export const VIA_PADRAO: ViaDoItem = 'template'

export function rotuloDaVia(via: ViaDoItem): string {
  return VIAS.find((v) => v.valor === via)?.rotulo ?? via
}

// ── Formato ─────────────────────────────────────────────────────────────────

/** O mesmo vocabulário de formato que a bancada usa. */
export type FormatoDoItem = 'story' | 'feed' | 'quadrado'

export const FORMATOS: FormatoDoItem[] = ['story', 'feed', 'quadrado']

// ── Situação do plano ───────────────────────────────────────────────────────

export type StatusDoPlano = 'ativo' | 'arquivado'

export const STATUS_DO_PLANO: StatusDoPlano[] = ['ativo', 'arquivado']

// ── Normalizadores ──────────────────────────────────────────────────────────

function normalizarTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
  return limpo || null
}

/**
 * Aceita variações de caixa, acento e separador. Devolve `undefined` para
 * valor desconhecido — nunca inventa uma situação: quem chama decide entre
 * cair no padrão e recusar.
 */
export function normalizarStatusDoItem(valor: unknown): StatusDoItem | undefined {
  const limpo = normalizarTexto(valor)
  return STATUS_DO_ITEM.find((s) => s === limpo)
}

export function normalizarVia(valor: unknown): ViaDoItem | undefined {
  const limpo = normalizarTexto(valor)
  return limpo === 'template' || limpo === 'ia' ? limpo : undefined
}

export function normalizarFormato(valor: unknown): FormatoDoItem | undefined {
  const limpo = normalizarTexto(valor)
  return FORMATOS.find((f) => f === limpo)
}

export function normalizarStatusDoPlano(valor: unknown): StatusDoPlano | undefined {
  const limpo = normalizarTexto(valor)
  return STATUS_DO_PLANO.find((s) => s === limpo)
}

// ── Progresso agregado ──────────────────────────────────────────────────────

/**
 * Ordem em que as situações aparecem no resumo: da mais adiantada para a mais
 * atrasada. É o que faz a frase começar pelo que já está pronto, como no
 * exemplo do plano de evolução ("3 prontas, 2 gerando, 1 falhou").
 */
const ORDEM_DO_RESUMO: StatusDoItem[] = [
  'agendado',
  'pronto',
  'gerando',
  'na-fila',
  'aprovado',
  'editado',
  'proposto',
  'reprovado',
  'erro',
]

export interface ProgressoDoPlano {
  total: number
  /** Quantos itens em cada situação. Situação sem item não aparece. */
  porStatus: Partial<Record<StatusDoItem, number>>
  /** Uma frase pronta para o chat e para a tela: "3 prontas, 2 gerando e 1 falhou". */
  frase: string
  /** Nada mais a fazer: todo item terminou (na agenda ou reprovado). */
  concluido: boolean
}

/**
 * O agregado legível de uma leva.
 *
 * Plano vazio não quebra e não devolve frase inventada — devolve "nenhum item",
 * que é a verdade. É o caso do plano recém-criado e do plano cujo último item
 * foi removido, e os dois passam por aqui.
 */
export function progressoDoPlano(
  itens: Array<{ status: string | StatusDoItem }>,
): ProgressoDoPlano {
  const porStatus: Partial<Record<StatusDoItem, number>> = {}
  let total = 0
  let pendentes = 0

  for (const item of itens) {
    const status = normalizarStatusDoItem(item.status)
    // Situação que o vocabulário não conhece não é contada nem inventada — ela
    // é ruído de dado, e somá-la a um balde qualquer mentiria no resumo.
    if (!status) continue
    porStatus[status] = (porStatus[status] ?? 0) + 1
    total += 1
    if (status !== 'agendado' && status !== 'reprovado') pendentes += 1
  }

  const partes = ORDEM_DO_RESUMO.filter((s) => (porStatus[s] ?? 0) > 0).map(
    (s) => `${porStatus[s]} ${PLURAL_DO_STATUS[s]}`,
  )

  return {
    total,
    porStatus,
    frase: frasear(partes),
    concluido: total > 0 && pendentes === 0,
  }
}

function frasear(partes: string[]): string {
  if (partes.length === 0) return 'nenhum item'
  if (partes.length === 1) return partes[0]
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}
