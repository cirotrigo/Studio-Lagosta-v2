/**
 * A montagem da semana — o contrato PURO de `propor-semana` (F3, trilho B).
 *
 * Aqui moram as decisões que dá para conferir sem banco e sem relógio: quais
 * horários entram na leva, que assunto cada um recebe, que foto vai em cada um
 * e como é a grade-semente do cliente que ainda não tem rotina.
 *
 * ⚠️ Este módulo NÃO importa `@/lib/db` (que **lança no import** sem
 * `DATABASE_URL`) nem nada que o puxe — é o que o torna testável. Mesma razão
 * de `vocabulario.ts`, `execucao.ts`, `para-bancada.ts` e `page-layers.ts`.
 * Quem toca o banco é `propor-semana.ts`.
 *
 * ── O ACHADO QUE MUDOU O DESENHO ──────────────────────────────────────────
 * A F2 NÃO entrega tema por slot: `SugestaoSlot` tem data, hora, motivo, o
 * modelo do dia e as campanhas do dia — nenhum campo de pilar. Os `temas` do
 * `modeloSugerido` são as TAGS da página, não a taxonomia. Então quem escolhe
 * o assunto de cada horário é este módulo, cruzando a taxonomia aprovada
 * (`ContentPillar`) com a distribuição real do cliente (`PerfilAprendido`).
 */

import type { Pilar } from '@/lib/aprendizado/pilares'

// ── Horários ────────────────────────────────────────────────────────────────

/** Fuso em que a semana é combinada com o cliente. */
const OFFSET_BRT_MS = 3 * 3_600_000

/**
 * O ritmo que a agência pratica: **três stories por dia**, em todo cliente.
 *
 * É regra de negócio, não estatística — mas a medição de 11/08/2026 a sustenta:
 * seis dos nove clientes publicam entre 3,1 e 3,9 por dia nos últimos 90 dias
 * (Seu Quinto 3,9 · Empório 3,6 · TERO 3,5 · Wine Vix 3,2 · Real Gelateria e
 * Quintal 3,1). Os outros três estão abaixo (Bacana 2,2 · By Rock 2,1 · Espeto
 * 1,4) — e é justamente para eles que a leva precisa PUXAR o ritmo em vez de
 * espelhar a queda.
 *
 * 🔴 Antes disto o teto padrão era 7 itens na semana — UM por dia. A cadência
 * já encontrava 14 a 22 horários típicos para a maioria dos clientes, e o teto
 * jogava fora dois terços deles.
 */
export const POSTS_POR_DIA_ALVO = 3

/**
 * A grade-semente do cliente sem rotina: almoço, tarde e jantar.
 *
 * Não são "os melhores horários" — são um ponto de partida honesto, e por isso
 * o motivo de cada item diz exatamente isso. Inventar uma estatística
 * ("costuma postar terça às 11:30") para um cliente sobre o qual não há
 * histórico seria a pior coisa que esta função poderia fazer: a pessoa
 * confiaria num número que não existe.
 */
const HORARIOS_SEMENTE = ['11:30', '15:00', '18:30'] as const

/** Como cada horário-semente é descrito no motivo. */
const NOME_DO_HORARIO: Record<string, string> = {
  '11:30': 'almoço',
  '15:00': 'tarde',
  '18:30': 'jantar',
}

/** O rótulo que TODO item semeado carrega. Não mude sem mudar o teste. */
export const ROTULO_DE_COLD_START =
  'ponto de partida — ainda não conheço a rotina deste cliente'

/**
 * O rótulo do slot que COMPLETA o ritmo — diferente do cold start de propósito.
 *
 * Aqui o cliente TEM rotina; ela é que anda mais magra que as três por dia que
 * a agência pratica. Dizer "ainda não conheço a rotina" seria falso, e dizer
 * "costuma postar às 15h" seria pior ainda: inventaria a estatística que este
 * módulo existe para não inventar.
 */
export const ROTULO_DE_COMPLEMENTO =
  'completei para o ritmo de 3 por dia — este cliente vem postando menos que isso'

export interface SlotParaProposta {
  /** "AAAA-MM-DD HH:mm" em Brasília, pronto para `criarPlano`. */
  scheduledDatetime: string
  /** "AAAA-MM-DD" em Brasília — a chave do espalhamento por dia. */
  data: string
  hora: string
  diaSemana?: string
  /** A frase que a pessoa lê ao revisar a leva. */
  motivo: string
  /** O `LearningSignal` do slot, quando a captura conseguiu registrá-lo. */
  sugestaoId?: string | null
  /** O modelo do cliente para aquele dia, quando existe. */
  modeloPageId?: string | null
  /** `true` quando o horário veio da grade-semente, não da cadência. */
  semente?: boolean
}

/** O dia em Brasília de um instante, em "AAAA-MM-DD". */
export function diaBRTDe(instante: Date): string {
  return new Date(instante.getTime() - OFFSET_BRT_MS).toISOString().slice(0, 10)
}

const DIAS_SEMANA_PT = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
]

function diaDaSemanaBRT(dataISO: string): string {
  const dia = new Date(`${dataISO}T12:00:00-03:00`).getUTCDay()
  return DIAS_SEMANA_PT[dia] ?? ''
}

/**
 * A grade-semente: três horários por dia, COMEÇANDO POR HOJE.
 *
 * Do dia de hoje entra só o que ainda dá para publicar (agora + 90 min) — o
 * resto do dia conta como coberto pelo que passou. É determinística à
 * granularidade do minuto (mesma entrada, mesma saída), o que faz duas
 * chamadas de `propor-semana` no mesmo momento produzirem as MESMAS chaves de
 * sugestão e, portanto, nenhum sinal duplicado.
 */
export function gradeSemente(opcoes: {
  agora: Date
  /** Quantos dias a leva cobre, CONTANDO hoje. */
  dias: number
  /** Teto de itens. */
  maxItens: number
  /**
   * O motivo que cada slot carrega. O default é o de cold start; quando o
   * cliente TEM rotina e ela só não alcança a janela pedida, quem chama passa
   * `ROTULO_DE_COMPLEMENTO` — dizer "não conheço a rotina" seria falso.
   */
  rotulo?: string
}): SlotParaProposta[] {
  const { agora, dias, maxItens } = opcoes
  const rotulo = opcoes.rotulo ?? ROTULO_DE_COLD_START
  const slots: SlotParaProposta[] = []

  // Dia a dia, COMEÇANDO POR HOJE, e dentro do dia os três horários — assim um
  // teto baixo corta o FIM da semana, não o segundo e o terceiro story de um
  // dia. Do dia de hoje entra só o horário que ainda dá para publicar
  // (`horaMinimaHoje`): propor 11:30 às 15h é a primeira coisa que faz alguém
  // desconfiar da leva inteira.
  for (let offset = 0; offset < dias && slots.length < maxItens; offset++) {
    const data = diaBRTDe(new Date(agora.getTime() + offset * 24 * 3_600_000))
    for (const hora of HORARIOS_SEMENTE) {
      if (slots.length >= maxItens) break
      if (offset === 0 && hora < horaMinimaHoje(agora)) continue
      slots.push({
        scheduledDatetime: `${data} ${hora}`,
        data,
        hora,
        diaSemana: diaDaSemanaBRT(data),
        motivo: `${rotulo}; escolhi um horário de ${NOME_DO_HORARIO[hora] ?? 'movimento'}`,
        semente: true,
      })
    }
  }

  return slots
}

/**
 * "HH:mm" mínimo para propor algo HOJE: agora em Brasília + 90 minutos de
 * folga — tempo de alguém revisar a copy e gerar a arte antes do horário.
 */
export function horaMinimaHoje(agora: Date): string {
  const brt = new Date(agora.getTime() - OFFSET_BRT_MS + 90 * 60_000)
  return `${String(brt.getUTCHours()).padStart(2, '0')}:${String(brt.getUTCMinutes()).padStart(2, '0')}`
}

/**
 * Quantos dias faltam até DOMINGO, contando hoje.
 *
 * "A semana vai até domingo" é como a agência planeja: a leva de terça cobre
 * terça a domingo (6 dias), a de segunda cobre a semana inteira (7). Domingo
 * propõe só o próprio domingo — a leva seguinte já é da próxima semana.
 */
export function diasAteDomingoBRT(agora: Date): number {
  const brt = new Date(agora.getTime() - OFFSET_BRT_MS)
  const dow = brt.getUTCDay() // 0 = domingo
  return dow === 0 ? 1 : 8 - dow
}

/**
 * Completa os dias que ficaram abaixo do ritmo, sem tocar no que a cadência já
 * sabia.
 *
 * 🔴 A cadência aprendida **espelha** o que o cliente fez; ela não puxa. Para
 * quem andou postando pouco — o Espeto caiu a 1,4 por dia — espelhar significa
 * propor uma semana magra e ajudar o cliente a continuar magro. Os slots reais
 * vêm primeiro e com o motivo estatístico deles; os completados entram nos
 * horários-semente que sobraram naquele dia, com o rótulo dizendo o que são.
 *
 * Dia que já tem o alvo (ou mais) não é tocado: quem publica quatro vezes na
 * sexta continua com as quatro.
 */
export function completarAteOAlvo(
  slots: SlotParaProposta[],
  opcoes: { agora: Date; dias: number; alvoPorDia?: number; maxItens: number },
): SlotParaProposta[] {
  const alvo = Math.max(1, opcoes.alvoPorDia ?? POSTS_POR_DIA_ALVO)
  const porDia = new Map<string, SlotParaProposta[]>()
  for (const s of slots) {
    const lista = porDia.get(s.data)
    if (lista) lista.push(s)
    else porDia.set(s.data, [s])
  }

  const saida = [...slots]
  for (let offset = 0; offset < opcoes.dias; offset++) {
    if (saida.length >= opcoes.maxItens) break
    const data = diaBRTDe(new Date(opcoes.agora.getTime() + offset * 24 * 3_600_000))
    const doDia = porDia.get(data) ?? []
    // Dia sem NENHUM slot real não é buraco de ritmo: é dia em que o cliente
    // não costuma publicar, e inventar três ali seria desenhar uma semana que
    // ele nunca teve. Só completa quem já tem pelo menos um.
    if (doDia.length === 0 || doDia.length >= alvo) continue

    const ocupadas = new Set(doDia.map((s) => s.hora))
    for (const hora of HORARIOS_SEMENTE) {
      if (doDia.length >= alvo || saida.length >= opcoes.maxItens) break
      if (ocupadas.has(hora)) continue
      // Hoje só completa com horário que ainda dá para cumprir.
      if (offset === 0 && hora < horaMinimaHoje(opcoes.agora)) continue
      const novo: SlotParaProposta = {
        scheduledDatetime: `${data} ${hora}`,
        data,
        hora,
        diaSemana: diaDaSemanaBRT(data),
        motivo: `${ROTULO_DE_COMPLEMENTO}; escolhi um horário de ${NOME_DO_HORARIO[hora] ?? 'movimento'}`,
        semente: true,
      }
      doDia.push(novo)
      ocupadas.add(hora)
      saida.push(novo)
    }
  }

  return saida.sort((a, b) => a.scheduledDatetime.localeCompare(b.scheduledDatetime))
}

/**
 * Escolhe até `maxItens` slots COBRINDO OS DIAS antes de repetir dia.
 *
 * `sugerirPosts` devolve os slots em ordem de dia e hora, e um `slice` ingênuo
 * daria uma leva inteira na segunda-feira: o projeto 3 devolve 36 slots em 14
 * dias, e o primeiro dia sozinho pode ter três. Uma semana proposta precisa
 * PARECER uma semana.
 *
 * A saída volta em ordem cronológica — a leva é lida de cima para baixo.
 */
export function espalharPorDia<T extends { data: string; scheduledDatetime: string }>(
  slots: T[],
  maxItens: number,
): T[] {
  if (maxItens <= 0) return []
  const ordenados = [...slots].sort((a, b) =>
    a.scheduledDatetime.localeCompare(b.scheduledDatetime),
  )

  const porDia = new Map<string, T[]>()
  for (const slot of ordenados) {
    const lista = porDia.get(slot.data)
    if (lista) lista.push(slot)
    else porDia.set(slot.data, [slot])
  }

  const escolhidos: T[] = []
  // Rodada a rodada: o primeiro de cada dia, depois o segundo de cada dia…
  // Enquanto houver dia sem nenhum slot escolhido, nenhum dia ganha o segundo.
  let rodada = 0
  let restam = true
  while (escolhidos.length < maxItens && restam) {
    restam = false
    for (const lista of porDia.values()) {
      if (rodada >= lista.length) continue
      restam = true
      if (escolhidos.length >= maxItens) break
      escolhidos.push(lista[rodada])
    }
    rodada += 1
  }

  return escolhidos.sort((a, b) => a.scheduledDatetime.localeCompare(b.scheduledDatetime))
}

// ── Assunto de cada slot ────────────────────────────────────────────────────

/** O que a distribuição do perfil aprendido diz sobre um pilar. */
export interface FracaoDePilar {
  pilar: string
  /** 0..1 — quanto das peças com assunto identificado é deste pilar. */
  fracao: number
}

export interface PilarEscolhido {
  slug: string
  nome: string
}

/**
 * Distribui os pilares pela leva.
 *
 * Três regras, em ordem de força:
 *
 *  1. **VARIEDADE**: nenhum assunto se repete enquanto houver pilar não usado.
 *     É requisito explícito da F3 — uma semana com dois "happy hour" é
 *     exatamente o que a taxonomia fechada da F2 veio evitar. Como o teto
 *     padrão da leva (7) é da ordem do tamanho da taxonomia (5 a 8), na prática
 *     esta regra sozinha resolve a semana inteira.
 *  2. **NUNCA DUAS SEGUIDAS**: passada a primeira volta, o assunto anterior sai
 *     da disputa enquanto houver alternativa. Repetir é aceitável; repetir
 *     COLADO é o que faz a leva parecer preguiçosa na tela.
 *  3. **PROPORÇÃO**: entre os que sobraram, ganha quem está mais atrás da sua
 *     fração no histórico do cliente. É o que faz um cliente 60/30/10 receber
 *     três do assunto principal e um do raro, em vez de dois de cada.
 *
 * 🔴 A ordem importa: um round-robin estrito (só os menos usados concorrem
 * SEMPRE) empataria 60/30/10 em 2-2-2, ou seja, ignoraria a distribuição
 * justamente onde ela tinha o que dizer. A variedade vale enquanto há assunto
 * novo a estrear; depois disso, quem manda é o peso.
 *
 * Taxonomia vazia devolve `null` em toda posição — "este cliente ainda não tem
 * taxonomia" é ausência de dado, nunca erro (mesmo contrato de
 * `taxonomiaAprovada`).
 */
export function distribuirPilares(
  quantidade: number,
  pilares: Array<Pick<Pilar, 'slug' | 'nome'>>,
  distribuicao: FracaoDePilar[] = [],
): Array<PilarEscolhido | null> {
  if (quantidade <= 0) return []
  if (pilares.length === 0) return Array.from({ length: quantidade }, () => null)

  const pesoDe = new Map(distribuicao.map((d) => [d.pilar, Math.max(0, d.fracao)]))
  /**
   * Pilar aprovado que nunca apareceu no histórico tem peso ZERO — e mesmo
   * assim entra na leva, porque a regra da variedade não olha peso. O que o
   * peso decide é a ORDEM e a repetição.
   */
  const somaConhecida = pilares.reduce((total, p) => total + (pesoDe.get(p.slug) ?? 0), 0)
  const candidatos = pilares.map((p, ordem) => ({
    slug: p.slug,
    nome: p.nome,
    ordem,
    // Sem distribuição nenhuma (cliente novo, histórico não classificado), o
    // peso é uniforme: a leva sai na ordem da taxonomia, que é a ordem que o
    // olho humano aprovou.
    peso: somaConhecida > 0 ? (pesoDe.get(p.slug) ?? 0) / somaConhecida : 1 / pilares.length,
    usos: 0,
  }))

  const saida: Array<PilarEscolhido | null> = []
  let anterior: string | null = null
  for (let i = 0; i < quantidade; i++) {
    const estreantes = candidatos.filter((c) => c.usos === 0)
    let elegiveis = estreantes.length > 0 ? estreantes : candidatos
    if (estreantes.length === 0 && elegiveis.length > 1) {
      const semOAnterior = elegiveis.filter((c) => c.slug !== anterior)
      if (semOAnterior.length > 0) elegiveis = semOAnterior
    }
    const alvo = i + 1
    const ordenados = [...elegiveis].sort((a, b) => {
      const deficit = b.peso * alvo - b.usos - (a.peso * alvo - a.usos)
      if (Math.abs(deficit) > 1e-9) return deficit
      if (Math.abs(b.peso - a.peso) > 1e-9) return b.peso - a.peso
      return a.ordem - b.ordem
    })
    const escolhido = ordenados[0]
    escolhido.usos += 1
    anterior = escolhido.slug
    saida.push({ slug: escolhido.slug, nome: escolhido.nome })
  }
  return saida
}

// ── Foto de cada slot ───────────────────────────────────────────────────────

/** Os três tipos de foto que a semana alterna (F3.2). */
export type TipoDeFoto = 'prato' | 'ambiente' | 'pessoas'

/**
 * A ordem importa: prato primeiro, porque "cardápio de mesa" é comida, não
 * salão. O casamento é por PREFIXO de token ("cortes" casa "corte"), nunca por
 * substring da pasta inteira — substring faria "05_sobremesas" virar ambiente
 * por conter "mesa".
 */
const TIPO_POR_PALAVRA: Array<[TipoDeFoto, string[]]> = [
  ['prato', ['corte', 'prato', 'comida', 'menu', 'gastronomia', 'cardapio']],
  ['ambiente', ['ambiente', 'salao', 'fachada', 'espaco', 'area', 'mesa']],
  ['pessoas', ['pessoa', 'equipe', 'cliente', 'time']],
]

/**
 * O tipo de uma foto pela heurística mais barata que existe: o PRIMEIRO NÍVEL
 * da pasta, que é como todos os acervos se organizam ("01_cortes",
 * "02_ambiente"…). Quando não dá para inferir, devolve `null` — e null nunca
 * bloqueia nada: a alternância de tipo é preferência, não trava.
 */
export function tipoDaPasta(folder: string | null | undefined): TipoDeFoto | null {
  const primeiroNivel = (folder ?? '').split('/')[0] ?? ''
  const tokens = primeiroNivel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // "salão"/"cardápio" casam sem acento
    .toLowerCase()
    .split(/[^a-z]+/) // dígito, "_", "-" e espaço separam ("01_cortes" → "cortes")
    .filter(Boolean)
  for (const [tipo, palavras] of TIPO_POR_PALAVRA) {
    if (tokens.some((t) => palavras.some((p) => t.startsWith(p)))) return tipo
  }
  return null
}

export interface OpcoesDeEscolhaDeFoto {
  /** Pastas já usadas na leva (F3.1) — duas picanhas da MESMA SESSÃO em dias seguidos também são repetição. */
  pastasUsadas?: Set<string>
  /** O tipo da foto do slot ANTERIOR (F3.2) — a semana alterna prato/ambiente/pessoas quando dá. */
  tipoAnterior?: TipoDeFoto | null
}

/**
 * A foto do item: a MELHOR RANQUEADA que ainda não entrou na leva.
 *
 * O acervo devolve as fotos ranqueadas, então o topo de cada lista é a
 * recomendação do sistema. Descer na lista é exceção, em camadas de força
 * decrescente:
 *
 *  1. foto livre em PASTA livre — arquivo e sessão inéditos na leva;
 *  2. foto livre em pasta repetida — repetir a sessão é menos ruim que repetir
 *     o arquivo;
 *  3. repetir a primeira — item sem imagem não vira arte, e repetir é um
 *     defeito visível e corrigível.
 *
 * Dentro da camada escolhida, o TIPO desempata (soft): entre as livres, a
 * primeira de tipo diferente do slot anterior vence o topo — é o que faz a
 * semana alternar prato/ambiente/pessoas em vez de sair toda de close de
 * prato. Tipo não inferível (`null`) nunca bloqueia nem vence: sem alternativa
 * de tipo diferente, vale o topo da camada.
 *
 * 🔴 Descer na lista JÁ NÃO polui o sinal (consertado em 30/08/2026): a arte
 * nascida de item de plano fecha a sugestão de foto comparando com a foto DO
 * CARD (`fotoDoCard` em `createArteRapida`, que `executar-plano` preenche com
 * `item.fotoDriveId`) — aceitar o que o card mostrou é `aceita-como-veio`
 * mesmo quando quem desceu na lista foi o sistema. `trocada` voltou a
 * significar o que diz: uma troca que a PESSOA fez.
 */
export function escolherFotoSemRepetir<T extends { driveFileId: string; folder?: string | null }>(
  candidatas: T[],
  jaUsadas: Set<string>,
  opcoes: OpcoesDeEscolhaDeFoto = {},
): T | null {
  if (candidatas.length === 0) return null
  const livres = candidatas.filter((c) => !jaUsadas.has(c.driveFileId))
  if (livres.length === 0) return candidatas[0]

  const pastas = opcoes.pastasUsadas
  // Foto sem pasta não tem sessão para repetir — conta como pasta livre.
  const emPastaLivre = pastas ? livres.filter((c) => !c.folder || !pastas.has(c.folder)) : livres
  const camada = emPastaLivre.length > 0 ? emPastaLivre : livres

  const anterior = opcoes.tipoAnterior ?? null
  if (anterior) {
    const alterna = camada.find((c) => {
      const tipo = tipoDaPasta(c.folder ?? null)
      return tipo !== null && tipo !== anterior
    })
    if (alterna) return alterna
  }
  return camada[0]
}

// ── Candidatas do card (F4, lado dado) ──────────────────────────────────────

/** Quantas fotos um card oferece: a escolhida + até 2 alternativas. */
export const MAX_CANDIDATAS_DO_CARD = 3

/**
 * Por que a foto ocupa a vaga: `score` veio do ranqueamento; `exploracao` é a
 * cota da foto nova/nunca-proposta — o que impede o ranking aprendido de
 * ossificar em cima das mesmas provadas.
 */
export type VagaDeCandidata = 'score' | 'exploracao'

/**
 * Uma candidata como o `ItemDePlano.fotoCandidatas` guarda. A escolhida é a
 * PRIMEIRA da lista; o card troca com um toque entre elas. `sugestaoId` é o
 * `LearningSignal` da BUSCA que propôs a lista (tipo `foto`) — é por ele que a
 * troca no card fecha o desfecho da proposta certa.
 */
export interface CandidataDeFoto {
  driveFileId: string
  fileName?: string | null
  vaga: VagaDeCandidata
  sugestaoId?: string | null
}

/** O que a montagem das candidatas precisa saber de cada foto da lista. */
export interface FotoParaCandidatura {
  driveFileId: string
  fileName?: string | null
  folder?: string | null
  /** Sem nenhum sinal e sem uso registrado — candidata à cota de exploração. */
  vagaDeExploracao?: boolean
  /** Cópia byte a byte de outra entrada — a identidade para "não repetir arquivo". */
  duplicataDe?: string | null
}

/** Duplicata byte a byte É o mesmo arquivo para efeito de repetição. */
function identidadeDoArquivo(f: FotoParaCandidatura): string {
  return f.duplicataDe ?? f.driveFileId
}

/**
 * As candidatas do card: a escolhida + até 2 alternativas da MESMA lista.
 *
 * As alternativas são LIVRES (não usadas na leva, não repetidas entre si — a
 * duplicata byte a byte conta como o mesmo arquivo) e, quando possível, de
 * pastas que ainda não apareceram entre as candidatas; faltando pasta nova, a
 * repetida entra — vaga vazia seria pior.
 *
 * **Uma das 3 vagas é reservada à exploração**: se nenhuma candidata é
 * `vagaDeExploracao`, a primeira foto livre marcada assim na lista toma a
 * última vaga (nunca a da escolhida). Se a escolhida — ou uma alternativa que
 * o score já trouxe — é exploração, a cota está paga e ninguém força outra.
 *
 * A `vaga` de cada candidata descreve a natureza dela (`exploracao` quando a
 * foto é nova/nunca-proposta), inclusive na escolhida — "conforme o caso".
 */
export function montarCandidatasDeFoto(
  lista: FotoParaCandidatura[],
  escolhida: FotoParaCandidatura,
  opcoes: { jaUsadas: Set<string>; sugestaoId?: string | null },
): CandidataDeFoto[] {
  const sugestaoId = opcoes.sugestaoId ?? null
  const escolhidas: FotoParaCandidatura[] = [escolhida]
  const arquivos = new Set([identidadeDoArquivo(escolhida), escolhida.driveFileId])
  const pastas = new Set(escolhida.folder ? [escolhida.folder] : [])

  const livre = (f: FotoParaCandidatura) =>
    !arquivos.has(identidadeDoArquivo(f)) &&
    !arquivos.has(f.driveFileId) &&
    !opcoes.jaUsadas.has(f.driveFileId)

  // Duas passadas: primeiro só pasta inédita; depois o que faltar — "sem
  // repetir pasta SE POSSÍVEL" nunca pode custar uma vaga vazia.
  for (const exigePastaNova of [true, false]) {
    for (const f of lista) {
      if (escolhidas.length >= MAX_CANDIDATAS_DO_CARD) break
      if (!livre(f)) continue
      if (exigePastaNova && f.folder && pastas.has(f.folder)) continue
      escolhidas.push(f)
      arquivos.add(identidadeDoArquivo(f))
      arquivos.add(f.driveFileId)
      if (f.folder) pastas.add(f.folder)
    }
  }

  if (!escolhidas.some((f) => f.vagaDeExploracao)) {
    const exploracao = lista.find((f) => f.vagaDeExploracao && livre(f))
    if (exploracao) {
      // Sai a última alternativa do score — nunca a escolhida, que é a 1ª.
      if (escolhidas.length >= MAX_CANDIDATAS_DO_CARD) escolhidas.pop()
      escolhidas.push(exploracao)
    }
  }

  return escolhidas.map((f) => ({
    driveFileId: f.driveFileId,
    fileName: f.fileName ?? null,
    vaga: f.vagaDeExploracao ? 'exploracao' : 'score',
    sugestaoId,
  }))
}

/**
 * O `fotoCandidatas` gravado no item, lido DEFENSIVAMENTE: o campo é Json e o
 * leitor pode encontrar qualquer coisa. Entrada sem `driveFileId` some, `vaga`
 * desconhecida vira `score` — inválido nunca derruba a tela nem a leva, porque
 * a verdade do que foi proposto mora no `LearningSignal`, não aqui.
 */
export function lerFotoCandidatas(bruto: unknown): CandidataDeFoto[] {
  if (!Array.isArray(bruto)) return []
  const saida: CandidataDeFoto[] = []
  for (const item of bruto) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const driveFileId = typeof c.driveFileId === 'string' ? c.driveFileId.trim() : ''
    if (!driveFileId) continue
    saida.push({
      driveFileId,
      fileName: typeof c.fileName === 'string' && c.fileName.trim() ? c.fileName.trim() : null,
      vaga: c.vaga === 'exploracao' ? 'exploracao' : 'score',
      sugestaoId:
        typeof c.sugestaoId === 'string' && c.sugestaoId.trim() ? c.sugestaoId.trim() : null,
    })
  }
  return saida
}
