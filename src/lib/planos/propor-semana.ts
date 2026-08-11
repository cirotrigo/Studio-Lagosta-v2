/**
 * `propor-semana` (F3, trilho B) — monta a programação da semana e a PERSISTE
 * como plano.
 *
 * ⚠️ CONTRATO, antes de qualquer coisa: **isto não produz arte nenhuma e não
 * cobra crédito de imagem.** A leva sai como INTENÇÃO — horário, assunto, foto
 * e texto propostos, cada item em "proposto". Quem produz é `executar-plano`,
 * que tem gate de confirmação em duas chamadas. É a mesma regra que já valia
 * para a sugestão de horário desde a F1: proposta nunca agenda nem gasta
 * sozinha.
 *
 * E a segunda regra: **nada espera, nada bloqueia.** Todo insumo que falhar
 * degrada com aviso — acervo sem catálogo, taxonomia vazia, dica de copy fora
 * do ar. A leva é persistida do mesmo jeito, porque uma semana com horários e
 * fotos e sem texto ainda é uma semana; uma exceção no meio não é nada.
 *
 * ── DE ONDE VEM CADA PEDAÇO ───────────────────────────────────────────────
 *
 *   quando  → `sugerirPosts` (cadência v2 da F2), ou a grade-semente
 *   assunto → taxonomia aprovada × distribuição real do cliente (F2)
 *   foto    → `buscarNoAcervo`, uma busca por assunto, sem repetir na leva
 *   texto   → `montarDicasDeCopy` (fatia B1)
 *   modelo  → o `modeloSugerido` que o próprio slot já traz
 *
 * 🔴 O tema por slot **não vem da F2**: `SugestaoSlot` não tem campo de pilar
 * (os `temas` do modelo sugerido são TAGS da página). Quem escolhe o assunto é
 * `distribuirPilares`, em `proposta-de-semana.ts` — puro e testado.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { buscarNoAcervo } from '@/lib/creatives/acervo'
import { parseBRT } from '@/lib/creatives/agendar'
import { sugerirPosts, type SugestaoSlot } from '@/lib/posts/sugerir-posts'
import { taxonomiaAprovada } from '@/lib/aprendizado/pilares-service'
import { montarPerfil } from '@/lib/aprendizado/perfil'
import type { Pilar } from '@/lib/aprendizado/pilares'
import { registrarSugestoes, sugestoesJaEmitidas } from '@/lib/aprendizado/captura'
import { chaveDeSugestao } from '@/lib/aprendizado/chaves'
import { registrarDicasDeCopy, type DicaParaRegistrar } from '@/lib/aprendizado/sinal-de-copy-do-plano'
import { criarPlano, MAX_ITENS_POR_PLANO, type ItemDePlanoInput } from '@/lib/planos/plano-service'
import {
  montarDicasDeCopy,
  VERSAO_DA_DICA,
  type DicaDeCopy,
  type PedidoDeDica,
} from '@/lib/planos/dica-de-copy'
import type { FormatoDoItem } from '@/lib/planos/vocabulario'
import {
  distribuirPilares,
  escolherFotoSemRepetir,
  completarAteOAlvo,
  espalharPorDia,
  gradeSemente,
  POSTS_POR_DIA_ALVO,
  ROTULO_DE_COLD_START,
  type SlotParaProposta,
} from '@/lib/planos/proposta-de-semana'

/**
 * Versão da montagem. Entra na chave dos sinais que ESTE serviço emite (a
 * grade-semente e a dica de copy) — mudou a heurística, a safra nova não herda
 * o desfecho de uma proposta que era outra.
 */
export const VERSAO_DA_PROPOSTA = 'propor-semana-v1'

/** Versão da grade-semente, separada: ela muda sem a montagem mudar. */
const VERSAO_DA_SEMENTE = 'semente-v1'

const SERVICO = 'propor-semana'

/** Quantos posts uma semana proposta tem, quando ninguém pede outra coisa. */
/**
 * O teto padrão de uma leva: o ritmo da agência multiplicado pelos dias.
 *
 * 🔴 Era 7 — UM post por dia numa semana. A cadência já encontrava 14 a 22
 * horários típicos para a maioria dos clientes (medido em 11/08/2026) e este
 * teto jogava fora dois terços deles.
 */
function tetoPadrao(dias: number): number {
  return dias * POSTS_POR_DIA_ALVO
}

/** Fotos pedidas por assunto além do necessário, para haver de onde desviar. */
const FOLGA_DE_FOTOS = 4

export interface ProporSemanaInput {
  projectId: number
  /** Quantos dias à frente olhar (default 7, teto 14 — o de `sugerirPosts`). */
  dias?: number
  /** Teto de itens da leva (default 7). */
  maxItens?: number
  /** Formato das peças (default story, o mais usado). */
  formato?: string | null
  /** Recado de quem pediu ("é semana de festival"), repassado à dica de copy. */
  observacao?: string | null
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
  criadoPor?: string | null
  titulo?: string | null
}

export interface ResultadoDaProposta {
  plano: Awaited<ReturnType<typeof criarPlano>>['plano']
  avisos: string[]
  /** `true` quando NADA veio da cadência — a leva inteira é ponto de partida. */
  coldStart: boolean
  /** Quantos horários a cadência ofereceu antes do corte. */
  slotsDaCadencia: number
  /** Quantos itens vieram da grade-semente. */
  itensSemeados: number
  taxonomia: { total: number; assuntosUsados: string[] }
  copy: { comDica: number; semDica: number; indisponivel: boolean }
  fotos: { comFoto: number; semFoto: number; foraDoAssunto: number }
  mensagem: string
}

// ── Auxiliares ──────────────────────────────────────────────────────────────

function formatoValido(valor: unknown): FormatoDoItem {
  const limpo = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return limpo === 'feed' || limpo === 'quadrado' ? limpo : 'story'
}

/** "AAAA-MM-DD" → "DD/MM", para o título da leva. */
function diaCurto(dataISO: string): string {
  const [, mes, dia] = dataISO.split('-')
  return `${dia}/${mes}`
}

/** O slot no formato que a montagem consome, venha da cadência ou da semente. */
function slotDaCadencia(s: SugestaoSlot): SlotParaProposta {
  return {
    scheduledDatetime: s.scheduledDatetime,
    data: s.data,
    hora: s.hora,
    diaSemana: s.diaSemana,
    motivo: s.campanhasDoDia?.length
      ? `${s.motivo}; a base cita "${s.campanhasDoDia.join('", "')}" nesse dia`
      : s.motivo,
    sugestaoId: s.sugestaoId ?? null,
    modeloPageId: s.modeloSugerido?.pageId ?? null,
  }
}

/**
 * Registra a grade-semente como sugestão de SLOT.
 *
 * Ela é uma proposta do sistema como qualquer outra: se a pessoa aceitar o
 * horário, isso é um dado; se mudar, também. Deixá-la fora do registro faria a
 * taxa de aceitação medir só os clientes que já têm rotina — justamente os que
 * menos precisam de proposta.
 *
 * A chave é determinística (projeto + horário + versão da semente), então
 * montar a semana duas vezes no mesmo dia não grava nada de novo.
 */
async function registrarSemente(projectId: number, semente: SlotParaProposta[]): Promise<void> {
  if (semente.length === 0) return
  const chaves = semente.map((s) =>
    chaveDeSugestao('slot', VERSAO_DA_SEMENTE, projectId, s.scheduledDatetime),
  )
  const jaEmitidas = await sugestoesJaEmitidas(chaves)

  const novas: number[] = []
  semente.forEach((s, i) => {
    const id = jaEmitidas.get(chaves[i])
    if (id) s.sugestaoId = id
    else novas.push(i)
  })
  if (novas.length === 0) return

  const ids = await registrarSugestoes(
    novas.map((i) => ({
      projectId,
      tipo: 'slot' as const,
      servico: SERVICO,
      versao: VERSAO_DA_SEMENTE,
      chave: chaves[i],
      sugerido: {
        scheduledDatetime: semente[i].scheduledDatetime,
        data: semente[i].data,
        hora: semente[i].hora,
        diaSemana: semente[i].diaSemana,
        motivo: semente[i].motivo,
        semente: true,
      },
    })),
  )
  novas.forEach((indice, n) => {
    const id = ids[n]
    if (id) semente[indice].sugestaoId = id
  })
}

interface FotoEscolhida {
  driveFileId: string
  fileName?: string
}

/**
 * Uma busca no acervo POR ASSUNTO, com as listas guardadas por pilar.
 *
 * Uma busca por assunto (e não uma só para a leva inteira) é o que dá variedade
 * sem descer no ranqueamento: listas diferentes têm topos diferentes, e o topo
 * é a recomendação do rodízio. Acervo sem catálogo devolve mapa vazio e um
 * aviso — a leva sai sem foto, e a bancada tem seletor para isso.
 */
async function buscarFotosPorAssunto(
  projectId: number,
  assuntos: Array<{ chave: string; tema: string | null; quantos: number }>,
  avisos: string[],
): Promise<{ porAssunto: Map<string, FotoEscolhida[]>; geral: FotoEscolhida[] }> {
  const porAssunto = new Map<string, FotoEscolhida[]>()
  let jaAvisou = false
  let acervoIndisponivel = false

  const buscar = async (tema: string | null, quantos: number): Promise<FotoEscolhida[]> => {
    try {
      const r = await buscarNoAcervo({
        projectId,
        ...(tema ? { theme: tema } : {}),
        limit: quantos + FOLGA_DE_FOTOS,
      })
      return r.images.map((i) => ({ driveFileId: i.driveFileId, fileName: i.fileName }))
    } catch (erro) {
      // Tema sem foto nenhuma é comum e não merece aviso por assunto; o que
      // merece é o acervo INTEIRO indisponível, e uma vez só.
      const codigo = erro instanceof CreativeError ? erro.code : 'ERRO'
      if (codigo === 'SEM_CATALOGO' || codigo === 'SEM_PASTA_DRIVE') {
        acervoIndisponivel = true
        if (!jaAvisou) {
          jaAvisou = true
          avisos.push(
            'O acervo de fotos deste cliente não está disponível — a leva foi montada sem imagens.',
          )
        }
      } else {
        console.warn('[propor-semana] busca no acervo falhou:', erro)
      }
      return []
    }
  }

  const listas = await Promise.all(assuntos.map((a) => buscar(a.tema, a.quantos)))
  assuntos.forEach((a, i) => porAssunto.set(a.chave, listas[i]))

  /**
   * O acervo INTEIRO, ranqueado, como rede de segurança.
   *
   * O casamento por tema é por substring (`bestFor`, tags, caminho da pasta), e
   * um assunto legítimo do cliente pode não casar com nada — medido no By Rock:
   * "Cortes e churrasco" devolveu zero num acervo de mil fotos. Item sem
   * imagem é item que não vira arte pela via de IA, então é melhor oferecer a
   * próxima do rodízio e deixar a pessoa trocar no card (a leva avisa quando
   * isso acontece) do que entregar metade da semana vazia.
   *
   * Só é buscado quando falta alguém — e nunca quando o acervo está fora do ar.
   */
  const faltaAlguem = assuntos.some((a) => (porAssunto.get(a.chave) ?? []).length === 0)
  const geral =
    faltaAlguem && !acervoIndisponivel
      ? await buscar(null, assuntos.reduce((t, a) => t + a.quantos, 0))
      : []

  return { porAssunto, geral }
}

/**
 * O modelo preferido de cada assunto, filtrado pelo que AINDA é modelo.
 *
 * A mineração da F2 olha o histórico, e o histórico não sabe da curadoria: em
 * 10/08/2026 foram despromovidas 22 páginas de uma vez, e página que deixou de
 * ser modelo (ou que foi apagada) só falharia lá na frente, dentro de
 * `executar-plano`, com crédito e paciência já gastos. A conferência é uma
 * consulta só, e o que não passa simplesmente não é oferecido.
 */
async function modelosAprendidosValidos(
  projectId: number,
  minerados: Array<{ pilar: string; pageId: string }>,
): Promise<Map<string, string>> {
  const porPilar = new Map<string, string>()
  const ids = [...new Set(minerados.map((m) => m.pageId).filter(Boolean))]
  if (ids.length === 0) return porPilar
  try {
    const vivos = await db.page.findMany({
      where: { id: { in: ids }, isTemplate: true, Template: { projectId } },
      select: { id: true },
    })
    const validos = new Set(vivos.map((p) => p.id))
    for (const m of minerados) {
      if (!porPilar.has(m.pilar) && validos.has(m.pageId)) porPilar.set(m.pilar, m.pageId)
    }
  } catch (erro) {
    console.error('[propor-semana] não deu para conferir os modelos aprendidos:', erro)
  }
  return porPilar
}

// ── A montagem ──────────────────────────────────────────────────────────────

/**
 * Monta a semana e a persiste como plano.
 *
 * Nunca dispara geração, nunca cobra crédito, nunca agenda. O caminho de
 * escrita é UM: `criarPlano`.
 */
export async function proporSemana(input: ProporSemanaInput): Promise<ResultadoDaProposta> {
  const projectId = Number(input.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto inválido: ${input.projectId}`, 400)
  }
  const dias = Math.min(Math.max(input.dias ?? 7, 1), 14)
  const maxItens = Math.min(Math.max(input.maxItens ?? tetoPadrao(dias), 1), MAX_ITENS_POR_PLANO)
  const formato = formatoValido(input.formato)
  const agora = new Date()
  const avisos: string[] = []

  // ── 1. Os horários ────────────────────────────────────────────────────────
  //
  // `sugerirPosts` já REGISTRA cada slot emitido como sinal e devolve o
  // `sugestaoId` de cada um — não há nada a registrar aqui.
  let daCadencia: SugestaoSlot[] = []
  try {
    const r = await sugerirPosts({ projectId, dias })
    daCadencia = r.sugestoes
    avisos.push(...r.avisos)
  } catch (erro) {
    if (erro instanceof CreativeError && erro.code === 'PROJECT_NOT_FOUND') throw erro
    console.error('[propor-semana] não deu para ler a cadência:', erro)
    avisos.push('Não consegui ler a cadência deste cliente agora — usei uma grade de partida.')
  }

  let slots = espalharPorDia(daCadencia.map(slotDaCadencia), maxItens)
  const coldStart = slots.length === 0
  let itensSemeados = 0

  /**
   * O ritmo é PUXADO, não espelhado. A cadência aprendida reflete o que o
   * cliente fez; para quem andou postando pouco, espelhar é ajudá-lo a
   * continuar pouco. Os slots completados carregam rótulo próprio — nunca o
   * motivo estatístico dos reais.
   */
  if (!coldStart) {
    const antes = slots.length
    slots = completarAteOAlvo(slots, { agora, dias, maxItens })
    const completados = slots.filter((s) => s.semente)
    if (completados.length > 0) {
      itensSemeados = completados.length
      await registrarSemente(projectId, completados)
      avisos.push(
        `Este cliente vem publicando menos que ${POSTS_POR_DIA_ALVO} por dia; completei ${slots.length - antes} horário(s) para fechar o ritmo. Eles vêm marcados — ajuste ou tire o que não fizer sentido.`,
      )
    }
  }

  if (coldStart) {
    const semente = gradeSemente({ agora, dias, maxItens })
    await registrarSemente(projectId, semente)
    slots = semente
    itensSemeados = semente.length
    avisos.push(
      `${ROTULO_DE_COLD_START}. Os horários abaixo são um começo para ajustar com ele, não uma leitura do que ele já faz.`,
    )
  }

  if (slots.length === 0) {
    throw new CreativeError(
      'SEM_HORARIOS',
      'Não consegui montar nenhum horário para esta janela. Aumente os dias ou informe os horários na mão.',
      422,
    )
  }

  // ── 2. O assunto de cada horário ──────────────────────────────────────────
  const [taxonomia, perfil] = await Promise.all([
    taxonomiaAprovada(projectId).catch((erro) => {
      console.error('[propor-semana] não deu para ler os pilares:', erro)
      return [] as Pilar[]
    }),
    montarPerfil(projectId).catch((erro) => {
      console.error('[propor-semana] não deu para ler o perfil aprendido:', erro)
      return null
    }),
  ])

  if (taxonomia.length === 0) {
    avisos.push(
      'Este cliente ainda não tem assuntos cadastrados, então os itens ficaram sem tema. Dá para cadastrá-los na aba Marca do projeto — com eles, a leva sai com um assunto por post e sem repetir.',
    )
  }
  const assuntos = distribuirPilares(slots.length, taxonomia, perfil?.pilares ?? [])

  // O modelo que este cliente costuma usar EM CADA ASSUNTO (mineração da F2) —
  // a rede de segurança do horário que não tem modelo do dia. Só entram os que
  // ainda existem e continuam sendo modelo: a curadoria de 10/08 despromoveu 22
  // páginas, e apontar para uma delas faria o item falhar só na execução.
  const modeloPorPilar = await modelosAprendidosValidos(projectId, perfil?.mineracao.modeloPorPilar ?? [])

  // ── 3. A foto de cada horário ─────────────────────────────────────────────
  const porChaveDeAssunto = new Map<string, { tema: string | null; quantos: number }>()
  assuntos.forEach((a) => {
    const chave = a?.slug ?? ''
    const atual = porChaveDeAssunto.get(chave)
    if (atual) atual.quantos += 1
    else porChaveDeAssunto.set(chave, { tema: a?.nome ?? null, quantos: 1 })
  })

  const { porAssunto: fotosPorAssunto, geral: fotosGerais } = await buscarFotosPorAssunto(
    projectId,
    [...porChaveDeAssunto.entries()].map(([chave, v]) => ({ chave, ...v })),
    avisos,
  )

  const fotosUsadas = new Set<string>()
  let fotosForaDoAssunto = 0
  const fotoDoItem = slots.map((_, i) => {
    const chave = assuntos[i]?.slug ?? ''
    const doAssunto = fotosPorAssunto.get(chave) ?? []
    let escolhida = escolherFotoSemRepetir(doAssunto, fotosUsadas)
    if (!escolhida) {
      escolhida = escolherFotoSemRepetir(fotosGerais, fotosUsadas)
      if (escolhida) fotosForaDoAssunto += 1
    }
    if (escolhida) fotosUsadas.add(escolhida.driveFileId)
    return escolhida
  })
  if (fotosForaDoAssunto > 0) {
    avisos.push(
      `${fotosForaDoAssunto} post(s) ficaram com uma foto do acervo geral porque não achei foto do assunto — vale conferir e trocar no card.`,
    )
  }

  // ── 3b. O modelo de cada horário ──────────────────────────────────────────
  //
  // O modelo do DIA (que o próprio slot traz) vence o modelo do ASSUNTO: o
  // primeiro é a peça que o cliente tem cadastrada para aquele dia da semana, e
  // essa intenção é mais forte que uma preferência lida do histórico.
  const modeloDoItem = slots.map((s, i) => {
    const assunto = assuntos[i]
    return s.modeloPageId ?? (assunto ? (modeloPorPilar.get(assunto.slug) ?? null) : null)
  })

  // ── 4. O texto de cada horário ────────────────────────────────────────────
  //
  // A dica NUNCA derruba a proposta: erro dela vira leva sem copy, exatamente
  // como um dia em que o modelo de texto estivesse fora do ar.
  const pedidos: PedidoDeDica[] = slots.map((s, i) => ({
    ref: s.scheduledDatetime,
    tema: assuntos[i]?.nome ?? null,
    quando: parseBRT(s.scheduledDatetime),
    formato,
    ...(input.observacao ? { observacao: input.observacao } : {}),
  }))

  let dicas: DicaDeCopy[] = []
  let copyIndisponivel = true
  let versaoDaDica = VERSAO_DA_DICA
  try {
    const r = await montarDicasDeCopy({ projectId, pedidos })
    dicas = r.dicas
    copyIndisponivel = r.indisponivel
    versaoDaDica = r.versao || VERSAO_DA_DICA
    avisos.push(...r.avisos)
  } catch (erro) {
    console.error('[propor-semana] a dica de copy falhou (seguindo sem ela):', erro)
    avisos.push('Não consegui escrever os textos agora — a leva foi montada sem eles.')
  }
  const dicaPorRef = new Map(dicas.map((d) => [d.ref, d]))

  // ── 5. Persistir ──────────────────────────────────────────────────────────
  const itens: ItemDePlanoInput[] = slots.map((s, i) => {
    const dica = dicaPorRef.get(s.scheduledDatetime)
    const assunto = assuntos[i]
    const modelo = modeloDoItem[i]
    return {
      ordem: i,
      quando: s.scheduledDatetime,
      tema: assunto?.nome ?? null,
      copyProposta: dica?.blocos ?? null,
      legenda: dica?.legenda ?? null,
      fotoDriveId: fotoDoItem[i]?.driveFileId ?? null,
      formato,
      // A via é consequência do que existe: com modelo do cliente, a arte nasce
      // sem gastar crédito de imagem; sem ele, só a IA resolve. É a escolha que
      // `executar-plano` vai cobrar (ou não) — e a pessoa pode trocar item a
      // item antes de mandar produzir.
      via: modelo ? 'template' : 'ia',
      sourcePageId: modelo,
      motivoDoSlot: s.motivo,
      // 🔴 O `sugestaoId` do ITEM é o do SLOT, sempre. É ele que
      // `avaliarSlotSugerido` compara na hora de agendar, e é a âncora da dica
      // de copy — trocá-lo pelo sinal de copy quebraria os dois.
      sugestaoId: s.sugestaoId ?? null,
    }
  })

  const primeiroDia = slots[0].data
  const ultimoDia = slots[slots.length - 1].data
  const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  const { plano, avisos: avisosDoPlano } = await criarPlano({
    projectId,
    titulo: input.titulo?.trim() || `Semana de ${diaCurto(primeiroDia)} a ${diaCurto(ultimoDia)}`,
    // A janela começa HOJE de propósito: o primeiro item pode ser amanhã, e uma
    // janela que começa nele deixaria de fora qualquer antecipação feita no card.
    inicio: hoje <= primeiroDia ? hoje : primeiroDia,
    fim: ultimoDia,
    origem: SERVICO,
    versao: VERSAO_DA_PROPOSTA,
    criadoPor: input.criadoPor ?? null,
    itens,
  })
  avisos.push(...avisosDoPlano)

  // ── 6. Registrar a copy PROPOSTA ──────────────────────────────────────────
  //
  // Depois de a leva existir, porque é aí que ela foi de fato emitida para
  // alguém ver. Falha aqui é log: sinal perdido é barato, leva perdida não.
  const paraRegistrar: DicaParaRegistrar[] = []
  slots.forEach((s, i) => {
    const dica = dicaPorRef.get(s.scheduledDatetime)
    if (!dica || dica.blocos.length === 0) return
    const ancora = s.sugestaoId ?? s.scheduledDatetime
    paraRegistrar.push({
      ancora,
      blocos: dica.blocos,
      legenda: dica.legenda ?? null,
      tema: assuntos[i]?.nome ?? null,
      scheduledDatetime: s.scheduledDatetime,
      formato,
      fontes: dica.fontes,
      pageId: modeloDoItem[i],
    })
  })
  await registrarDicasDeCopy({
    projectId,
    servico: SERVICO,
    // As DUAS versões entram: mudou a montagem da semana ou mudou o gerador de
    // texto, a safra nova não herda o desfecho da proposta anterior.
    versao: `${VERSAO_DA_PROPOSTA}/${versaoDaDica}`,
    dicas: paraRegistrar,
  }).catch((erro) => {
    console.error('[propor-semana] não deu para registrar as dicas de copy:', erro)
    return new Map<string, string>()
  })

  const comDica = paraRegistrar.length
  const comFoto = fotoDoItem.filter(Boolean).length

  return {
    plano,
    avisos,
    coldStart,
    slotsDaCadencia: daCadencia.length,
    itensSemeados,
    taxonomia: {
      total: taxonomia.length,
      assuntosUsados: [...new Set(assuntos.filter(Boolean).map((a) => a!.nome))],
    },
    copy: { comDica, semDica: slots.length - comDica, indisponivel: copyIndisponivel },
    fotos: { comFoto, semFoto: slots.length - comFoto, foraDoAssunto: fotosForaDoAssunto },
    mensagem: coldStart
      ? `Montei ${plano.itens.length} post(s) como PONTO DE PARTIDA — ainda não conheço a rotina deste cliente. Nada foi produzido e nada foi cobrado.`
      : `Montei ${plano.itens.length} post(s) a partir da rotina deste cliente. Nada foi produzido e nada foi cobrado.`,
  }
}
