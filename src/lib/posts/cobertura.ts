/**
 * COBERTURA da agenda contra a EXPECTATIVA do cliente (H2 do Dot, 13/10/2026).
 *
 * Duas perguntas, uma resposta só para o sistema inteiro:
 *
 *  - **O que o cliente deveria ter publicado em cada dia?** É a EXPECTATIVA:
 *    a grade aprovada da base ("Padrões de Postagem", só story) fundida com a
 *    cadência dos POSTED dos últimos 56 dias, com o formato de cada horário
 *    pela maioria do bloco. A lógica é a que vivia dentro de `sugerirPosts`.
 *    Ela saiu de lá sem mudar nada (snapshot em
 *    `__tests__/sugerir-posts-paridade.test.ts`), e `sugerirPosts` chama
 *    `expectativaDoProjeto` daqui. Assim a auditoria da carteira e a sugestão
 *    nunca divergem sobre que horários existem.
 *  - **Cada horário esperado está coberto?** COBERTO, PENDENTE ou VAZIO, pela
 *    mesma regra de ocupação da sugestão (`ocupaOSlot`: mesmo formato, ±45 min).
 *    A diferença é o que conta como ocupante VÁLIDO. A sugestão só pergunta
 *    "há algo aqui?" (para não empilhar); a cobertura pergunta "há conteúdo
 *    PRONTO aqui?". Por isso um rascunho sem arte, uma campanha vencida ou um
 *    post que falhou deixam o horário PENDENTE: há algo a resolver, e criar
 *    outro post por cima duplicaria.
 *
 * PURO de propósito: nada de `@/lib/db`, que lança no import sem DATABASE_URL.
 * Quem lê o banco é a tool `auditar-operacao`, com um número FIXO de consultas
 * para a carteira inteira. Daqui sai tudo o que se decide, e é testável sem banco.
 */

import type {
  ResumoDoGate,
  ResumoDoGateDaCarteira,
} from '@/lib/creatives/revisao/gate-resumo';
import {
  calcularCadencia,
  emBRT,
  horaLabel,
  type PostDoHistorico,
  type ResultadoDaCadencia,
} from '@/lib/posts/cadencia';
import {
  fundirGradeComCadencia,
  lerGradeDasEntradas,
  type SlotFixo,
  type SlotFundido,
} from '@/lib/posts/grade-da-base';
import {
  diaDaSemanaDe,
  formatoDoBloco,
  formatoDoTipo,
  historicoParaFormato,
  inicioDoDiaBRT,
  janelaDaSugestao,
  ocupaOSlot,
  type FormatoDaPeca,
} from '@/lib/posts/contexto-da-semana';
import { PREFIXO_DO_ENVELOPE } from '@/lib/posts/erro-render-semantico';
import { MOTIVO_VIDEO_REMOVIDO } from '@/lib/posts/post-de-video';

/**
 * O alvo operacional do Dot: AMANHÃ e DEPOIS DE AMANHÃ completos (decisão do
 * owner, 13/10/2026). Hoje aparece à parte e não entra na conta.
 */
export const TARGET_DAYS_AHEAD = 2;

/** Quanto histórico ensina a cadência. */
export const JANELA_HISTORICO_DIAS = 56;

/** Slot ocupado se já existe post do mesmo formato a menos de 45 min dele. */
export const TOLERANCIA_SLOT_MIN = 45;

// ── Expectativa ───────────────────────────────────────────────────────────

/** O post do histórico como o banco devolve: só POSTED, sem PONTUAL, dos últimos 56 dias. */
export interface PostDoHistoricoDoBanco {
  scheduledDatetime: Date | null;
  origem: string | null;
  learningScope: 'ROTINA' | 'CAMPANHA' | 'PONTUAL' | null;
  campaignId: string | null;
  postType: string;
}

export type FonteDaExpectativa =
  | 'grade'
  | 'cadencia'
  | 'grade+cadencia'
  | 'sem-rotina';

export interface ExpectativaDoProjeto {
  /** Os horários de cada dia da semana (0 = domingo), já fundidos. */
  slotsPorDia: Map<number, SlotFundido[]>;
  /** O formato de um horário: grade é story; o histórico vai pela maioria do bloco. */
  formatoDoSlot: (
    dia: number,
    slot: Pick<SlotFundido, 'minutosDoDia' | 'origem'>
  ) => FormatoDaPeca;
  cadencia: ResultadoDaCadencia;
  grade: SlotFixo[];
  fonte: FonteDaExpectativa;
}

/**
 * O que o cliente deveria publicar, por dia da semana.
 *
 * `encerradas` = as campanhas deste projeto com `expiresAt` antes de `agora`.
 * Quem resolve isso é o chamador, porque é consulta à base.
 */
export function expectativaDoProjeto(args: {
  historico: PostDoHistoricoDoBanco[];
  encerradas: ReadonlySet<string>;
  entradasDaGrade: Array<{ title: string; content: string }>;
  agora: Date;
}): ExpectativaDoProjeto {
  const { historico, encerradas, entradasDaGrade, agora } = args;

  const paraCadencia: PostDoHistorico[] = historico
    .filter((p) => p.scheduledDatetime)
    .map((p) => ({
      quando: p.scheduledDatetime!,
      origem: p.origem as PostDoHistorico['origem'],
      escopo: p.learningScope,
      campaignId: p.campaignId,
      campanhaEncerrada: !!p.campaignId && encerradas.has(p.campaignId),
    }));
  const cadencia = calcularCadencia(paraCadencia, { agora });

  // Grade aprovada é STORY por construção; horário do histórico leva o formato
  // da MAIORIA do que o cliente publicou naquele bloco, na mesma população da
  // cadência (sem campanha encerrada). É o formato que decide a ocupação.
  const historicoComFormato = historicoParaFormato(historico, encerradas);
  const formatoDoSlot = (
    dia: number,
    slot: Pick<SlotFundido, 'minutosDoDia' | 'origem'>
  ): FormatoDaPeca =>
    slot.origem === 'grade'
      ? 'story'
      : formatoDoBloco(historicoComFormato, dia, slot.minutosDoDia);

  // Onde a grade cobre o dia, os slots fixos substituem os horários de STORY do
  // histórico. O feed que o histórico sustenta continua, e com grade vazia a
  // fusão é a identidade.
  const grade = lerGradeDasEntradas(entradasDaGrade);
  const slotsPorDia = fundirGradeComCadencia(cadencia.slotsPorDia, grade, {
    formatoDe: (dia, t) =>
      formatoDoBloco(historicoComFormato, dia, t.minutosDoDia),
  });

  let daGrade = 0;
  let daCadencia = 0;
  for (const lista of slotsPorDia.values()) {
    for (const s of lista) {
      if (s.origem === 'grade') daGrade++;
      else daCadencia++;
    }
  }
  const fonte: FonteDaExpectativa =
    daGrade && daCadencia
      ? 'grade+cadencia'
      : daGrade
        ? 'grade'
        : daCadencia
          ? 'cadencia'
          : 'sem-rotina';

  return { slotsPorDia, formatoDoSlot, cadencia, grade, fonte };
}

export interface SlotEsperado {
  /** "AAAA-MM-DD" em Brasília. */
  data: string;
  /** 0 = domingo. */
  dia: number;
  hora: string;
  minutosDoDia: number;
  /** Instante do horário (ms, UTC). */
  quandoUTC: number;
  formato: FormatoDaPeca;
  origem: 'grade' | 'cadencia';
  motivo: string;
  tema?: string;
}

/** Os horários esperados numa data, na ordem do dia. É o mesmo laço da sugestão e da auditoria. */
export function slotsEsperadosNaData(
  expectativa: ExpectativaDoProjeto,
  dataISO: string
): SlotEsperado[] {
  const dia = diaDaSemanaDe(dataISO);
  const inicio = inicioDoDiaBRT(dataISO).getTime();
  return (expectativa.slotsPorDia.get(dia) ?? []).map((slot) => ({
    data: dataISO,
    dia,
    hora: slot.hora,
    minutosDoDia: slot.minutosDoDia,
    quandoUTC: inicio + slot.minutosDoDia * 60_000,
    formato: expectativa.formatoDoSlot(dia, slot),
    origem: slot.origem,
    motivo: slot.motivo,
    ...(slot.tema ? { tema: slot.tema } : {}),
  }));
}

// ── Ocupantes ─────────────────────────────────────────────────────────────

/** O post da janela como o banco devolve, só com o que a cobertura usa. */
export interface PostDaJanela {
  id: string;
  scheduledDatetime: Date | null;
  postType: string;
  status: string;
  mediaUrls: string[];
  pageId: string | null;
  renderStatus: string | null;
  renderError: string | null;
  errorMessage: string | null;
  verificationStatus: string | null;
  campaignId: string | null;
}

export type MotivoPendente =
  | 'rascunho-sem-arte'
  | 'render-pendente'
  | 'render-falhou'
  | 'campanha-vencida'
  | 'falhou'
  | 'situacao-desconhecida';

export type AvaliacaoDoOcupante =
  | { valido: true }
  | { valido: false; motivo: MotivoPendente };

/** Mídia pronta = ao menos uma URL http(s) em `mediaUrls`. `pageId` sozinho não é peça pronta. */
export function temMidiaPronta(p: Pick<PostDaJanela, 'mediaUrls'>): boolean {
  return (p.mediaUrls ?? []).some(
    (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())
  );
}

/**
 * O post COBRE o horário em que está?
 *
 * - FAILED nunca cobre. A recuperação tem máquina própria e substituir o post duplicaria.
 * - POSTED cobre: já aconteceu.
 * - Campanha vencida antes do horário não cobre (o conteúdo morreu), nem agendada.
 * - RENDER_FAILED não cobre: a arte não vai sair.
 * - SCHEDULED e POSTING cobrem. A aprovação humana já aconteceu, e o render do
 *   agendado sai no cron antes do horário.
 * - DRAFT só cobre com PEÇA PRONTA: mídia http(s) e nenhum render em curso.
 *   Render PENDING ou RENDERING é pendente MESMO com mídia: a mídia que está lá
 *   é a versão anterior e não prova que a peça final está pronta para aprovar
 *   (decisão do owner no fechamento do H2). Mídia com RENDERED, NOT_NEEDED
 *   (upload, importada, mídia própria) ou sem status cobre.
 */
export function avaliarOcupante(
  p: PostDaJanela,
  campanhaExpiraEm: Date | null | undefined
): AvaliacaoDoOcupante {
  if (p.status === 'FAILED') return { valido: false, motivo: 'falhou' };
  if (p.status === 'POSTED') return { valido: true };
  if (
    campanhaExpiraEm &&
    p.scheduledDatetime &&
    p.scheduledDatetime.getTime() > campanhaExpiraEm.getTime()
  ) {
    return { valido: false, motivo: 'campanha-vencida' };
  }
  if (p.renderStatus === 'RENDER_FAILED')
    return { valido: false, motivo: 'render-falhou' };
  if (p.status === 'SCHEDULED' || p.status === 'POSTING')
    return { valido: true };
  if (p.status === 'DRAFT') {
    if (p.renderStatus === 'PENDING' || p.renderStatus === 'RENDERING') {
      return { valido: false, motivo: 'render-pendente' };
    }
    if (temMidiaPronta(p)) return { valido: true };
    return { valido: false, motivo: 'rascunho-sem-arte' };
  }
  return { valido: false, motivo: 'situacao-desconhecida' };
}

export type EstadoDoSlot = 'coberto' | 'pendente' | 'vazio';

export interface Buraco {
  data: string;
  hora: string;
  formato: FormatoDaPeca;
  estado: 'vazio' | 'pendente';
  motivo?: MotivoPendente;
  postId?: string;
}

interface Ocupante {
  t: number;
  formato: FormatoDaPeca;
  post: PostDaJanela;
  avaliacao: AvaliacaoDoOcupante;
}

/** Os posts que ocupam o horário esperado: a regra única de ocupação (mesmo formato, ±45 min). */
function ocupantesDoSlot(slot: SlotEsperado, ocupantes: Ocupante[]): Ocupante[] {
  return ocupantes.filter((o) =>
    ocupaOSlot(o, slot.quandoUTC, slot.formato, TOLERANCIA_SLOT_MIN)
  );
}

/**
 * Dois ou mais posts no mesmo horário esperado (H6). Só INFORMA: ninguém é bloqueado, apagado nem remarcado.
 * Qualquer situação conta, como na guarda HORARIO_OCUPADO. É o caso de um criador sem a trava da agenda
 * (job de vídeo, sync do Zernio, stdio) pôr um segundo post num horário já fechado.
 */
export interface ConflitoDeHorario {
  data: string;
  hora: string;
  formato: FormatoDaPeca;
  quantidade: number;
  postIds: string[];
}

/**
 * Os conflitos de um dia. Cada post que ocupa algum horário esperado (`ocupaOSlot`) é contado no horário
 * esperado MAIS PRÓXIMO dentre os que ele ocupa (empate: o mais cedo). Conflito = dois ou mais posts no mesmo
 * horário. Assim, numa grade com 11h e 11h30, um post em cada não é conflito, e dois posts às 11h são (revisão
 * do Codex, H6: contar quantos posts ocupam o horário confundia os dois casos).
 */
function conflitosDoDia(slots: SlotEsperado[], ocupantes: Ocupante[]): ConflitoDeHorario[] {
  const porSlot = new Map<SlotEsperado, Ocupante[]>()
  for (const o of ocupantes) {
    const ocupados = slots.filter((s) => ocupaOSlot(o, s.quandoUTC, s.formato, TOLERANCIA_SLOT_MIN))
    if (ocupados.length === 0) continue
    const [maisPerto] = [...ocupados].sort((a, b) => Math.abs(o.t - a.quandoUTC) - Math.abs(o.t - b.quandoUTC) || a.quandoUTC - b.quandoUTC)
    porSlot.set(maisPerto, [...(porSlot.get(maisPerto) ?? []), o])
  }
  return slots
    .filter((s) => (porSlot.get(s)?.length ?? 0) >= 2)
    .map((s) => {
      const no = porSlot.get(s)!
      return { data: s.data, hora: s.hora, formato: s.formato, quantidade: no.length, postIds: no.map((o) => o.post.id).sort() }
    })
}

function classificarSlot(
  slot: SlotEsperado,
  ocupantes: Ocupante[]
): { estado: 'coberto'; postId: string } | Buraco {
  const no = ocupantesDoSlot(slot, ocupantes);
  const base = { data: slot.data, hora: slot.hora, formato: slot.formato };
  if (no.length === 0) return { ...base, estado: 'vazio' };
  const valido = no.find((o) => o.avaliacao.valido);
  if (valido) return { estado: 'coberto', postId: valido.post.id };
  // O mais perto do horário é quem explica a pendência. O id desempata, para a saída ser estável.
  const [maisPerto] = [...no].sort(
    (a, b) =>
      Math.abs(a.t - slot.quandoUTC) - Math.abs(b.t - slot.quandoUTC) ||
      a.post.id.localeCompare(b.post.id)
  );
  const motivo = (maisPerto.avaliacao as { motivo: MotivoPendente }).motivo;
  return { ...base, estado: 'pendente', motivo, postId: maisPerto.post.id };
}

// ── Falhas ────────────────────────────────────────────────────────────────

export interface FalhaDaJanela {
  postId: string;
  data: string;
  /** "AAAA-MM-DD HH:mm" em Brasília. */
  quando: string;
  tipo: 'publicacao' | 'render' | 'verificacao';
  motivo: string;
}

export const SEM_DIAGNOSTICO = 'falha sem diagnóstico disponível';

/**
 * Motivo CURTO e SANEADO de uma falha.
 *
 * É lista de permissão: o texto bruto (`errorMessage`, `renderError`) nunca sai
 * daqui. Ele pode trazer stack, URL assinada, resposta crua do publicador ou
 * o JSON do contrato semântico. O que casa com uma causa conhecida vira a
 * frase fixa dela; o resto vira `SEM_DIAGNOSTICO`.
 */
export function motivoSaneado(
  tipo: FalhaDaJanela['tipo'],
  bruto: string | null | undefined
): string {
  if (tipo === 'verificacao') return 'story não confirmado no Instagram';
  const t = (bruto ?? '').trim();
  if (!t) return SEM_DIAGNOSTICO;
  if (t.startsWith(PREFIXO_DO_ENVELOPE))
    return 'render semântico não corresponde à página';
  if (t === MOTIVO_VIDEO_REMOVIDO) return 'vídeo do post foi removido';
  if (tipo === 'render') return 'render da arte falhou';
  if (/cr[eé]ditos? insuficientes|InsufficientCredits/i.test(t))
    return 'créditos insuficientes';
  if (/Later account not configured|sem conta do Instagram/i.test(t))
    return 'conta do Instagram não conectada';
  if (/aspect ratio|Formato de imagem incompat/i.test(t))
    return 'formato da imagem incompatível com o Instagram';
  if (/travado em POSTING/i.test(t))
    return 'envio ao publicador não confirmado';
  if (/não encontrado \(404\)/i.test(t)) return 'post sumiu do publicador';
  if (/rate limit/i.test(t)) return 'limite de envios do publicador';
  if (/Persistência incerta/i.test(t)) return 'envio ao publicador incerto';
  return SEM_DIAGNOSTICO;
}

function quandoBRT(d: Date): { data: string; quando: string } {
  const { dataISO, minutos } = emBRT(d);
  return { data: dataISO, quando: `${dataISO} ${horaLabel(minutos)}` };
}

/** As falhas de um post, na ordem publicação, render, verificação. Um post pode ter mais de uma. */
function falhasDoPost(p: PostDaJanela): FalhaDaJanela[] {
  if (!p.scheduledDatetime) return [];
  const onde = quandoBRT(p.scheduledDatetime);
  const falhas: FalhaDaJanela[] = [];
  if (p.status === 'FAILED') {
    // O executor marca FAILED quando a ARTE não saiu: aí a causa é o render.
    const doRender = p.renderStatus === 'RENDER_FAILED';
    const tipo = doRender ? 'render' : 'publicacao';
    falhas.push({
      postId: p.id,
      ...onde,
      tipo,
      motivo: motivoSaneado(tipo, doRender ? p.renderError : p.errorMessage),
    });
  } else if (p.renderStatus === 'RENDER_FAILED' && p.status !== 'POSTED') {
    falhas.push({
      postId: p.id,
      ...onde,
      tipo: 'render',
      motivo: motivoSaneado('render', p.renderError),
    });
  }
  if (p.verificationStatus === 'VERIFICATION_FAILED') {
    falhas.push({
      postId: p.id,
      ...onde,
      tipo: 'verificacao',
      motivo: motivoSaneado('verificacao', null),
    });
  }
  return falhas;
}

// ── Cobertura de um projeto ───────────────────────────────────────────────

export type EstadoDoDia = 'coberto' | 'falta' | 'pendente' | 'sem-rotina';

export interface DiaDeCobertura {
  data: string;
  estado: EstadoDoDia;
  esperados: number;
  cobertos: number;
}

export interface CoberturaDoProjeto {
  /** Hoje só com os horários que ainda não passaram. `faltam` lista o que está vazio ou pendente. */
  hoje: DiaDeCobertura & { faltam: Buraco[] };
  amanha: DiaDeCobertura;
  depoisDeAmanha: DiaDeCobertura;
  /** Dias completos seguidos a partir de AMANHÃ (hoje não conta). */
  diasAdiantados: number;
  fonte: FonteDaExpectativa;
  /** Vazios e pendentes de amanhã e depois de amanhã: o alvo. */
  buracos: Buraco[];
  /** Rascunhos e agendados de agora até o fim de depois de amanhã. */
  rascunhos: number;
  agendados: number;
  falhas: FalhaDaJanela[];
  /** Rascunhos e agendados da janela cuja campanha termina antes do post. */
  avisosDeCampanha: number;
  /** Horários esperados (hoje, amanhã e depois) com 2+ posts. Só informa; o agente relata e não produz ali. */
  conflitosDeHorario: ConflitoDeHorario[];
}

function avaliarDia(
  slots: SlotEsperado[],
  ocupantes: Ocupante[],
  semRotina: boolean
): { dia: DiaDeCobertura; buracos: Buraco[]; conflitos: ConflitoDeHorario[] } {
  const data = slots[0]?.data;
  if (semRotina)
    return {
      dia: { data, estado: 'sem-rotina', esperados: 0, cobertos: 0 },
      buracos: [],
      conflitos: [],
    };
  const buracos: Buraco[] = [];
  const conflitos = conflitosDoDia(slots, ocupantes);
  let cobertos = 0;
  for (const slot of slots) {
    const r = classificarSlot(slot, ocupantes);
    if (r.estado === 'coberto') cobertos++;
    else buracos.push(r);
  }
  const estado: EstadoDoDia = buracos.some((b) => b.estado === 'vazio')
    ? 'falta'
    : buracos.length
      ? 'pendente'
      : 'coberto';
  return { dia: { data, estado, esperados: slots.length, cobertos }, buracos, conflitos };
}

/**
 * A cobertura de hoje, amanhã e depois de amanhã.
 *
 * `posts` = tudo do projeto entre o começo de hoje (menos a tolerância) e o fim
 * de depois de amanhã (mais a tolerância), em TODAS as situações, FAILED
 * inclusive. `campanhasExpiram` = `campaignId` → `expiresAt`, só das campanhas
 * deste projeto.
 */
export function coberturaDoProjeto(args: {
  expectativa: ExpectativaDoProjeto;
  posts: PostDaJanela[];
  campanhasExpiram: ReadonlyMap<string, Date>;
  agora: Date;
}): CoberturaDoProjeto {
  const { expectativa, posts, campanhasExpiram, agora } = args;
  // A janela é o helper da sugestão: começa agora e termina no fim do último dia, em Brasília.
  const janela = janelaDaSugestao({ agora, dias: TARGET_DAYS_AHEAD + 1 });
  const [hojeISO, ...adiante] = janela.datas;
  const semRotina = expectativa.fonte === 'sem-rotina';

  const ocupantes: Ocupante[] = posts
    .filter((p) => p.scheduledDatetime)
    .map((p) => ({
      t: p.scheduledDatetime!.getTime(),
      formato: formatoDoTipo(p.postType),
      post: p,
      avaliacao: avaliarOcupante(
        p,
        p.campaignId ? campanhasExpiram.get(p.campaignId) : null
      ),
    }));

  // Hoje: só o que ainda não passou. O que passou é história, não buraco.
  const slotsDeHoje = slotsEsperadosNaData(expectativa, hojeISO).filter(
    (s) => s.quandoUTC > agora.getTime()
  );
  const hojeAvaliado = avaliarDia(slotsDeHoje, ocupantes, semRotina);
  const hoje = {
    ...hojeAvaliado.dia,
    data: hojeISO,
    faltam: hojeAvaliado.buracos,
  };

  const dias = adiante.map((data) => {
    const r = avaliarDia(
      slotsEsperadosNaData(expectativa, data),
      ocupantes,
      semRotina
    );
    return { dia: { ...r.dia, data }, buracos: r.buracos, conflitos: r.conflitos };
  });

  let diasAdiantados = 0;
  for (const d of dias) {
    if (d.dia.estado !== 'coberto') break;
    diasAdiantados++;
  }

  const inicioDeHoje = inicioDoDiaBRT(hojeISO).getTime();
  const fim = janela.fim.getTime();
  const naJanela = (p: PostDaJanela, desde: number) =>
    !!p.scheduledDatetime &&
    p.scheduledDatetime.getTime() >= desde &&
    p.scheduledDatetime.getTime() <= fim;
  const deAgora = posts.filter((p) => naJanela(p, agora.getTime()));

  const falhas = posts
    .filter((p) => naJanela(p, inicioDeHoje))
    .flatMap(falhasDoPost)
    .sort(
      (a, b) =>
        a.quando.localeCompare(b.quando) || a.postId.localeCompare(b.postId)
    );

  return {
    hoje,
    amanha: dias[0].dia,
    depoisDeAmanha: dias[1].dia,
    diasAdiantados,
    fonte: expectativa.fonte,
    buracos: dias.flatMap((d) => d.buracos),
    rascunhos: deAgora.filter((p) => p.status === 'DRAFT').length,
    agendados: deAgora.filter((p) => p.status === 'SCHEDULED').length,
    falhas,
    avisosDeCampanha: deAgora.filter((p) => {
      if (p.status !== 'DRAFT' && p.status !== 'SCHEDULED') return false;
      const expira = p.campaignId ? campanhasExpiram.get(p.campaignId) : null;
      return !!expira && p.scheduledDatetime!.getTime() > expira.getTime();
    }).length,
    conflitosDeHorario: [...hojeAvaliado.conflitos, ...dias.flatMap((d) => d.conflitos)],
  };
}

// ── A carteira ────────────────────────────────────────────────────────────

export type CodigoDaAcao =
  | 'NENHUMA'
  | 'COMPOR'
  | 'CONSERTO_PENDENTE'
  | 'RELATAR_FALHA'
  | 'SEM_ROTINA'
  | 'SEM_ASSINATURA'
  | 'CONFLITO_DE_HORARIO';

export interface AcaoRecomendada {
  codigo: CodigoDaAcao;
  motivo: string;
}

export interface ClienteAuditado extends CoberturaDoProjeto {
  projectId: number;
  nome: string;
  assinatura: boolean;
  /** CP5e § 2: o registro do gate dos posts da janela deste cliente — só leitura, rotulado (coincidente/historico/…). */
  gate?: ResumoDoGate;
  /**
   * Rascunhos SEM horário. Não ocupam slot nenhum, mas podem ter sido feitos
   * para um dos horários vazios. Enquanto existirem, compor fica atrás da conferência.
   */
  rascunhosSemHorario: number;
  /** A mais urgente: o que o Dot faz primeiro neste cliente. */
  acao: AcaoRecomendada;
  /** Todas as que valem, da mais urgente para a menos. A primeira é `acao`. */
  acoes: AcaoRecomendada[];
}

/**
 * O que fazer no cliente, por ordem: falha relatada, buraco vazio (compor, ou
 * sem assinatura), pendência a consertar e cliente sem rotina. Hoje não gera
 * ação, porque produzir para hoje é decisão do loop, não da auditoria.
 */
export function acoesDoCliente(
  c: CoberturaDoProjeto,
  assinatura: boolean,
  rascunhosSemHorario = 0
): AcaoRecomendada[] {
  const acoes: AcaoRecomendada[] = [];
  if (c.falhas.length) {
    acoes.push({
      codigo: 'RELATAR_FALHA',
      motivo: `${c.falhas.length} falha(s) entre hoje e depois de amanhã — relatar, não substituir`,
    });
  }
  if (c.conflitosDeHorario.length) {
    acoes.push({
      codigo: 'CONFLITO_DE_HORARIO',
      motivo: `${c.conflitosDeHorario.length} horário(s) com dois ou mais posts — relatar; não criar nem remover`,
    });
  }
  if (c.fonte === 'sem-rotina') {
    acoes.push({
      codigo: 'SEM_ROTINA',
      motivo:
        'sem grade aprovada na base e sem histórico suficiente para a cadência',
    });
    return acoes;
  }
  const vazios = c.buracos.filter((b) => b.estado === 'vazio');
  if (vazios.length && assinatura && rascunhosSemHorario > 0) {
    // Um rascunho sem horário não ocupa slot, mas pode ser a peça de um dos
    // vazios: compor antes de conferir duplicaria (revisão do Codex, H2).
    acoes.push({
      codigo: 'CONSERTO_PENDENTE',
      motivo: `${rascunhosSemHorario} rascunho(s) sem horário — confira se algum é para os horários vazios antes de compor`,
    });
  }
  if (vazios.length) {
    acoes.push(
      assinatura
        ? {
            codigo: 'COMPOR',
            motivo: `${vazios.length} horário(s) vazio(s) entre amanhã e depois de amanhã`,
          }
        : {
            codigo: 'SEM_ASSINATURA',
            motivo: `${vazios.length} horário(s) vazio(s), mas o cliente não tem página de assinatura — configurar antes de produzir`,
          }
    );
  }
  const pendentes = c.buracos.filter(
    (b) => b.estado === 'pendente' && b.motivo !== 'falhou'
  );
  if (pendentes.length) {
    acoes.push({
      codigo: 'CONSERTO_PENDENTE',
      motivo: `${pendentes.length} horário(s) ocupado(s) por post que não está pronto — resolver o post, não criar outro`,
    });
  }
  if (acoes.length === 0)
    acoes.push({
      codigo: 'NENHUMA',
      motivo: `coberto por ${c.diasAdiantados} dia(s) a partir de amanhã`,
    });
  return acoes;
}

/**
 * Ordem operacional da carteira: urgência hoje, abaixo do alvo, pendências,
 * falhas, sem rotina, saudáveis. Dentro do grupo, menos dias adiantados
 * primeiro; o id desempata (estável, e nunca alfabético).
 */
export function rankDoCliente(c: ClienteAuditado): number {
  const hojeAgora = c.falhas.some((f) => f.data === c.hoje.data);
  if (c.hoje.estado === 'falta' || c.hoje.estado === 'pendente' || hojeAgora)
    return 0;
  if (c.fonte !== 'sem-rotina' && c.diasAdiantados < TARGET_DAYS_AHEAD)
    return 1;
  if (c.buracos.some((b) => b.estado === 'pendente') || c.conflitosDeHorario.length) return 2;
  if (c.falhas.length) return 3;
  if (c.fonte === 'sem-rotina') return 4;
  return 5;
}

export function ordenarClientes(
  clientes: ClienteAuditado[]
): ClienteAuditado[] {
  return [...clientes].sort(
    (a, b) =>
      rankDoCliente(a) - rankDoCliente(b) ||
      a.diasAdiantados - b.diasAdiantados ||
      a.projectId - b.projectId
  );
}

export interface CampanhaDaBase {
  id: string;
  projectId: number;
  expiresAt: Date | null;
}

export interface AuditoriaDaCarteira {
  /** CP5e § 2: o resumo do registro do gate da carteira (ausente quando a leitura falhou — dito no log). */
  gate?: ResumoDoGateDaCarteira['total'];
  alvoDias: number;
  /** "AAAA-MM-DD HH:mm" em Brasília. */
  agora: string;
  resumo: {
    total: number;
    ok: number;
    abaixoDoAlvo: number;
    semRotina: number;
    urgentesHoje: number;
    comFalhas: number;
  };
  clientes: ClienteAuditado[];
}

/**
 * A carteira inteira a partir das linhas JÁ LIDAS (o chamador faz um número
 * fixo de consultas, todas com `projectId in [...]`). Nada aqui toca o banco
 * nem grava sinal.
 */
export function auditarCarteira(args: {
  projetos: Array<{ id: number; name: string }>;
  historico: Array<PostDoHistoricoDoBanco & { projectId: number }>;
  posts: Array<PostDaJanela & { projectId: number }>;
  entradasDaGrade: Array<{ projectId: number; title: string; content: string }>;
  campanhas: CampanhaDaBase[];
  comAssinatura: ReadonlySet<number>;
  /** projectId → quantos rascunhos sem horário. */
  rascunhosSemHorario?: ReadonlyMap<number, number>;
  agora: Date;
}): AuditoriaDaCarteira {
  const { agora } = args;
  const porProjeto = <T extends { projectId: number }>(linhas: T[]) => {
    const m = new Map<number, T[]>();
    for (const l of linhas)
      m.set(l.projectId, [...(m.get(l.projectId) ?? []), l]);
    return m;
  };
  const historicoPor = porProjeto(args.historico);
  const postsPor = porProjeto(args.posts);
  const gradePor = porProjeto(args.entradasDaGrade);
  const campanhasPor = porProjeto(
    args.campanhas.filter((c) => c.expiresAt) as Array<
      CampanhaDaBase & { expiresAt: Date }
    >
  );

  const clientes = args.projetos.map((projeto): ClienteAuditado => {
    // Campanha só vale para o próprio projeto: o ponteiro do post é frouxo (sem FK).
    const campanhas = campanhasPor.get(projeto.id) ?? [];
    const encerradas = new Set(
      campanhas
        .filter((c) => c.expiresAt.getTime() < agora.getTime())
        .map((c) => c.id)
    );
    const campanhasExpiram = new Map(campanhas.map((c) => [c.id, c.expiresAt]));
    const expectativa = expectativaDoProjeto({
      historico: historicoPor.get(projeto.id) ?? [],
      encerradas,
      entradasDaGrade: gradePor.get(projeto.id) ?? [],
      agora,
    });
    const cobertura = coberturaDoProjeto({
      expectativa,
      posts: postsPor.get(projeto.id) ?? [],
      campanhasExpiram,
      agora,
    });
    const assinatura = args.comAssinatura.has(projeto.id);
    const semHorario = args.rascunhosSemHorario?.get(projeto.id) ?? 0;
    const acoes = acoesDoCliente(cobertura, assinatura, semHorario);
    return {
      projectId: projeto.id,
      nome: projeto.name,
      ...cobertura,
      assinatura,
      rascunhosSemHorario: semHorario,
      acao: acoes[0],
      acoes,
    };
  });

  const ordenados = ordenarClientes(clientes);
  const { dataISO, minutos } = emBRT(agora);
  return {
    alvoDias: TARGET_DAYS_AHEAD,
    agora: `${dataISO} ${horaLabel(minutos)}`,
    resumo: {
      total: ordenados.length,
      ok: ordenados.filter((c) => c.acao.codigo === 'NENHUMA').length,
      abaixoDoAlvo: ordenados.filter(
        (c) => c.fonte !== 'sem-rotina' && c.diasAdiantados < TARGET_DAYS_AHEAD
      ).length,
      semRotina: ordenados.filter((c) => c.fonte === 'sem-rotina').length,
      urgentesHoje: ordenados.filter((c) => rankDoCliente(c) === 0).length,
      comFalhas: ordenados.filter((c) => c.falhas.length > 0).length,
    },
    clientes: ordenados,
  };
}
