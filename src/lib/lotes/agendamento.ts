/**
 * O agendamento de um item de LOTE — módulo PURO (zod, `node:crypto` e módulos
 * sem Prisma), com teste. PR 12 de "Marca simples, copy melhor" (12/09/2026):
 * do lote até os rascunhos.
 *
 * O PR 11 deu identidade durável à PEÇA (`ItemDeLote`). Faltava o passo
 * seguinte: nada impedia a mesma peça composta de virar dois rascunhos —
 * `agendarPost` não tem guarda, e `agenda-das-paginas` faz check-then-act sem
 * trava. Aqui mora a decisão, dada a linha do item, o post que ela aponta, a
 * peça e a página; a ordem das escritas mora em `agendar-itens.ts`.
 *
 * Decisões de produto (12/09/2026), registradas no CLAUDE.md:
 *  - **O hash é do PEDIDO, como foi feito na primeira vez** (horário, tipo,
 *    legenda, lembrete, escopo, campanha — já normalizados). Repetir o mesmo
 *    pedido devolve o rascunho que existe MESMO que a equipe o tenha remarcado
 *    ou editado depois: a edição da equipe vence e nunca é revertida. Outro
 *    pedido sob a mesma chave é `LOTE_AGENDAMENTO_CONFLITO`, item a item.
 *  - **Post apagado não volta SOZINHO** (decisão do Ciro, 13/09/2026): o item
 *    responde `POST_REMOVIDO` com o que o chat precisa para contar à pessoa
 *    (`rascunhoApagado`: dia e horário, tema, manchete), e o rascunho só volta
 *    quando ela confirma — `recriarRascunhoApagado: true` NAQUELE item, com o
 *    pedido original. Repetir a confirmação não cria um segundo rascunho: a
 *    linha passa a apontar o recriado.
 *  - **Só se ADOTA rascunho ou agendado** que já tenha a mesma página. Página
 *    que já foi a um post em outra situação (publicando, publicado, falhou) não
 *    ganha segundo post — isso seria publicar duas vezes (`PAGINA_JA_EM_POST`).
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonico } from '@/lib/copy-autoral/revisao'
import { formatarBRT, parseBRT } from '@/lib/creatives/data-brt'
import { ESCOPO_PADRAO, normalizarEscopo, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import { ROTULO_DO_STATUS, normalizarStatusDoItem } from '@/lib/planos/vocabulario'
import { itemExecutavel } from '@/lib/planos/execucao'
import type { EstadoDaPecaDoItem } from '@/lib/planos/decisao-do-item'
import { validarIdentidadeDeLote } from './identidade'

/** Mudou a normalização do pedido? Suba a versão — e trate o hash antigo como o PR 11 trata o dele. */
export const VERSAO_DO_AGENDAMENTO = 'agendamento-v1'
export const MAX_ITENS_DO_AGENDAMENTO = 60

export type FormatoDaPeca = 'story' | 'feed' | 'quadrado'
export type TipoDoPostDoLote = 'STORY' | 'POST'

/**
 * 🔴 `agendarPost` NÃO infere o tipo pelo tamanho: sem `postType` ele grava
 * STORY. O tipo do lote sai SEMPRE do formato da peça (ou do pedido explícito).
 */
export const TIPO_DO_POST_POR_FORMATO: Record<FormatoDaPeca, TipoDoPostDoLote> = { story: 'STORY', feed: 'POST', quadrado: 'POST' }

export const itemDoAgendamentoSchema = z
  .object({
    itemId: z.string(),
    quando: z.string().trim().min(1).optional(),
    postType: z.enum(['STORY', 'POST']).optional(),
    caption: z.string().max(2200).optional(),
    lembrete: z.boolean().optional(),
    escopo: z.enum(['rotina', 'campanha', 'pontual']).optional(),
    campanhaId: z.string().trim().min(1).max(120).optional(),
    /**
     * A CONFIRMAÇÃO da pessoa para recriar o rascunho que a equipe apagou
     * (decisão do Ciro, 13/09/2026). Não é pedido — fica fora do hash — e só
     * vale o booleano `true` literal: qualquer outra coisa não recria.
     */
    recriarRascunhoApagado: z.boolean().optional(),
  })
  .strict()
export type ItemDoAgendamento = z.infer<typeof itemDoAgendamentoSchema>

const CHAVES_DO_ITEM = new Set(Object.keys(itemDoAgendamentoSchema.shape))

/** Um item da leva: o pedido, e a falha DELE quando um campo do pedido é inválido. */
export interface ItemValidado {
  item: ItemDoAgendamento
  falha: FalhaDoItem | null
}

/**
 * A leva validada. Duas camadas, de propósito (pré-revisão C12-1c):
 *  - **a IDENTIDADE da leva é conferida inteira antes de tocar qualquer item** —
 *    loteId, itemId válido e único, nenhuma chave desconhecida, 1 a 60 itens.
 *    Qualquer problema aqui recusa a chamada (mesma regra de `compor-leva`:
 *    metade agendada e metade recusada é a retomada que a identidade evita);
 *  - **campo do PEDIDO inválido é problema DO ITEM** (`quando` vazio ou
 *    ilegível, legenda longa demais, campanha vazia): o item volta `falhou` e os
 *    outros seguem. Antes, um `quando: ""` recusava a leva INTEIRA com um erro
 *    que falava em "identidade".
 */
export function validarAgendamentoDoLote(
  loteId: unknown,
  itens: unknown,
): { loteId: string; itens: ItemValidado[]; problemas: [] } | { loteId: null; itens: null; problemas: string[] } {
  const problemas: string[] = []
  if (!Array.isArray(itens) || itens.length === 0) problemas.push('itens: mande pelo menos um item')
  else if (itens.length > MAX_ITENS_DO_AGENDAMENTO) problemas.push(`itens: no máximo ${MAX_ITENS_DO_AGENDAMENTO} por chamada`)
  const validos: ItemValidado[] = []
  let loteNormalizado: string | null = null
  const vistos = new Map<string, number>()
  for (const [indice, bruto] of (Array.isArray(itens) ? itens : []).entries()) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
      problemas.push(`itens.${indice}: cada item é um objeto com itemId`)
      continue
    }
    const campos = bruto as Record<string, unknown>
    const desconhecidas = Object.keys(campos).filter((k) => !CHAVES_DO_ITEM.has(k))
    if (desconhecidas.length > 0) {
      problemas.push(`itens.${indice}: chave desconhecida (${desconhecidas.join(', ')})`)
      continue
    }
    const id = validarIdentidadeDeLote({ loteId, itemId: campos.itemId })
    if (!id.identidade) {
      for (const p of id.problemas) problemas.push(p.startsWith('itemId') ? `itens.${indice}.${p}` : p)
      continue
    }
    loteNormalizado = id.identidade.loteId
    const itemId = id.identidade.itemId
    const anterior = vistos.get(itemId)
    if (anterior !== undefined) {
      problemas.push(`itens.${indice}.itemId: "${itemId}" repete o item ${anterior} — cada peça é agendada uma vez por chamada`)
      continue
    }
    vistos.set(itemId, indice)

    const r = itemDoAgendamentoSchema.safeParse({ ...campos, itemId })
    if (!r.success) {
      const doQuando = r.error.issues.some((p) => p.path[0] === 'quando')
      validos.push({
        item: { itemId },
        falha: doQuando
          ? { codigo: 'DATA_INVALIDA', motivo: `O horário deste item veio vazio ou ilegível — use "AAAA-MM-DD HH:mm" (Brasília) ou ISO com fuso, ou omita o quando para valer o horário da composição. Nada foi alterado para este item.` }
          : { codigo: 'PEDIDO_INVALIDO', motivo: `Pedido inválido para este item — ${r.error.issues.map((p) => `${p.path.join('.') || '(item)'}: ${p.message}`).join('; ')}. Nada foi alterado para este item.` },
      })
      continue
    }
    if (r.data.quando !== undefined) {
      try {
        parseBRT(r.data.quando)
      } catch {
        validos.push({ item: r.data, falha: { codigo: 'DATA_INVALIDA', motivo: `O horário "${r.data.quando}" não é data — use "AAAA-MM-DD HH:mm" (Brasília) ou ISO com fuso. Nada foi alterado para este item.` } })
        continue
      }
    }
    validos.push({ item: r.data, falha: null })
  }
  if (problemas.length > 0 || !loteNormalizado) {
    return { loteId: null, itens: null, problemas: Array.from(new Set(problemas.length ? problemas : ['loteId: inválido'])) }
  }
  return { loteId: loteNormalizado, itens: validos, problemas: [] }
}

/** O pedido de agendamento normalizado — é ele que vira o hash. */
export interface PedidoDeAgendamento {
  /** O instante, em ISO UTC: "2026-09-14 19:00" (Brasília) e o ISO equivalente são o MESMO pedido. */
  quando: string
  postType: TipoDoPostDoLote
  caption: string
  lembrete: boolean
  escopo: EscopoAprendizado
  campanhaId: string | null
}

export interface FalhaDoItem {
  codigo: string
  motivo: string
}

/**
 * O pedido EFETIVO: o que veio no item, completado pelo que a peça sabe (o
 * horário previsto na spec, o formato). É o efetivo que entra no hash, então
 * omitir o tipo e depois mandá-lo igual ao do formato é o mesmo pedido.
 */
export function pedidoDoAgendamento(
  item: ItemDoAgendamento,
  peca: { quandoDaSpec: string | null; formato: FormatoDaPeca | null },
): { pedido: PedidoDeAgendamento; avisos: string[] } | { falha: FalhaDoItem } {
  const bruto = item.quando ?? peca.quandoDaSpec
  if (!bruto) {
    return { falha: { codigo: 'SEM_HORARIO', motivo: 'Esta peça não tem horário previsto na composição — mande o quando do item.' } }
  }
  let instante: Date
  try {
    instante = parseBRT(bruto)
  } catch {
    return { falha: { codigo: 'DATA_INVALIDA', motivo: `O horário "${bruto}" não é data reconhecida.` } }
  }
  const doFormato = peca.formato ? TIPO_DO_POST_POR_FORMATO[peca.formato] : null
  const postType = item.postType ?? doFormato
  if (!postType) return { falha: { codigo: 'SEM_FORMATO', motivo: 'Não deu para saber o formato da peça — mande o postType do item.' } }
  const avisos: string[] = []
  if (item.postType && doFormato && item.postType !== doFormato) {
    avisos.push(`O pedido diz ${item.postType}, mas a peça é ${peca.formato} — agendei como ${item.postType}, confira.`)
  }
  const campanhaId = item.campanhaId ?? null
  return {
    pedido: {
      quando: instante.toISOString(),
      postType,
      caption: item.caption ?? '',
      lembrete: item.lembrete === true,
      escopo: normalizarEscopo(item.escopo) ?? (campanhaId ? 'CAMPANHA' : ESCOPO_PADRAO),
      campanhaId,
    },
    avisos,
  }
}

/** `agendamento-v1:<sha256 do JSON canônico>`. */
export function hashDoAgendamento(pedido: PedidoDeAgendamento): string {
  return `${VERSAO_DO_AGENDAMENTO}:${createHash('sha256').update(canonico(pedido)).digest('hex')}`
}

/**
 * O rascunho que a equipe apagou, como o chat o descreve à pessoa (decisão do
 * Ciro, 13/09/2026): dia e horário em Brasília, o tema e a manchete da peça.
 */
export interface RascunhoApagado {
  /** "dd/mm/aaaa, hh:mm" em Brasília — o horário do pedido original; nulo quando não dá para montar. */
  quando: string | null
  tema: string | null
  manchete: string | null
}

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const semColchetes = (linha: string) => linha.replace(/[[\]]/g, '')

/**
 * A manchete da peça, lida da SPEC: os blocos por papel e, sem eles, o contrato
 * da copy autoral. Os colchetes de destaque saem — é o texto como a pessoa o lê.
 */
export function mancheteDaSpec(spec: unknown): string | null {
  const s = spec && typeof spec === 'object' ? (spec as Record<string, unknown>) : {}
  const daLista = (blocos: unknown, chave: 'papel' | 'funcao') => {
    if (!Array.isArray(blocos)) return null
    const bloco = blocos.find((b) => b && typeof b === 'object' && (b as Record<string, unknown>)[chave] === 'headline') as { linhas?: unknown } | undefined
    const linhas = Array.isArray(bloco?.linhas) ? bloco!.linhas.filter((l): l is string => typeof l === 'string') : []
    return texto(linhas.map(semColchetes).join(' ').replace(/\s+/g, ' '))
  }
  const autoral = s.copyAutoral && typeof s.copyAutoral === 'object' ? (s.copyAutoral as Record<string, unknown>).blocos : undefined
  return daLista(s.blocos, 'papel') ?? daLista(autoral, 'funcao')
}

/**
 * O rascunho que a equipe apagou, para o chat contar à pessoa qual era.
 *
 * 🔴 O horário é o do agendamento ORIGINAL, e a linha do lote guarda dele só o
 * HASH (R12-05 da revisão final do PR 12). O pedido desta chamada só
 * serve quando o hash dele É o da linha — a repetição do mesmo pedido. Pedido
 * diferente (a pessoa pediu 21h para o que estava às 19h), ilegível ou ausente
 * não prova nada, e o horário sai `null`: anunciar o horário da tentativa como
 * o do rascunho apagado identifica o rascunho errado. O `quando` da spec também
 * não serve — o pedido original pode tê-lo trocado.
 */
export function descreverRascunhoApagado(entrada: { pedido: PedidoDeAgendamento | null; hashDoOriginal: string | null; tema: string | null; manchete: string | null }): RascunhoApagado {
  let quando: string | null = null
  try {
    const original = entrada.pedido && entrada.hashDoOriginal && hashDoAgendamento(entrada.pedido) === entrada.hashDoOriginal ? entrada.pedido : null
    if (original) quando = formatarBRT(new Date(original.quando))
  } catch {
    quando = null
  }
  return { quando, tema: texto(entrada.tema), manchete: texto(entrada.manchete) }
}

/** Decisão do Ciro (13/09/2026): avisar e perguntar — nunca recriar em silêncio. */
export const MOTIVO_POST_REMOVIDO =
  'O rascunho que esta leva tinha posto na agenda para este item foi apagado pela equipe — nada foi recriado. Conte à pessoa qual era (em rascunhoApagado: dia e horário, tema ou manchete) e pergunte se ela quer esse rascunho de volta. Só se ela confirmar, repita a chamada com recriarRascunhoApagado: true neste item: ele volta como rascunho, com a mesma arte da leva.'

export const MOTIVO_RECRIAR_COM_OUTRO_PEDIDO =
  'O rascunho apagado deste item só volta com o pedido original (o mesmo horário, tipo, legenda, lembrete, escopo e campanha), e esta chamada pede outro — nada foi criado. Repita com o pedido original e recriarRascunhoApagado: true; depois de ele voltar, a equipe muda o que quiser na agenda.'

export type DecisaoDoAgendamento =
  | { acao: 'reaproveitar'; efeitosPendentes: boolean }
  | { acao: 'recriar'; postApagado: string }
  | { acao: 'agendar' }
  | { acao: 'pendente'; codigo: string; motivo: string }
  | { acao: 'falhar'; codigo: string; motivo: string }

/**
 * A decisão do item, sem trava — e de novo sob a trava, com a linha relida.
 * Ordem: o post que a linha já aponta manda (apagado → nunca recria; mesmo
 * pedido → reaproveita; outro pedido → conflito); sem post, a peça precisa
 * existir pronta, com página editável que não seja modelo nem slide.
 */
export function decidirAgendamento(entrada: {
  registro: { postId: string | null; hashDoAgendamento: string | null; efeitosDoAgendamentoEm: Date | string | null }
  /** Só conta quando a linha aponta um post: ele ainda existe? */
  postLigadoExiste: boolean
  pedido: { hash: string } | { falha: FalhaDoItem }
  peca: { status: string | null; pageId: string | null; slide: boolean } | null
  pagina: { ehModelo: boolean } | null
  /** A confirmação da pessoa para recriar o rascunho apagado. Só o booleano `true` vale. */
  recriarApagado?: unknown
}): DecisaoDoAgendamento {
  const { registro, pedido, peca, pagina } = entrada
  if (registro.postId) {
    if (!entrada.postLigadoExiste) {
      if (entrada.recriarApagado !== true) return { acao: 'falhar', codigo: 'POST_REMOVIDO', motivo: MOTIVO_POST_REMOVIDO }
      // Confirmado: o rascunho volta, mas só com o pedido de antes — a mesma
      // chave com outro pedido continua conflito, apagado ou não.
      if ('falha' in pedido) return { acao: 'falhar', ...pedido.falha }
      if (pedido.hash !== registro.hashDoAgendamento) return { acao: 'falhar', codigo: 'LOTE_AGENDAMENTO_CONFLITO', motivo: MOTIVO_RECRIAR_COM_OUTRO_PEDIDO }
      return { acao: 'recriar', postApagado: registro.postId }
    }
    if ('falha' in pedido) return { acao: 'falhar', ...pedido.falha }
    if (pedido.hash !== registro.hashDoAgendamento) {
      return {
        acao: 'falhar',
        codigo: 'LOTE_AGENDAMENTO_CONFLITO',
        motivo: 'Este item já foi agendado com outro pedido (horário, tipo, legenda, lembrete, escopo ou campanha). Nada foi alterado — repita o pedido original, ou mude o post direto na agenda.',
      }
    }
    return { acao: 'reaproveitar', efeitosPendentes: !registro.efeitosDoAgendamentoEm }
  }
  if (!peca || !peca.status) return { acao: 'falhar', codigo: 'PECA_AUSENTE', motivo: 'Este item não tem peça composta — componha com compor-leva antes de agendar.' }
  if (peca.status === 'FAILED') return { acao: 'falhar', codigo: 'PECA_FALHOU', motivo: 'A composição desta peça falhou — repita compor-leva com o mesmo item para refazê-la.' }
  if ('falha' in pedido) return { acao: 'falhar', ...pedido.falha }
  if (peca.status !== 'COMPLETED') return { acao: 'pendente', codigo: 'PECA_EM_ANDAMENTO', motivo: 'A peça ainda está sendo composta — repita esta chamada em alguns minutos.' }
  if (!peca.pageId) return { acao: 'falhar', codigo: 'SEM_PAGINA', motivo: 'A peça pronta não tem página editável.' }
  if (!pagina) return { acao: 'falhar', codigo: 'PAGINA_NAO_ENCONTRADA', motivo: 'A página desta peça não existe mais.' }
  if (pagina.ehModelo) return { acao: 'falhar', codigo: 'PAGINA_MODELO', motivo: 'A página desta peça virou modelo — modelo não vai para a agenda como post.' }
  if (peca.slide) {
    return { acao: 'falhar', codigo: 'SLIDE_DE_CARROSSEL', motivo: 'Esta peça é slide de carrossel — ela vai ao ar dentro do post do carrossel, não sozinha.' }
  }
  return { acao: 'agendar' }
}

/**
 * A arte desta peça já está em algum post que NÃO é da página dela: com mais de
 * uma mídia é slide de carrossel montado sem declarar; com uma só é a mesma
 * peça agendada por `generationId` — sem página editável, e agendá-la de novo
 * duplicaria a publicação.
 */
export function decidirMidiaEmOutroPost(posts: Array<{ id: string; mediaUrls: string[] }>): (FalhaDoItem & { postId: string }) | null {
  const carrossel = posts.find((p) => p.mediaUrls.length > 1)
  if (carrossel) {
    return { codigo: 'SLIDE_DE_CARROSSEL', postId: carrossel.id, motivo: 'A arte desta peça já é slide de um carrossel na agenda — ela vai ao ar dentro dele, não sozinha.' }
  }
  const unico = posts[0]
  if (unico) {
    return { codigo: 'PECA_JA_NA_AGENDA', postId: unico.id, motivo: 'A arte desta peça já está num post da agenda (agendado sem a página). Não crio outro para não publicar duas vezes.' }
  }
  return null
}

const ADOTAVEIS = new Set(['DRAFT', 'SCHEDULED'])

/** Os posts que já têm a página da peça: adota, cria ou recusa. */
export function decidirPostsDaPagina(
  posts: Array<{ id: string; status: string }>,
  ligadosAOutroItem: ReadonlySet<string>,
): { acao: 'adotar'; postId: string } | { acao: 'criar' } | ({ acao: 'falhar'; postId: string } & FalhaDoItem) {
  if (posts.length === 0) return { acao: 'criar' }
  const livre = posts.find((p) => ADOTAVEIS.has(p.status) && !ligadosAOutroItem.has(p.id))
  if (livre) return { acao: 'adotar', postId: livre.id }
  const deOutro = posts.find((p) => ADOTAVEIS.has(p.status))
  if (deOutro) {
    return { acao: 'falhar', postId: deOutro.id, codigo: 'POST_DE_OUTRO_ITEM', motivo: 'A página desta peça já está num post da agenda (rascunho ou agendado) que pertence a outro item do lote.' }
  }
  return { acao: 'falhar', postId: posts[0].id, codigo: 'PAGINA_JA_EM_POST', motivo: 'A página desta peça já foi a um post que está publicando, publicado ou falhou — não crio outro para não publicar duas vezes.' }
}

/** O item do plano ligado à peça, como a decisão precisa dele. */
export interface ItemDoPlanoDaPeca {
  status: string
  generationId: string | null
  postId: string | null
}

/**
 * Peça superada no plano (decisão do Ciro, 13/09/2026): continua sem criar
 * nada, e a resposta diz qual é a arte atual (o serviço preenche
 * `arteAtualDoItem`) e manda o chat perguntar.
 */
export const MOTIVO_ARTE_MAIS_NOVA =
  'O item do plano desta peça já tem outra arte, mais recente (em arteAtualDoItem: quando foi feita e se está pronta ou em produção) — esta não vai para a agenda e nada foi criado. Conte à pessoa e pergunte o que ela quer: manter a arte atual (agendá-la pela página dela quando estiver pronta) ou refazer com o conteúdo atual do item (releia com ver-plano, componha com outro itemId e a itemRevisao atual, e agende essa peça). Não agende nem refaça sem ela pedir.'

/**
 * A peça ainda é a que o PLANO quer na agenda? (pré-revisão C12-1)
 *
 * A peça de lote nascida de um item de plano só vai para a agenda quando o item
 * aponta ESTA peça (`generationId`) e está `pronto` — ou já está `agendado` com
 * o MESMO post que esta chamada liga (repetição, adoção). Qualquer outro estado
 * quer dizer que a pessoa mexeu no item depois da peça: reprovou (`reprovado`),
 * reabriu para editar (`editado`/`aprovado`, que mantêm o `generationId` antigo)
 * ou mandou refazer (outra Generation, ou `na-fila`/`gerando`). Agendar aí
 * publicaria a arte superada e fecharia o item em `agendado`, que é TERMINAL —
 * a reprovação sumiria do plano e a refação em voo ficaria órfã.
 *
 * Peça sem item de plano: nada a conferir.
 *
 * Item `na-fila`/`gerando` que JÁ aponta esta peça pronta é `pendente`
 * (`ITEM_DO_PLANO_EM_VOO`), nunca falha (pré-revisão C12-1x1): a fila fecha a
 * Generation dentro da composição e só DEPOIS reaponta o item para `pronto` —
 * nesse meio-tempo ninguém reabriu nada, e repetir a chamada resolve.
 */
export function decidirItemDoPlano(entrada: {
  itemDePlanoId: string | null
  item: ItemDoPlanoDaPeca | null
  pecaId: string
  /** O post que esta chamada vai ligar: o adotado, ou `null` quando vai criar. */
  postQueSeraLigado: string | null
  /**
   * Recriando o rascunho apagado (confirmado pela pessoa): o item `agendado`
   * que ainda aponta o post APAGADO é o mesmo agendamento voltando, não outro.
   */
  postApagado?: string | null
}): (FalhaDoItem & { pendente?: true; superadaPor?: string }) | null {
  if (!entrada.itemDePlanoId) return null
  const { item } = entrada
  if (!item) {
    return { codigo: 'ITEM_DO_PLANO_AUSENTE', motivo: 'O item do plano desta peça não existe mais — confira o plano antes de agendar.' }
  }
  if (item.generationId !== entrada.pecaId) {
    if (item.generationId) return { codigo: 'PECA_SUPERADA_NO_PLANO', superadaPor: item.generationId, motivo: MOTIVO_ARTE_MAIS_NOVA }
    return { codigo: 'PECA_SUPERADA_NO_PLANO', motivo: 'O item do plano desta peça foi reaberto e não aponta mais arte nenhuma — esta não vai para a agenda e nada foi criado. Confira o plano com a pessoa antes de agendar.' }
  }
  const status = normalizarStatusDoItem(item.status)
  if (status === 'pronto') return null
  if (status === 'agendado') {
    if (item.postId && item.postId === entrada.postQueSeraLigado) return null
    if (item.postId && entrada.postApagado && item.postId === entrada.postApagado) return null
    return { codigo: 'ITEM_DO_PLANO_JA_AGENDADO', motivo: 'O item do plano desta peça já foi para a agenda por outro post — não crio um segundo.' }
  }
  if (status === 'reprovado') {
    return { codigo: 'PECA_SUPERADA_NO_PLANO', motivo: 'A arte desta peça foi reprovada no plano — ela não vai para a agenda. Refaça o item antes de agendar.' }
  }
  if (status === 'na-fila' || status === 'gerando') {
    return { codigo: 'ITEM_DO_PLANO_EM_VOO', pendente: true, motivo: 'A peça está pronta, mas o item do plano ainda não saiu da fila — repita esta chamada em alguns minutos.' }
  }
  return {
    codigo: 'PECA_SUPERADA_NO_PLANO',
    motivo: `O item do plano desta peça foi reaberto depois dela (está "${status ? ROTULO_DO_STATUS[status] : item.status}") — agende quando a arte nova estiver pronta.`,
  }
}

/**
 * A peça desta linha NÃO SERVE (não existe, sumiu ou falhou) e o pedido dela
 * nasceu de um item de plano. Se o item está pronto, agendado ou em produção
 * com OUTRA arte viva ou pronta, a compor-leva repetida recusa o pedido como
 * SUPERADO — é a linha 4a da tabela do plano (PR 11), a mesma condição daqui.
 * Mandar "componha com compor-leva" levaria de volta à mesma recusa; a
 * resposta é a da peça superada (Ciro, 13/09/2026): informa a arte atual e o
 * chat pergunta. Em qualquer outro estado a compor-leva produz, ou a recusa
 * dela diz a saída, e vale a resposta da própria peça (`PECA_AUSENTE`,
 * `PECA_FALHOU`).
 *
 * ponytail: não compara o pedido da linha com o da arte do item (a linha 3 da
 * tabela reaproveita quando é o MESMO pedido, na mesma revisão). Nesse caso raro
 * a pergunta é desnecessária, mas "manter a arte atual" é o desfecho certo.
 */
export function superadaNoPlanoSemPeca(entrada: { item: ItemDoPlanoDaPeca | null; pecaDoItem: EstadoDaPecaDoItem }): (FalhaDoItem & { superadaPor: string }) | null {
  const { item } = entrada
  if (!item?.generationId) return null
  const status = normalizarStatusDoItem(item.status)
  if (!status || status === 'reprovado' || itemExecutavel(status)) return null
  if (entrada.pecaDoItem !== 'viva' && entrada.pecaDoItem !== 'pronta') return null
  return { codigo: 'PECA_SUPERADA_NO_PLANO', superadaPor: item.generationId, motivo: MOTIVO_ARTE_MAIS_NOVA }
}

/**
 * "Imagem atual": o PNG em `Page.thumbnail` só serve como a arte do rascunho
 * quando é a PEÇA que o lote produziu — o `resultUrl` da Generation — E a
 * página ainda está na VERSÃO VISUAL que esse PNG desenhou: dimensões, fundo e
 * camadas (`versaoDaPagina`), gravada junto do PNG em
 * `fieldValues.versaoRenderizada` por quem o renderizou
 * (`renderPageAndRegister`, a recomposição). Comparar só as camadas com o
 * `layersSnapshot` aceitava a página redimensionada ou com outro fundo pelo
 * PATCH, e o rascunho nascia RENDERED com o PNG velho (R12-01). Qualquer
 * dúvida (arte sem o registro, página ilegível) vira `false`: o post nasce
 * PENDING e o cron de render desenha a página como ela está — refazer é
 * barato, publicar a arte velha não.
 */
export function thumbnailEhAtual(entrada: {
  thumbnail: string | null
  resultUrl: string | null
  pagina: { width: number; height: number; background?: string | null; layers: unknown }
  versaoRenderizada: unknown
}): boolean {
  const { thumbnail, resultUrl } = entrada
  if (!thumbnail || thumbnail.startsWith('data:') || !resultUrl || thumbnail !== resultUrl) return false
  if (typeof entrada.versaoRenderizada !== 'string' || !entrada.versaoRenderizada) return false
  // Ilegível devolve null, que nunca é igual a uma versão gravada.
  return versaoDaPagina(entrada.pagina) === entrada.versaoRenderizada
}

export type SituacaoDoItemAgendado = 'concluido' | 'pendente' | 'falhou'

/**
 * O que o post do item É AGORA, em português (R12-06). O lote cria rascunho,
 * mas ADOTA post agendado e, na repetição, devolve o post como a equipe o
 * deixou — aprovado, publicado ou que falhou. Chamar tudo de "rascunho" dizia
 * à pessoa que nada publicaria antes de aprovar-rascunhos, com o post já
 * programado.
 */
export type EstadoDoPost = 'rascunho' | 'agendado' | 'publicando' | 'publicado' | 'falha-na-publicacao'
const ESTADO_DO_POST: Record<string, EstadoDoPost> = { DRAFT: 'rascunho', SCHEDULED: 'agendado', POSTING: 'publicando', POSTED: 'publicado', FAILED: 'falha-na-publicacao' }
export function estadoDoPost(status: string): EstadoDoPost | null {
  return ESTADO_DO_POST[status] ?? null
}
/** `recriado`: o rascunho que a equipe apagou voltou, com a confirmação da pessoa (Ciro, 13/09/2026). */
export type DesfechoDoItemAgendado = 'criado' | 'adotado' | 'reaproveitado' | 'recriado'

export function resumirAgendamento(itens: Array<{ situacao: SituacaoDoItemAgendado }>): { concluidos: number; pendentes: number; falhas: number } {
  return {
    concluidos: itens.filter((i) => i.situacao === 'concluido').length,
    pendentes: itens.filter((i) => i.situacao === 'pendente').length,
    falhas: itens.filter((i) => i.situacao === 'falhou').length,
  }
}
