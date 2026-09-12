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
 *  - **Post apagado não volta**: quem apagou decidiu (`POST_REMOVIDO`).
 *  - **Só se ADOTA rascunho ou agendado** que já tenha a mesma página. Página
 *    que já foi a um post em outra situação (publicando, publicado, falhou) não
 *    ganha segundo post — isso seria publicar duas vezes (`PAGINA_JA_EM_POST`).
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonico } from '@/lib/copy-autoral/revisao'
import { parseBRT } from '@/lib/creatives/data-brt'
import { ESCOPO_PADRAO, normalizarEscopo, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import { lerCamadas } from '@/lib/posts/page-layers'
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
  })
  .strict()
export type ItemDoAgendamento = z.infer<typeof itemDoAgendamentoSchema>

/**
 * A leva inteira validada, ou a lista de problemas. Conferida ANTES de tocar
 * qualquer item — mesma regra de `compor-leva`: metade agendada e metade
 * recusada é a retomada que a identidade existe para evitar.
 */
export function validarAgendamentoDoLote(
  loteId: unknown,
  itens: unknown,
): { loteId: string; itens: ItemDoAgendamento[]; problemas: [] } | { loteId: null; itens: null; problemas: string[] } {
  const problemas: string[] = []
  if (!Array.isArray(itens) || itens.length === 0) problemas.push('itens: mande pelo menos um item')
  else if (itens.length > MAX_ITENS_DO_AGENDAMENTO) problemas.push(`itens: no máximo ${MAX_ITENS_DO_AGENDAMENTO} por chamada`)
  const validos: ItemDoAgendamento[] = []
  let loteNormalizado: string | null = null
  const vistos = new Map<string, number>()
  for (const [indice, bruto] of (Array.isArray(itens) ? itens : []).entries()) {
    const r = itemDoAgendamentoSchema.safeParse(bruto)
    if (!r.success) {
      for (const p of r.error.issues) problemas.push(`itens.${indice}.${p.path.join('.') || '(item)'}: ${p.message}`)
      continue
    }
    const id = validarIdentidadeDeLote({ loteId, itemId: r.data.itemId })
    if (!id.identidade) {
      for (const p of id.problemas) problemas.push(p.startsWith('itemId') ? `itens.${indice}.${p}` : p)
      continue
    }
    loteNormalizado = id.identidade.loteId
    const anterior = vistos.get(id.identidade.itemId)
    if (anterior !== undefined) {
      problemas.push(`itens.${indice}.itemId: "${id.identidade.itemId}" repete o item ${anterior} — cada peça é agendada uma vez por chamada`)
      continue
    }
    vistos.set(id.identidade.itemId, indice)
    if (r.data.quando !== undefined) {
      try {
        parseBRT(r.data.quando)
      } catch {
        problemas.push(`itens.${indice}.quando: "${r.data.quando}" não é data — use "AAAA-MM-DD HH:mm" (Brasília) ou ISO com fuso`)
        continue
      }
    }
    validos.push({ ...r.data, itemId: id.identidade.itemId })
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

export type DecisaoDoAgendamento =
  | { acao: 'reaproveitar'; efeitosPendentes: boolean }
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
}): DecisaoDoAgendamento {
  const { registro, pedido, peca, pagina } = entrada
  if (registro.postId) {
    if (!entrada.postLigadoExiste) {
      return { acao: 'falhar', codigo: 'POST_REMOVIDO', motivo: 'O rascunho deste item foi apagado da agenda — não recrio o que alguém removeu. Para voltar, agende a peça à mão.' }
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
    return { acao: 'falhar', postId: deOutro.id, codigo: 'POST_DE_OUTRO_ITEM', motivo: 'A página desta peça já está num rascunho que pertence a outro item do lote.' }
  }
  return { acao: 'falhar', postId: posts[0].id, codigo: 'PAGINA_JA_EM_POST', motivo: 'A página desta peça já foi a um post que está publicando, publicado ou falhou — não crio outro para não publicar duas vezes.' }
}

/**
 * "Imagem atual": o PNG em `Page.thumbnail` só serve como a arte do rascunho
 * quando é a PEÇA que o lote produziu — o `resultUrl` da Generation — E a
 * página ainda é a que o compositor pousou (as camadas iguais ao
 * `layersSnapshot`). O PATCH de camada avulsa grava camadas sem refazer o
 * thumbnail, e aí o rascunho nasceria RENDERED com o PNG velho. Qualquer dúvida
 * (sem snapshot, página ilegível) vira `false`: o post nasce PENDING e o cron
 * de render desenha a página como ela está — refazer é barato, publicar a arte
 * velha não.
 */
export function thumbnailEhAtual(entrada: { thumbnail: string | null; resultUrl: string | null; camadasDaPagina: unknown; snapshot: unknown }): boolean {
  const { thumbnail, resultUrl } = entrada
  if (!thumbnail || thumbnail.startsWith('data:') || !resultUrl || thumbnail !== resultUrl) return false
  if (entrada.snapshot === undefined || entrada.snapshot === null) return false
  const pagina = lerCamadas(entrada.camadasDaPagina)
  const snapshot = lerCamadas(entrada.snapshot)
  if (!pagina.legivel || !snapshot.legivel) return false
  return canonico(pagina.camadas) === canonico(snapshot.camadas)
}

export type SituacaoDoItemAgendado = 'concluido' | 'pendente' | 'falhou'
export type DesfechoDoItemAgendado = 'criado' | 'adotado' | 'reaproveitado'

export function resumirAgendamento(itens: Array<{ situacao: SituacaoDoItemAgendado }>): { concluidos: number; pendentes: number; falhas: number } {
  return {
    concluidos: itens.filter((i) => i.situacao === 'concluido').length,
    pendentes: itens.filter((i) => i.situacao === 'pendente').length,
    falhas: itens.filter((i) => i.situacao === 'falhou').length,
  }
}
