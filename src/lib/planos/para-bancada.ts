/**
 * Tradução entre o ITEM DE PLANO (servidor) e o CARD da bancada (navegador).
 *
 * A fila da bancada nasceu em `localStorage` e nenhuma rota escrevia nela: o
 * que o chat combinava e o que a bancada produzia eram duas levas diferentes,
 * cada uma cega para a outra. Este módulo é a costura — o item do plano vira um
 * card, o card carrega de volta o `itemDePlanoId`, e é por ele que os dois
 * lados se reconhecem.
 *
 * ⚠️ Módulo PURO: sem Prisma, sem React, sem `@/lib/db` (que **lança no
 * import** quando falta `DATABASE_URL`). Mesma razão de `vocabulario.ts`,
 * `learning-scope.ts` e `approval-checklist.ts` — a bancada é client, e um
 * import indevido derruba a tela inteira.
 *
 * As duas regras que governam a fusão:
 *
 *  1. **O servidor manda no CONTEÚDO** (copy, horário, tema, foto, via, motivo
 *     do slot). Ele é onde o chat, a bancada e as tools se encontram.
 *  2. **O estado mais AVANÇADO vence na SITUAÇÃO.** Um card que já está
 *     gerando (ou pronto, ou agendado) na tela não pode voltar para "proposto"
 *     porque o servidor ainda não soube — o trabalho em voo é local, e a
 *     hidratação chega depois. É o mesmo instinto de `desfechoVenceOAnterior`
 *     (`src/lib/aprendizado/captura.ts`): evidência mais forte sobrescreve,
 *     nunca o contrário.
 */

import type { BancadaItem, BancadaStatus } from '@/stores/bancada-store'
import { lerReferenciasDoItem } from '@/lib/planos/execucao'
import { normalizarEscopo, type EscopoAprendizado } from '@/lib/posts/learning-scope'
import {
  normalizarFormato,
  normalizarStatusDoItem,
  normalizarVia,
  STATUS_DO_ITEM,
  STATUS_INICIAL,
  transicaoPermitida,
  VIA_PADRAO,
  type FormatoDoItem,
  type StatusDoItem,
  type ViaDoItem,
} from './vocabulario'

// ── O que chega do servidor ─────────────────────────────────────────────────

/**
 * Um `ItemDePlano` como ele sai pelo HTTP: datas já viraram string ISO e todo
 * campo é opcional, porque quem monta o corpo pode ser uma tool do MCP tanto
 * quanto a rota. Ler defensivamente aqui é mais barato que descobrir um
 * `undefined` dentro do componente.
 */
export interface ItemDePlanoDoServidor {
  id: string
  planoId?: string | null
  projectId?: number | null
  ordem?: number | null
  /** Instante em ISO (UTC). Nulo enquanto o horário não foi decidido. */
  quando?: string | null
  tema?: string | null
  copyProposta?: string[] | null
  legenda?: string | null
  fotoUrl?: string | null
  fotoDriveId?: string | null
  formato?: string | null
  via?: string | null
  sourcePageId?: string | null
  /** Direção adicional da geração (coluna desde 23/08/2026). */
  direcao?: string | null
  /** Ajuste autorizado na foto (coluna desde 23/08/2026). */
  ajusteDaFoto?: string | null
  /** Referências com papel (coluna Json desde 23/08/2026). Lida defensivamente. */
  referencias?: unknown
  /** Cliente citado na peça — a logo dele é composta na arte. */
  clienteProjectId?: number | null
  /** Nome do cliente citado, derivado por `lerPlano` (não é coluna). */
  clienteCitadoNome?: string | null
  motivoDoSlot?: string | null
  escopo?: string | null
  campaignId?: string | null
  status?: string | null
  motivoReprovacao?: string | null
  erro?: string | null
  generationId?: string | null
  pageId?: string | null
  postId?: string | null
  sugestaoId?: string | null
  /** Carrossel: `{ groupId, lista: [...] }`. Nulo/ausente = peça única. */
  slides?: {
    groupId?: string | null
    lista?: Array<{
      ordem?: number | null
      copy?: string[] | null
      fotoDriveId?: string | null
      fotoUrl?: string | null
      thumbUrl?: string | null
      generationId?: string | null
      resultUrl?: string | null
      erro?: string | null
      aviso?: string | null
    }> | null
  } | null
}

export interface PlanoDoServidor {
  id: string
  projectId: number
  titulo?: string | null
  inicio?: string | null
  fim?: string | null
  status?: string | null
  itens: ItemDePlanoDoServidor[]
}

// ── Avanço: a régua única ───────────────────────────────────────────────────

/**
 * Quão longe o item chegou. É uma ORDEM TOTAL sobre um grafo que não é linear,
 * ou seja: uma aproximação declarada, não a verdade completa.
 *
 * O que ela precisa garantir é uma coisa só — que a hidratação nunca REGRIDA
 * um item. Por isso os dois estados laterais ganham a posição do momento em que
 * costumam acontecer, em vez de ficarem fora da régua: `erro` é o desfecho de
 * quem estava gerando (e portanto vence `gerando`), e `reprovado` é uma decisão
 * que vem depois de aprovar. Onde o grafo permite os dois sentidos (`reprovado`
 * ⇄ `editado`), a régua erra para o lado do MAIS avançado — que é o lado que
 * não apaga trabalho da tela.
 */
const AVANCO_DO_ITEM: Record<StatusDoItem, number> = {
  proposto: 0,
  editado: 10,
  aprovado: 20,
  reprovado: 25,
  'na-fila': 30,
  gerando: 40,
  erro: 45,
  pronto: 50,
  agendado: 60,
}

/**
 * A mesma régua no vocabulário da bancada.
 *
 * `guia-pronto` (só existe em carrossel: capa e guia prontos, esperando alguém
 * confirmar o look) fica entre `gerando` e `erro` — é mais que gerando, e um
 * slide que falhou depois disso ainda precisa vencer.
 */
const AVANCO_NA_BANCADA: Record<BancadaStatus, number> = {
  rascunho: 0,
  gerando: 40,
  'guia-pronto': 43,
  erro: 45,
  pronto: 50,
  agendado: 60,
}

/** O mais adiantado dos dois. `undefined` de um lado devolve o outro. */
export function statusMaisAvancado(
  a: StatusDoItem | null | undefined,
  b: StatusDoItem | null | undefined,
): StatusDoItem {
  if (!a) return b ?? STATUS_INICIAL
  if (!b) return a
  return AVANCO_DO_ITEM[b] > AVANCO_DO_ITEM[a] ? b : a
}

/**
 * Qual situação o card deve mostrar depois da hidratação.
 *
 * Regra única, sem caso especial: ganha a mais avançada. É ela que impede o
 * card `gerando` de voltar a `rascunho` (e a pessoa pagar duas vezes pelo mesmo
 * trabalho), e é ela que deixa o servidor CONTAR uma novidade — arte que ficou
 * pronta pelo chat aparece pronta aqui.
 */
export function situacaoQueVence(local: BancadaStatus, doServidor: BancadaStatus): BancadaStatus {
  if (local === doServidor) return local
  return AVANCO_NA_BANCADA[doServidor] > AVANCO_NA_BANCADA[local] ? doServidor : local
}

/**
 * A situação do item DE PLANO que corresponde ao que o card mostra hoje.
 *
 * `rascunho` cobre cinco situações do plano (proposto, editado, aprovado,
 * reprovado e a espera da fila), então ele não decide nada sozinho: quem
 * desempata é o que o servidor disse por último. Serve para a etiqueta do card
 * e para o progresso agregado da leva.
 */
export function situacaoParaExibir(item: BancadaItem): StatusDoItem {
  const doPlano = item.situacaoNoPlano ?? STATUS_INICIAL
  const daBancada = DA_BANCADA_PARA_O_PLANO[item.status]
  return daBancada ? statusMaisAvancado(doPlano, daBancada) : doPlano
}

/** Só as situações da bancada que têm equivalente EXATO no plano. */
const DA_BANCADA_PARA_O_PLANO: Partial<Record<BancadaStatus, StatusDoItem>> = {
  gerando: 'gerando',
  'guia-pronto': 'gerando',
  pronto: 'pronto',
  erro: 'erro',
  agendado: 'agendado',
}

// ── Trabalho no servidor ────────────────────────────────────────────────────

/**
 * O item tem geração em andamento (ou concluída) no servidor?
 *
 * Vive aqui, e não solto dentro do guard de reidratação do store, porque agora
 * são DOIS lugares que precisam da mesma resposta — o guard e a hidratação — e
 * porque um módulo puro é testável.
 *
 * 🔴 Olha o item **E os slides**: no carrossel o `generationId` do item fica
 * vazio e os ids vivem em `slides[].generationId`. Olhar só o item fazia a
 * série inteira voltar para "na fila" a cada recarga, mesmo com capa e guia
 * prontos — e quem clicasse em Gerar de novo pagaria duas vezes.
 */
export function temTrabalhoNoServidor(item: {
  generationId?: string
  slides?: Array<{ generationId?: string }>
}): boolean {
  return !!item.generationId || (item.slides ?? []).some((s) => !!s.generationId)
}

/**
 * Slides do servidor → slides do card. A miniatura segue a mesma regra da
 * peça única: foto do acervo só tem `driveFileId`, e a rota de thumbnail é a
 * mesma do seletor de fotos.
 */
export function slidesDoServidor(
  slides: ItemDePlanoDoServidor['slides'],
): NonNullable<BancadaItem['slides']> {
  const lista = slides?.lista ?? []
  return lista.map((s, i) => {
    const url = s.fotoUrl?.trim() || undefined
    const driveId = s.fotoDriveId?.trim() || undefined
    return {
      ordem: s.ordem ?? i + 1,
      copy: (s.copy ?? []).filter((b) => typeof b === 'string' && b.trim() !== ''),
      referencia: {
        papel: 'subject' as const,
        ...(driveId ? { driveFileId: driveId } : {}),
        ...(url ? { url } : {}),
        thumbUrl: s.thumbUrl?.trim() || url || (driveId ? `/api/drive/thumbnail/${driveId}` : ''),
      },
      ...(s.generationId ? { generationId: s.generationId } : {}),
      resultUrl: s.resultUrl ?? null,
      erro: s.erro ?? null,
      aviso: s.aviso ?? null,
    }
  })
}

/** O caminho inverso: os slides do card, prontos para o PATCH do item. */
export function slidesParaServidor(item: {
  slides?: BancadaItem['slides']
  carouselGroupId?: string
}): unknown {
  const lista = (item.slides ?? []).map((s) => ({
    ordem: s.ordem,
    copy: s.copy,
    fotoDriveId: s.referencia.driveFileId ?? null,
    fotoUrl: s.referencia.url ?? null,
    thumbUrl: s.referencia.thumbUrl || null,
    generationId: s.generationId ?? null,
    resultUrl: s.resultUrl ?? null,
    erro: s.erro ?? null,
    aviso: s.aviso ?? null,
  }))
  return { groupId: item.carouselGroupId ?? null, lista }
}

/**
 * Fusão slide a slide, pela ORDEM: o servidor manda no conteúdo (copy, foto);
 * o TRABALHO local vence quando o servidor ainda não o tem — o polling do
 * navegador enxerga o resultado segundos antes de a transição sincronizar, e
 * regredir um slide com generationId é cobrar duas vezes, que é exatamente o
 * defeito que o guard de reidratação já trava para a peça única.
 */
export function mesclarSlides(
  locais: BancadaItem['slides'],
  doServidor: BancadaItem['slides'],
): BancadaItem['slides'] {
  const daTela = new Map((locais ?? []).map((s) => [s.ordem, s]))
  return (doServidor ?? []).map((s) => {
    const local = daTela.get(s.ordem)
    if (!local) return s
    return {
      ...s,
      generationId: s.generationId ?? local.generationId,
      resultUrl: s.resultUrl ?? local.resultUrl ?? null,
      erro: s.erro ?? local.erro ?? null,
      aviso: s.aviso ?? local.aviso ?? null,
    }
  })
}

/**
 * O servidor manda na foto da CENA (a única com coluna no ItemDePlano); as
 * referências extras — âncoras de ambiente/prato e estilo — só existem no
 * navegador de quem as escolheu e não podem evaporar a cada refetch. Sem esta
 * fusão, o item montado no compositor com âncoras perdia todas elas na
 * primeira hidratação.
 */
export function mesclarReferencias(
  locais: BancadaItem['referencias'],
  doServidor: BancadaItem['referencias'],
): BancadaItem['referencias'] {
  const cena =
    doServidor.find((r) => r.papel === 'subject') ?? locais.find((r) => r.papel === 'subject')
  const extras = locais.filter((r) => r.papel !== 'subject')
  return [...(cena ? [cena] : []), ...extras]
}

// ── Datas ───────────────────────────────────────────────────────────────────

const FUSO = 'America/Sao_Paulo'

/**
 * Instante ISO → "AAAA-MM-DD HH:mm" em Brasília, que é a forma que a bancada
 * usa em `quando` e que o agendamento recebe de volta.
 *
 * Guardar o ISO cru e converter em cada componente é como aparece "story das
 * 21h" que na verdade é meia-noite UTC.
 */
export function paraQuandoBRT(iso: string | null | undefined): string | null {
  if (!iso) return null
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(data)
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? ''
  const hora = p('hour') === '24' ? '00' : p('hour')
  return `${p('year')}-${p('month')}-${p('day')} ${hora}:${p('minute')}`
}

// ── Tradução ────────────────────────────────────────────────────────────────

/** A situação da bancada que corresponde à do plano, antes de olhar o local. */
function situacaoDoPlanoNaBancada(status: StatusDoItem): BancadaStatus {
  switch (status) {
    case 'gerando':
      return 'gerando'
    case 'pronto':
      return 'pronto'
    case 'erro':
      return 'erro'
    case 'agendado':
      return 'agendado'
    default:
      // proposto, editado, aprovado, reprovado e na-fila são todos "ainda não
      // virou arte" — na bancada isso é um card esperando o Gerar. A situação
      // fina não se perde: fica em `situacaoNoPlano` e é ela que a etiqueta lê.
      return 'rascunho'
  }
}

/**
 * O item do plano como um card da fila — a tradução CRUA.
 *
 * `itemDePlanoId` é a chave de dedupe entre servidor e navegador — é o único
 * campo que a fusão consulta para saber se já existe card para aquele item. Um
 * item montado na bancada continua sem ele, e por isso continua intocável.
 *
 * ⚠️ A situação aqui é a do servidor, sem os acertos que dependem do que o
 * navegador já tem (ver `fundirComOLocal`, que é por onde todo card passa antes
 * de entrar na fila). Manter a tradução crua é o que deixa a fusão comparar as
 * duas situações de verdade — adiantar o acerto de `pronto` sem arte faria a
 * régua comparar `gerando` onde o servidor disse `pronto`.
 */
/**
 * As referências do card, vindas do servidor.
 *
 * A lista completa (coluna de 23/08/2026) vence; sem ela, a foto espelho vira
 * a cena — que é o comportamento que os itens antigos sempre tiveram. A
 * miniatura segue a regra da capa: foto do acervo não tem URL própria, então
 * `driveFileId` passa por `/api/drive/thumbnail/` (a lição dos 5 cards sem
 * imagem de 11/08).
 */
function referenciasDoServidor(
  bruto: unknown,
  espelho: { foto: string | null; driveId: string | null; tema: string | null; thumbUrl: string },
): BancadaItem['referencias'] {
  const lista = lerReferenciasDoItem(bruto)
  if (lista.length > 0) {
    return lista.map((r) => ({
      papel: r.role,
      ...(r.driveFileId ? { driveFileId: r.driveFileId } : {}),
      ...(r.url ? { url: r.url } : {}),
      ...(r.label ? { label: r.label } : {}),
      thumbUrl: r.url ?? (r.driveFileId ? `/api/drive/thumbnail/${r.driveFileId}` : ''),
    }))
  }
  if (!espelho.foto && !espelho.driveId) return []
  return [
    {
      papel: 'subject',
      ...(espelho.driveId ? { driveFileId: espelho.driveId } : {}),
      ...(espelho.foto ? { url: espelho.foto } : {}),
      ...(espelho.tema ? { label: espelho.tema } : {}),
      thumbUrl: espelho.thumbUrl,
    },
  ]
}

/**
 * O caminho DE VOLTA: as referências do card no formato que a rota do plano
 * aceita. A arte de referência estrelada (`style` + `generationId`) fica de
 * fora de propósito — ela é escolha do NAVEGADOR (13/08) e a coluna do plano
 * só guarda foto de acervo/upload. Quando a mesma foto carrega os dois
 * endereços, o `driveFileId` vence (é o que sobrevive à troca de host do
 * Blob) — a rota exige exatamente um.
 */
export function referenciasParaServidor(
  refs: BancadaItem['referencias'],
): Array<{ role: 'subject' | 'anchor-ambient' | 'anchor-dish' | 'style'; driveFileId?: string; url?: string; label?: string }> {
  return (refs ?? [])
    .filter((r) => !(r.papel === 'style' && r.generationId))
    .filter((r) => r.driveFileId || r.url)
    .map((r) => ({
      role: r.papel,
      ...(r.driveFileId ? { driveFileId: r.driveFileId } : r.url ? { url: r.url } : {}),
      ...(r.label ? { label: r.label } : {}),
    }))
}

export function paraItemDaBancada(
  doServidor: ItemDePlanoDoServidor,
  plano: PlanoDoServidor,
  agora: number = Date.now(),
): BancadaItem {
  const status = normalizarStatusDoItem(doServidor.status) ?? STATUS_INICIAL
  const formato: FormatoDoItem = normalizarFormato(doServidor.formato) ?? 'story'
  const via: ViaDoItem = normalizarVia(doServidor.via) ?? VIA_PADRAO
  const escopo: EscopoAprendizado = normalizarEscopo(doServidor.escopo) ?? 'ROTINA'
  const tema = doServidor.tema?.trim() || null

  const ehCarrossel = (doServidor.slides?.lista?.length ?? 0) > 0
  const foto = doServidor.fotoUrl?.trim() || null
  const driveId = doServidor.fotoDriveId?.trim() || null

  /**
   * 🔴 A miniatura precisa de uma URL, e foto do acervo NÃO tem uma.
   *
   * `propor-semana` escolhe a foto pelo `buscarNoAcervo`, que devolve
   * `driveFileId` — nunca `fotoUrl`. Com `thumbUrl: ''` a referência existia (a
   * geração até funcionaria, porque ela usa o `driveFileId`), mas o card da
   * bancada não desenhava imagem nenhuma: uma leva inteira aparecia sem foto,
   * como se a proposta tivesse vindo vazia. Medido no Espeto Gaúcho em
   * 11/08/2026 — 5 de 5 cards sem imagem.
   *
   * `/api/drive/thumbnail/<fileId>` é a mesma rota que o seletor de fotos usa
   * (`arte-ia-image-picker`), então a miniatura do plano e a do acervo saem do
   * mesmo lugar.
   */
  const thumbUrl = foto ?? (driveId ? `/api/drive/thumbnail/${driveId}` : '')

  return {
    // Id estável e derivado: a mesma linha do plano produz sempre o mesmo card,
    // o que mantém a chave de idempotência da captura de copy (`item:<id>`)
    // valendo entre recargas.
    id: `plano:${doServidor.id}`,
    projectId: plano.projectId,
    itemDePlanoId: doServidor.id,
    planoId: plano.id,
    situacaoNoPlano: status,
    via,
    sourcePageId: doServidor.sourcePageId?.trim() || null,
    tema,
    trilha: 'arte',
    tipo: ehCarrossel ? 'carrossel' : 'peca',
    ...(ehCarrossel
      ? {
          slides: slidesDoServidor(doServidor.slides),
          ...(doServidor.slides?.groupId ? { carouselGroupId: doServidor.slides.groupId } : {}),
        }
      : {}),
    formato,
    copy: (doServidor.copyProposta ?? []).filter((b) => typeof b === 'string' && b.trim() !== ''),
    legenda: doServidor.legenda?.trim() || undefined,
    // A direção gravada no item vence; sem ela, o tema é o que a peça precisa
    // dizer — mandá-lo como pedido é melhor do que gerar com a direção vazia.
    pedido: doServidor.direcao?.trim() || tema || '',
    instrucaoImagem: doServidor.ajusteDaFoto?.trim() || null,
    clienteCitado:
      typeof doServidor.clienteProjectId === 'number' && doServidor.clienteProjectId > 0
        ? { projectId: doServidor.clienteProjectId, nome: doServidor.clienteCitadoNome?.trim() || null }
        : null,
    referencias: referenciasDoServidor(doServidor.referencias, { foto, driveId, tema, thumbUrl }),
    quando: paraQuandoBRT(doServidor.quando),
    escopo,
    motivoDoSlot: doServidor.motivoDoSlot?.trim() || null,
    motivoReprovacao: doServidor.motivoReprovacao?.trim() || null,
    sugestaoId: doServidor.sugestaoId?.trim() || null,
    status: situacaoDoPlanoNaBancada(status),
    criadoEm: agora,
    ...(doServidor.generationId ? { generationId: doServidor.generationId } : {}),
    ...(doServidor.pageId ? { pageId: doServidor.pageId } : {}),
    ...(doServidor.postId ? { postId: doServidor.postId } : {}),
    resultUrl: null,
    erro: doServidor.erro?.trim() || null,
  }
}

// ── Fusão ───────────────────────────────────────────────────────────────────

/** Os campos que a fusão escreve — o resto do card é do navegador. */
const CAMPOS_FUNDIDOS = [
  'projectId',
  'itemDePlanoId',
  'planoId',
  'situacaoNoPlano',
  'via',
  'sourcePageId',
  'tema',
  'formato',
  'copy',
  'legenda',
  'pedido',
  'instrucaoImagem',
  'clienteCitado',
  'referencias',
  'quando',
  'escopo',
  'motivoDoSlot',
  'motivoReprovacao',
  'sugestaoId',
  'status',
  'criadoEm',
  'generationId',
  'pageId',
  'postId',
  'resultUrl',
  'erro',
] as const

/**
 * O card final: conteúdo do servidor, situação de quem estiver mais adiantado.
 *
 * Três acertos finais valem o comentário:
 *
 *  - **`agendado` local é terminal.** A partir daí a verdade é o POST — o
 *    horário que vale é o que foi agendado, não o que o plano propunha. Mesma
 *    razão de `agendado` não ter saída em `transicaoPermitida`.
 *  - **`pronto` sem a URL da arte vira `gerando`.** O `ItemDePlano` guarda o
 *    `generationId`, nunca a imagem; deixar o card "pronto" sem `resultUrl`
 *    daria prévia vazia e agendamento cego. Marcado como `gerando`, o polling
 *    que já existe resolve a URL no primeiro tick.
 *  - **`criadoEm` é reiniciado ao ENTRAR em `gerando`.** Ele é o relógio do
 *    teto de 8 minutos do polling; herdar o horário de criação do item faria o
 *    card ser dado como perdido no mesmo instante em que passou a acompanhar.
 */
export function fundirComOLocal(
  local: BancadaItem | undefined,
  doServidor: BancadaItem,
  agora: number = Date.now(),
): BancadaItem {
  if (!local) return ajustar(doServidor, undefined, agora)

  const terminal = local.status === 'agendado'
  const status = situacaoQueVence(local.status, doServidor.status)

  const candidato: BancadaItem = {
    ...local,
    // Vínculos e situação do plano: sempre acompanham o servidor (a situação
    // pela régua, para não regredir o que já andou por aqui).
    itemDePlanoId: doServidor.itemDePlanoId,
    planoId: doServidor.planoId,
    situacaoNoPlano: statusMaisAvancado(local.situacaoNoPlano, doServidor.situacaoNoPlano),
    // Conteúdo: o servidor manda — exceto no item já terminal, cujo conteúdo
    // real é o do post que ele virou.
    ...(terminal
      ? {}
      : {
          via: doServidor.via,
          sourcePageId: doServidor.sourcePageId,
          tema: doServidor.tema,
          formato: doServidor.formato,
          copy: doServidor.copy,
          legenda: doServidor.legenda,
          /**
           * Direção adicional e ajuste de foto TÊM coluna desde 23/08/2026
           * (`direcao`, `ajusteDaFoto`) e o modal os PERSISTE junto com a copy.
           * A regra de mescla mudou com isso: quando o SERVIDOR tem uma direção
           * de verdade (o pedido mapeado difere do tema derivado), ele vence —
           * o que está lá é a última edição que chegou à equipe, e o valor
           * local pode ser justamente a hidratação ANTIGA (o tema), gravada no
           * navegador antes de a coluna existir. O local só vence quando o
           * servidor não tem nada além do derivado: é a proteção de sempre
           * para a edição que não conseguiu fazer a viagem (PATCH falhou).
           */
          pedido: (() => {
            const servidorTemDirecao =
              !!doServidor.pedido && doServidor.pedido !== (doServidor.tema ?? '')
            if (servidorTemDirecao) return doServidor.pedido
            return local.pedido && local.pedido !== doServidor.pedido
              ? local.pedido
              : doServidor.pedido
          })(),
          instrucaoImagem: doServidor.instrucaoImagem
            ? doServidor.instrucaoImagem
            : (local.instrucaoImagem ?? null),
          clienteCitado: doServidor.clienteCitado ?? null,
          referencias: mesclarReferencias(local.referencias, doServidor.referencias),
          ...(doServidor.slides || local.slides
            ? { slides: mesclarSlides(local.slides, doServidor.slides) }
            : {}),
          ...(doServidor.carouselGroupId ? { carouselGroupId: doServidor.carouselGroupId } : {}),
          ...(doServidor.tipo ? { tipo: doServidor.tipo } : {}),
          quando: doServidor.quando,
          escopo: doServidor.escopo,
          motivoDoSlot: doServidor.motivoDoSlot,
          sugestaoId: doServidor.sugestaoId,
        }),
    motivoReprovacao: doServidor.motivoReprovacao,
    // Resultado do trabalho: o que o navegador já tem nunca é apagado; o que
    // falta é preenchido pelo servidor.
    generationId: local.generationId ?? doServidor.generationId,
    pageId: local.pageId ?? doServidor.pageId,
    postId: local.postId ?? doServidor.postId,
    resultUrl: local.resultUrl ?? doServidor.resultUrl,
    erro: status === 'erro' ? (local.erro ?? doServidor.erro) : null,
    status,
  }

  return ajustar(candidato, local, agora)
}

/** Os acertos finais, e a preservação da referência quando nada mudou. */
function ajustar(
  item: BancadaItem,
  local: BancadaItem | undefined,
  agora: number,
): BancadaItem {
  let final = item

  if (final.status === 'pronto' && !final.resultUrl) {
    // Sem a URL da arte não há o que mostrar nem o que agendar. Com
    // `generationId`, o polling resolve; sem ele, não há nada para acompanhar e
    // o card volta a esperar o Gerar.
    final = { ...final, status: final.generationId ? 'gerando' : 'rascunho' }
  }

  if (final.status === 'gerando' && local?.status !== 'gerando') {
    final = { ...final, criadoEm: agora }
  }

  if (local && CAMPOS_FUNDIDOS.every((campo) => igual(local[campo], final[campo]))) {
    // Nada mudou: devolver a MESMA referência deixa o zustand não notificar e
    // a fila não repintar a cada refetch da consulta.
    return local
  }
  return final
}

function igual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => igual(v, b[i]))
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ca = a as Record<string, unknown>
    const cb = b as Record<string, unknown>
    const chaves = new Set([...Object.keys(ca), ...Object.keys(cb)])
    for (const chave of chaves) if (!igual(ca[chave], cb[chave])) return false
    return true
  }
  return false
}

// ── Hidratação da fila ──────────────────────────────────────────────────────

/**
 * A fila inteira depois de reconciliar com o plano ativo do projeto.
 *
 * Recebe e devolve a lista GLOBAL do store (ela guarda itens de vários
 * projetos), e só toca no projeto pedido.
 *
 * O que acontece com cada card:
 *
 *  - **item do plano que já tem card** → fusão (conteúdo do servidor, situação
 *    de quem estiver mais adiantado);
 *  - **item do plano sem card** → card novo, no TOPO da fila e na ordem do
 *    plano: a leva que acabou de chegar é a novidade;
 *  - **card montado na bancada** (sem `itemDePlanoId`) → intocado. Ele nunca
 *    esteve no servidor e não é a hidratação que vai apagá-lo;
 *  - **card do plano que sumiu do servidor** → NÃO some sem mais. Se já houve
 *    trabalho (`generationId` no item ou nos slides), ele vira um card local:
 *    perde o vínculo e fica na tela, porque jogar fora arte paga por causa de
 *    uma linha removida do plano é o pior desfecho. Sem trabalho nenhum, aí
 *    sim ele sai — a proposta foi retirada da leva e nunca virou nada.
 *
 * ⚠️ `plano: null` significa "este projeto não tem leva ativa", e só ORFANIZA:
 * nenhum card é apagado. Consulta que ainda não respondeu (ou que falhou) não
 * pode chamar esta função — o resultado seria indistinguível de "o plano
 * acabou", e cards sumiriam por causa de rede ruim.
 */
export function hidratarItens(
  itens: BancadaItem[],
  plano: PlanoDoServidor | null,
  projectId: number,
  agora: number = Date.now(),
): BancadaItem[] {
  const doServidor = (plano?.itens ?? []).map((i) => paraItemDaBancada(i, plano!, agora))
  const porItemDePlano = new Map(doServidor.map((i) => [i.itemDePlanoId!, i]))
  const vistos = new Set<string>()

  const mantidos: BancadaItem[] = []
  for (const local of itens) {
    if (local.projectId !== projectId || !local.itemDePlanoId) {
      mantidos.push(local)
      continue
    }

    const par = porItemDePlano.get(local.itemDePlanoId)
    if (par) {
      vistos.add(local.itemDePlanoId)
      mantidos.push(fundirComOLocal(local, par, agora))
      continue
    }

    /**
     * 🔴 Card de OUTRA leva NÃO fica intocado — a bancada mostra UMA leva por
     * vez (a ativa), e o card preso a um plano que não é o ativo é quase
     * sempre resto de leva apagada ou substituída.
     *
     * A primeira versão deste código o mantinha ("não é assunto desta
     * hidratação"), e o efeito real foi apagar a leva no servidor e ver TODOS
     * os cards continuarem na tela: três levas do Espeto empilhadas em
     * 11/08/2026, cada `propor-semana` só ACRESCENTANDO. A regra agora é a
     * mesma do card que sumiu do plano: com trabalho pago (ou já agendado)
     * ele sobrevive como card local — trabalho nunca some da tela —; sem
     * trabalho nenhum, sai.
     */
    if (temTrabalhoNoServidor(local) || local.status === 'agendado') {
      mantidos.push(semVinculo(local))
      continue
    }
    // Sem plano ativo nenhum, o card proposto fica (órfão): `plano: null`
    // também acontece quando a leva acabou de ser arquivada e a pessoa ainda
    // está olhando a fila — apagar aqui seria agressivo. Com uma leva ativa na
    // tela, o proposto de outra leva é lixo e sai.
    if (!plano) {
      mantidos.push(semVinculo(local))
    }
  }

  // Card novo também passa pela fusão (com `undefined` do lado local): é lá que
  // moram os acertos finais — `pronto` sem a URL da arte, relógio do polling.
  const novos = doServidor
    .filter((i) => !vistos.has(i.itemDePlanoId!))
    .map((i) => fundirComOLocal(undefined, i, agora))
  const inalterada =
    novos.length === 0 &&
    mantidos.length === itens.length &&
    mantidos.every((i, idx) => i === itens[idx])
  return inalterada ? itens : [...novos, ...mantidos]
}

/** O card sem o vínculo com o plano — daqui em diante ele é só da bancada. */
function semVinculo(item: BancadaItem): BancadaItem {
  if (!item.itemDePlanoId && !item.planoId && !item.situacaoNoPlano) return item
  const { itemDePlanoId: _a, planoId: _b, situacaoNoPlano: _c, ...resto } = item
  return resto
}

// ── Transições de volta ao servidor ─────────────────────────────────────────

/**
 * O caminho mais curto de uma situação até outra, respeitando as transições
 * que o vocabulário permite.
 *
 * Existe porque a bancada anda mais rápido que o plano: quem clica em "Gerar"
 * num item `proposto` pula "na fila" na cabeça, mas
 * `transicaoPermitida('proposto', 'gerando')` é **false** — e com razão, já que
 * a passagem pela fila é o que dá o ponto de retentativa. Em vez de duplicar a
 * tabela de transições aqui (ela é privada de propósito), o caminho é
 * DESCOBERTO por busca em largura sobre a própria função exportada: mudou a
 * regra lá, este módulo acompanha sozinho.
 *
 * Devolve `[]` quando já se está no destino, e também quando não há caminho —
 * o chamador é fire-and-forget e não tem o que fazer com um erro aqui.
 */
export function caminhoDeTransicao(de: StatusDoItem, para: StatusDoItem): StatusDoItem[] {
  if (de === para) return []
  const visitados = new Set<StatusDoItem>([de])
  const fila: Array<{ atual: StatusDoItem; caminho: StatusDoItem[] }> = [{ atual: de, caminho: [] }]

  while (fila.length > 0) {
    const { atual, caminho } = fila.shift()!
    for (const proximo of STATUS_DO_ITEM) {
      if (proximo === atual || visitados.has(proximo)) continue
      if (!transicaoPermitida(atual, proximo)) continue
      const adiante = [...caminho, proximo]
      if (proximo === para) return adiante
      visitados.add(proximo)
      fila.push({ atual: proximo, caminho: adiante })
    }
  }
  return []
}

/**
 * A ordem da fila: data DECRESCENTE (pedido do Ciro, 11/08/2026) — a leva se
 * lê como um feed, o horário mais distante no topo e o mais próximo embaixo.
 *
 * Card SEM data vem antes de tudo: ele está esperando uma decisão de horário,
 * e enterrá-lo no fim da lista é como um item some. Empate de horário
 * desempata pelo mais novo na fila.
 *
 * Não reordena o STORE (a ordem de inserção é o histórico de quem montou);
 * ordena a LEITURA, no render.
 */
export function ordenarPorDataDesc<T extends { quando?: string | null; criadoEm: number }>(
  itens: T[],
): T[] {
  return [...itens].sort((a, b) => {
    const qa = a.quando ?? ''
    const qb = b.quando ?? ''
    if (qa !== qb) {
      if (!qa) return -1
      if (!qb) return 1
      return qb.localeCompare(qa)
    }
    return b.criadoEm - a.criadoEm
  })
}

// ── A data no cartão ────────────────────────────────────────────────────────

const DIAS_ABREV = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.'] as const
const MESES_ABREV = [
  'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
  'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
] as const

export interface QuandoNoCartao {
  /** "Ter." */
  diaSemana: string
  /** "11" */
  dia: string
  /** "ago." */
  mes: string
  /** "14:30" */
  hora: string
  /** "Ter. 11 de ago. 14:30" — para `title` e leitores de tela. */
  completo: string
}

/**
 * "2026-08-11" + "14:30" → as partes do selo de agenda, em português.
 *
 * 🔴 NÃO passa por `new Date("2026-08-11")`: o construtor lê data pura como
 * meia-noite UTC, que em Brasília é 21h do dia ANTERIOR — o selo mostraria a
 * terça como segunda. A string já é uma data de calendário BRT, então o dia da
 * semana sai de `Date.UTC` com os componentes, sem fuso no meio.
 *
 * Devolve `null` quando não há data: o cartão não desenha selo em vez de
 * desenhar um selo vazio.
 */
export function formatarQuandoBR(
  data: string | null | undefined,
  hora: string | null | undefined,
): QuandoNoCartao | null {
  const bruto = (data ?? '').trim()
  const m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])

  const teste = new Date(Date.UTC(ano, mes - 1, dia))
  // Dia que não existe NÃO vira Invalid Date — o V8 rola para o mês seguinte em
  // silêncio ("2026-02-31" vira 3 de março). Só a conferência componente a
  // componente pega, e é a mesma lição de `parseValidade`.
  if (
    teste.getUTCFullYear() !== ano ||
    teste.getUTCMonth() !== mes - 1 ||
    teste.getUTCDate() !== dia
  ) {
    return null
  }

  const horaLimpa = (hora ?? '').trim()
  const diaSemana = DIAS_ABREV[teste.getUTCDay()]
  const mesAbrev = MESES_ABREV[mes - 1]
  const completo = `${diaSemana} ${dia} de ${mesAbrev}${horaLimpa ? ` ${horaLimpa}` : ''}`

  return { diaSemana, dia: String(dia), mes: mesAbrev, hora: horaLimpa, completo }
}
