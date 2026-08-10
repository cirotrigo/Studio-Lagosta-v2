/**
 * Os sinais que nascem quando um post entra na agenda: o SLOT (quando
 * publicar) e a COPY (o que a peça diz).
 *
 * Dois pontos escrevem aqui e é de propósito que compartilhem o módulo:
 *
 *   - `agendarPost` — o post nasce (rascunho ou já agendado);
 *   - `processarAprovacao` — um rascunho vira publicação armada.
 *
 * **A linha de slot é a MESMA nos dois**, presa à chave `slot:post:<id>`. Sem
 * essa chave compartilhada, o fluxo normal (criar rascunho → aprovar) gravaria
 * duas linhas para o mesmo horário do mesmo post, e qualquer contagem de
 * cadência passaria a valer o dobro para quem usa a agenda como manda o
 * figurino. Com ela, quem chegar primeiro registra e o segundo é no-op — e a
 * aprovação continua sendo o ponto que fecha a SUGESTÃO de slot, que é outra
 * coisa (ver `fecharSugestaoDeSlot`).
 *
 * ⚠️ Nada aqui lança: contrato de `captura.ts`.
 */

import { registrarDecisaoSemSugestao, registrarDesfecho } from './captura'
import { desfechoPeloDiff, type DiffDeCopy } from './diff-copy'
import type { Superficie } from './vocabulario'

/** Chave de idempotência da decisão de slot de um post. Um post, uma linha. */
export function chaveDoSlot(postId: string): string {
  return `slot:post:${postId}`
}

/** Idem para a copy que foi de fato comprometida no post. */
export function chaveDaCopy(postId: string): string {
  return `copy:post:${postId}`
}

const FUSO = 'America/Sao_Paulo'

/**
 * Quando o post vai ao ar, em horário de Brasília e já quebrado nos campos que
 * a cadência precisa.
 *
 * Guardar o `Date` cru obrigaria todo consumidor a repetir a conversão de fuso
 * — e é assim que aparece "story das 21h" que na verdade é meia-noite UTC.
 */
export function slotEmBrasilia(quando: Date): {
  data: string
  hora: string
  diaDaSemana: string
  iso: string
} {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(quando)
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''
  return {
    data: `${p('year')}-${p('month')}-${p('day')}`,
    hora: `${p('hour')}:${p('minute')}`,
    diaDaSemana: p('weekday'),
    iso: quando.toISOString(),
  }
}

export interface SlotDoPost {
  projectId: number
  postId: string
  quando: Date
  postType: string
  situacao: 'rascunho' | 'agendado'
  pageId?: string | null
  generationId?: string | null
  campaignId?: string | null
  /** A página-MODELO de onde a arte saiu, quando dá para saber. */
  sourcePageId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
}

/**
 * Registra a decisão de horário como **escolha absoluta**.
 *
 * Absoluta porque, hoje, é o que ela é: ninguém propôs o horário — a pessoa (ou
 * o modelo, na conversa) escolheu do zero. Quando a proposta existir e vier
 * pelo `sugestaoId`, quem fecha o ciclo é `fecharSugestaoDeSlot`, e esta linha
 * continua valendo como o registro do que foi comprometido.
 */
export async function registrarSlotDoPost(entrada: SlotDoPost): Promise<void> {
  const slot = slotEmBrasilia(entrada.quando)
  await registrarDecisaoSemSugestao({
    projectId: entrada.projectId,
    tipo: 'slot',
    escolhido: {
      ...slot,
      tipoDePost: entrada.postType,
      situacao: entrada.situacao,
      sourcePageId: entrada.sourcePageId ?? null,
    },
    postId: entrada.postId,
    pageId: entrada.pageId ?? null,
    generationId: entrada.generationId ?? null,
    campaignId: entrada.campaignId ?? null,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'chat',
    chave: chaveDoSlot(entrada.postId),
  })
}

export interface CopyDoPost {
  projectId: number
  postId: string
  /** A copy que foi de fato comprometida (o lado FINAL). */
  copyFinal: Record<string, string> | null
  /** Diff contra a copy proposta na criação, quando existem os dois lados. */
  diff?: DiffDeCopy | null
  pageId?: string | null
  generationId?: string | null
  campaignId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
}

/**
 * Registra a copy comprometida no post.
 *
 * O diff é o que dá valor à linha: ele diz se o texto que foi ao ar é o mesmo
 * que a IA escreveu ou se alguém mexeu — e onde. Diff ILEGÍVEL vira ausência
 * de diff, nunca "não mudou": é a regra central de `diff-copy.ts`, e trocá-la
 * por um `mudou: false` ensinaria ao corpus que a sugestão estava perfeita
 * exatamente nas páginas que ninguém conseguiu ler.
 */
export async function registrarCopyDoPost(entrada: CopyDoPost): Promise<void> {
  if (!entrada.copyFinal || Object.keys(entrada.copyFinal).length === 0) return

  const diff = entrada.diff && !entrada.diff.ilegivel ? entrada.diff : null

  await registrarDecisaoSemSugestao({
    projectId: entrada.projectId,
    tipo: 'copy',
    escolhido: {
      copy: entrada.copyFinal,
      // O veredito legível do diff, para não obrigar todo consumidor a
      // reimplementar `desfechoPeloDiff` em cima do Json.
      ...(diff ? { versusProposta: desfechoPeloDiff(diff) } : {}),
    },
    diff,
    postId: entrada.postId,
    pageId: entrada.pageId ?? null,
    generationId: entrada.generationId ?? null,
    campaignId: entrada.campaignId ?? null,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'chat',
    chave: chaveDaCopy(entrada.postId),
  })
}

/**
 * Fecha a SUGESTÃO de slot que originou o post, quando houve uma.
 *
 * `SocialPost.sugestaoId` guarda o ponteiro desde a F0.2. Quem o preenche é
 * quem emite a proposta (`sugerir-posts`); aqui só se registra o desfecho — e
 * ele pode ser revisto depois, porque a janela do desfecho vai até a
 * publicação (`desfechoVenceOAnterior`).
 *
 * ⚠️ Esta linha é a ÚNICA do slot quando houve proposta: `registrarSlotDoPost`
 * NÃO deve rodar junto. Ela já é o registro completo — traz o que foi
 * proposto, o que foi comprometido e o `contexto` que a outra carregava. Rodar
 * as duas gravava dois sinais para o MESMO horário do MESMO post, um deles
 * rotulado `escolha-propria`, o que é falso quando a pessoa aceitou uma
 * proposta — e dobrava o peso daquele horário na cadência aprendida, ainda por
 * cima misturando a linha que deve valer com desconto (aceite) com a que vale
 * cheio (escolha própria). Achado no teste ponta a ponta de 10/08/2026.
 */
export async function fecharSugestaoDeSlot(entrada: {
  sugestaoId: string
  postId: string
  quando: Date
  desfecho: 'aceita-como-veio' | 'editada' | 'descartada'
  /** O mesmo contexto que `registrarSlotDoPost` grava, para não se perder. */
  contexto?: {
    postType?: string
    situacao?: 'rascunho' | 'agendado'
    sourcePageId?: string | null
  }
  pageId?: string | null
  generationId?: string | null
  campaignId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
}): Promise<void> {
  await registrarDesfecho({
    sugestaoId: entrada.sugestaoId,
    desfecho: entrada.desfecho,
    escolhido: {
      ...slotEmBrasilia(entrada.quando),
      ...(entrada.contexto?.postType ? { tipoDePost: entrada.contexto.postType } : {}),
      ...(entrada.contexto?.situacao ? { situacao: entrada.contexto.situacao } : {}),
      ...(entrada.contexto?.sourcePageId !== undefined
        ? { sourcePageId: entrada.contexto.sourcePageId }
        : {}),
    },
    postId: entrada.postId,
    pageId: entrada.pageId ?? null,
    generationId: entrada.generationId ?? null,
    campaignId: entrada.campaignId ?? null,
    decididoPor: entrada.decididoPor ?? null,
    superficie: entrada.superficie ?? 'agenda',
  })
}
