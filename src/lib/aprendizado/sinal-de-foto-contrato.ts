/**
 * As preferências de foto — a parte PURA: como as linhas de `LearningSignal`
 * e de `PhotoUsage` viram escolhas, rejeições e feedbacks que o ranqueamento
 * do acervo consome (`ranquear-acervo.ts`).
 *
 * Módulo SEM Prisma de propósito — `@/lib/db` **lança no import** quando falta
 * `DATABASE_URL`, e o parse destas linhas é justamente o que mais precisa ser
 * conferido sem banco (precedente: `sinal-de-agendamento-contrato.ts`). Quem
 * consulta e delega é `sinal-de-foto.ts`.
 *
 * Postura DEFENSIVA por contrato (padrão `page-layers`): campo ausente ou
 * malformado é PULADO, nunca lança — estas linhas são Json de forma livre
 * gravado por várias safras de emissor, e um sinal estragado não pode derrubar
 * a leitura dos outros.
 *
 * Os tipos abaixo são declarados LOCALMENTE de propósito: `ranquear-acervo.ts`
 * declara os mesmos nomes e campos do lado dele, e nenhum dos dois módulos
 * puros depende do arquivo do outro.
 */

/** Uma foto que alguém LEVOU — o sinal positivo. */
export interface EscolhaDeFoto {
  driveFileId: string
  /** O tema da busca que a propôs (`sugerido.criterios.theme`); nulo sem tema. */
  tema: string | null
  /** ISO — quando a decisão aconteceu (`decididoEm`, com `sugeridoEm` de fallback). */
  quando: string
  sugestaoId?: string | null
  /**
   * De onde veio a evidência: `busca` (fechamento de uma proposta do acervo —
   * o default, e as escolhas antigas ficam sem o campo) ou `correcao` (a arte
   * do post foi SUBSTITUÍDA depois de pronta, e esta foto está na arte que
   * entrou — a via mais forte de preferência que existe).
   */
  forca?: 'busca' | 'correcao'
}

/** Uma foto proposta no TOPO (≤ 3) que a pessoa preteriu. */
export interface RejeicaoDeFoto {
  driveFileId: string
  tema: string | null
  /** ISO. */
  quando: string
  /** Posição em que ela foi oferecida (1-based). */
  posicao: number
  /** O chip pós-troca (`escolhido.motivo`), quando a pessoa disse o porquê. */
  motivo?: string | null
  sugestaoId?: string | null
}

/** O julgamento da ARTE que uma foto virou ("gostei"/"preciso melhorar"). */
export interface FeedbackDeFoto {
  driveFileId: string
  positivo: boolean
  /** O comentário cita foto/imagem/luz…? Negativo SEM menção pode ser da copy. */
  mencionaFoto: boolean
  /** ISO. */
  quando: string
}

export interface PreferenciasDeFoto {
  escolhas: EscolhaDeFoto[]
  rejeicoes: RejeicaoDeFoto[]
  feedbacks: FeedbackDeFoto[]
  /** ISO — a âncora do decaimento por recência (nunca o relógio de parede). */
  ultimaAtividade: string | null
}

/**
 * Uma linha de `LearningSignal` como o serviço a lê (select estreito). Datas
 * aceitam `Date` (Prisma) ou string ISO (fixtures) — o parse normaliza.
 */
export interface LinhaDeSinal {
  id: string
  desfecho?: string | null
  sugerido?: unknown
  escolhido?: unknown
  sugeridoEm?: Date | string | null
  decididoEm?: Date | string | null
  /** Só as linhas de `troca-de-arte` precisam dele aqui. */
  generationId?: string | null
}

/** Um par (foto, arte) vindo de `PhotoUsage` — já distinto, ou não; dedupe é daqui. */
export interface UsoDeFotoPorGeneration {
  driveFileId: string
  generationId: string | null
}

/** Uma linha de feedback de arte, já resolvida para a Generation que julga. */
export interface LinhaDeFeedbackDeArte {
  generationId: string | null
  escolhido?: unknown
  decididoEm?: Date | string | null
  updatedAt?: Date | string | null
}

/** Só as posições do TOPO contam como rejeição — abaixo disso ninguém olhou. */
export const TOPO_REJEITAVEL = 3

/**
 * O comentário fala da FOTO? Reprovação sem essas palavras pode ser da copy,
 * e rebaixar a foto por ela seria culpar a imagem pelo texto.
 */
export const MENCIONA_FOTO = /foto|imagem|luz|escur|clar|fundo|desfoc/i

export function mencionaFoto(comentario: unknown): boolean {
  return MENCIONA_FOTO.test(typeof comentario === 'string' ? comentario : '')
}

export function preferenciasVazias(): PreferenciasDeFoto {
  return { escolhas: [], rejeicoes: [], feedbacks: [], ultimaAtividade: null }
}

/** ISO válido ou null — nunca lança, nunca inventa data. */
function paraIso(valor: unknown): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString()
  }
  if (typeof valor === 'string' && valor.trim()) {
    const d = new Date(valor)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  return null
}

function epoch(valor: unknown): number | null {
  const iso = paraIso(valor)
  return iso ? new Date(iso).getTime() : null
}

function maiorEpoch(atual: number | null, ...valores: unknown[]): number | null {
  let maior = atual
  for (const v of valores) {
    const e = epoch(v)
    if (e !== null && (maior === null || e > maior)) maior = e
  }
  return maior
}

function isoDoEpoch(e: number | null): string | null {
  return e === null ? null : new Date(e).toISOString()
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/** `sugerido.criterios.theme`, defensivo. */
function temaDoSugerido(sugerido: unknown): string | null {
  if (!sugerido || typeof sugerido !== 'object' || Array.isArray(sugerido)) return null
  const criterios = (sugerido as { criterios?: unknown }).criterios
  if (!criterios || typeof criterios !== 'object' || Array.isArray(criterios)) return null
  return textoOuNulo((criterios as { theme?: unknown }).theme)
}

interface PropostaLida {
  driveFileId: string
  posicao: number
}

/** As entradas legíveis de `sugerido.propostas` — as malformadas são puladas. */
function propostasDoSugerido(sugerido: unknown): PropostaLida[] {
  if (!sugerido || typeof sugerido !== 'object' || Array.isArray(sugerido)) return []
  const lista = (sugerido as { propostas?: unknown }).propostas
  if (!Array.isArray(lista)) return []
  const out: PropostaLida[] = []
  for (const bruta of lista) {
    if (!bruta || typeof bruta !== 'object' || Array.isArray(bruta)) continue
    const driveFileId = (bruta as { driveFileId?: unknown }).driveFileId
    const posicao = (bruta as { posicao?: unknown }).posicao
    if (typeof driveFileId !== 'string' || !driveFileId) continue
    if (typeof posicao !== 'number' || !Number.isInteger(posicao) || posicao < 1) continue
    out.push({ driveFileId, posicao })
  }
  return out
}

/** O que o `escolhido` de um sinal de foto carrega, defensivamente. */
function escolhidoDaLinha(escolhido: unknown): { driveFileId: string | null; motivo: string | null } {
  if (!escolhido || typeof escolhido !== 'object' || Array.isArray(escolhido)) {
    return { driveFileId: null, motivo: null }
  }
  const bruto = escolhido as { driveFileId?: unknown; motivo?: unknown }
  return {
    driveFileId: typeof bruto.driveFileId === 'string' && bruto.driveFileId ? bruto.driveFileId : null,
    motivo: typeof bruto.motivo === 'string' && bruto.motivo ? bruto.motivo : null,
  }
}

/**
 * Agrega os sinais `tipo: 'foto'` já lidos do banco.
 *
 *  - `aceita-como-veio`/`trocada` com `escolhido.driveFileId` → uma ESCOLHA;
 *    e cada proposta do topo (posição ≤ 3) que não é a escolhida vira uma
 *    REJEIÇÃO, carregando o `motivo` do chip quando houver.
 *  - `expirada` → as propostas do topo viram rejeições sem motivo (ninguém
 *    levou nada — o topo foi visto e preterido por indiferença).
 *  - Pendentes e outros desfechos não produzem linha, mas TODA linha lida
 *    conta em `ultimaAtividade` — a recência é comparação DENTRO do histórico.
 */
export function agregarSinaisDeFoto(linhas: LinhaDeSinal[]): {
  escolhas: EscolhaDeFoto[]
  rejeicoes: RejeicaoDeFoto[]
  ultimaAtividade: string | null
} {
  const escolhas: EscolhaDeFoto[] = []
  const rejeicoes: RejeicaoDeFoto[] = []
  let ultima: number | null = null

  if (!Array.isArray(linhas)) return { escolhas, rejeicoes, ultimaAtividade: null }

  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object') continue
    ultima = maiorEpoch(ultima, linha.decididoEm, linha.sugeridoEm)

    const quando = paraIso(linha.decididoEm) ?? paraIso(linha.sugeridoEm)
    if (!quando) continue

    const tema = temaDoSugerido(linha.sugerido)
    const sugestaoId = typeof linha.id === 'string' && linha.id ? linha.id : null

    if (linha.desfecho === 'aceita-como-veio' || linha.desfecho === 'trocada') {
      const { driveFileId, motivo } = escolhidoDaLinha(linha.escolhido)
      if (!driveFileId) continue
      escolhas.push({ driveFileId, tema, quando, sugestaoId })
      for (const proposta of propostasDoSugerido(linha.sugerido)) {
        if (proposta.posicao > TOPO_REJEITAVEL) continue
        if (proposta.driveFileId === driveFileId) continue
        rejeicoes.push({
          driveFileId: proposta.driveFileId,
          tema,
          quando,
          posicao: proposta.posicao,
          motivo,
          sugestaoId,
        })
      }
      continue
    }

    if (linha.desfecho === 'expirada') {
      for (const proposta of propostasDoSugerido(linha.sugerido)) {
        if (proposta.posicao > TOPO_REJEITAVEL) continue
        rejeicoes.push({
          driveFileId: proposta.driveFileId,
          tema,
          quando,
          posicao: proposta.posicao,
          motivo: null,
          sugestaoId,
        })
      }
    }
  }

  return { escolhas, rejeicoes, ultimaAtividade: isoDoEpoch(ultima) }
}

/**
 * A CORREÇÃO PÓS-PRODUÇÃO — a via mais forte de preferência.
 *
 * `trocar-arte-do-post` grava um sinal `tipo: 'troca-de-arte'` com o
 * `generationId` da arte NOVA que entrou no lugar. Cruzando com `PhotoUsage`
 * (que sabe quais fotos aquela arte consumiu), cada foto da arte que VENCEU a
 * troca vira uma escolha `forca: 'correcao'` — alguém olhou a peça pronta no
 * post e decidiu que ESTA era melhor. O `escolhido` desses sinais não tem
 * tema, então `tema: null`.
 *
 * Troca sem `generationId`, ou cuja Generation não tem uso de foto registrado
 * (arte de upload, IA pura), simplesmente não produz linha.
 */
export function correcoesPosProducao(
  trocas: LinhaDeSinal[],
  usos: UsoDeFotoPorGeneration[],
): { escolhas: EscolhaDeFoto[]; ultimaAtividade: string | null } {
  const escolhas: EscolhaDeFoto[] = []
  let ultima: number | null = null

  if (!Array.isArray(trocas)) return { escolhas, ultimaAtividade: null }

  const fotosPorGeneration = new Map<string, Set<string>>()
  if (Array.isArray(usos)) {
    for (const uso of usos) {
      if (!uso || typeof uso !== 'object') continue
      if (typeof uso.generationId !== 'string' || !uso.generationId) continue
      if (typeof uso.driveFileId !== 'string' || !uso.driveFileId) continue
      const fotos = fotosPorGeneration.get(uso.generationId) ?? new Set<string>()
      fotos.add(uso.driveFileId)
      fotosPorGeneration.set(uso.generationId, fotos)
    }
  }

  for (const troca of trocas) {
    if (!troca || typeof troca !== 'object') continue
    ultima = maiorEpoch(ultima, troca.decididoEm, troca.sugeridoEm)

    const quando = paraIso(troca.decididoEm) ?? paraIso(troca.sugeridoEm)
    if (!quando) continue
    const generationId =
      typeof troca.generationId === 'string' && troca.generationId ? troca.generationId : null
    if (!generationId) continue
    const fotos = fotosPorGeneration.get(generationId)
    if (!fotos) continue

    const sugestaoId = typeof troca.id === 'string' && troca.id ? troca.id : null
    for (const driveFileId of fotos) {
      escolhas.push({ driveFileId, tema: null, quando, sugestaoId, forca: 'correcao' })
    }
  }

  return { escolhas, ultimaAtividade: isoDoEpoch(ultima) }
}

/** O parse de UMA linha de feedback de arte, para a foto que a arte usou. */
export function feedbackDaLinha(
  driveFileId: string,
  linha: LinhaDeFeedbackDeArte,
): FeedbackDeFoto | null {
  if (!driveFileId || !linha || typeof linha !== 'object') return null
  const escolhido = linha.escolhido
  if (!escolhido || typeof escolhido !== 'object' || Array.isArray(escolhido)) return null
  const veredito = (escolhido as { veredito?: unknown }).veredito
  if (veredito !== 'gostei' && veredito !== 'melhorar') return null
  const quando = paraIso(linha.decididoEm) ?? paraIso(linha.updatedAt)
  if (!quando) return null
  return {
    driveFileId,
    positivo: veredito === 'gostei',
    mencionaFoto: mencionaFoto((escolhido as { comentario?: unknown }).comentario),
    quando,
  }
}

/**
 * Cruza os usos de foto com os feedbacks das artes que elas viraram.
 *
 * Um par (foto, arte) produz no máximo UMA linha — `PhotoUsage` pode ter o
 * mesmo par duas vezes (semeadura + captura ao vivo), e contar o mesmo
 * julgamento em dobro inflaria o peso da foto.
 */
export function feedbacksDeFoto(
  usos: UsoDeFotoPorGeneration[],
  linhas: LinhaDeFeedbackDeArte[],
): FeedbackDeFoto[] {
  const out: FeedbackDeFoto[] = []
  if (!Array.isArray(usos) || !Array.isArray(linhas)) return out

  const porGeneration = new Map<string, LinhaDeFeedbackDeArte>()
  for (const linha of linhas) {
    if (!linha || typeof linha !== 'object') continue
    if (typeof linha.generationId !== 'string' || !linha.generationId) continue
    porGeneration.set(linha.generationId, linha)
  }

  const vistos = new Set<string>()
  for (const uso of usos) {
    if (!uso || typeof uso !== 'object') continue
    if (typeof uso.generationId !== 'string' || !uso.generationId) continue
    if (typeof uso.driveFileId !== 'string' || !uso.driveFileId) continue
    const par = `${uso.driveFileId}|${uso.generationId}`
    if (vistos.has(par)) continue
    vistos.add(par)

    const linha = porGeneration.get(uso.generationId)
    if (!linha) continue
    const feedback = feedbackDaLinha(uso.driveFileId, linha)
    if (feedback) out.push(feedback)
  }
  return out
}

/**
 * Monta as `PreferenciasDeFoto` inteiras a partir das linhas já lidas — o
 * único delegate que `lerPreferenciasDeFoto` chama. As escolhas da busca vêm
 * primeiro (sem `forca`), as correções pós-produção depois (`forca:
 * 'correcao'`); `ultimaAtividade` é o máximo entre as duas famílias de sinal.
 */
export function montarPreferencias(entrada: {
  sinaisDeFoto: LinhaDeSinal[]
  trocasDeArte: LinhaDeSinal[]
  usos: UsoDeFotoPorGeneration[]
  feedbacksDeArte: LinhaDeFeedbackDeArte[]
}): PreferenciasDeFoto {
  const daBusca = agregarSinaisDeFoto(entrada.sinaisDeFoto)
  const correcoes = correcoesPosProducao(entrada.trocasDeArte, entrada.usos)
  const ultima = maiorEpoch(null, daBusca.ultimaAtividade, correcoes.ultimaAtividade)
  return {
    escolhas: [...daBusca.escolhas, ...correcoes.escolhas],
    rejeicoes: daBusca.rejeicoes,
    feedbacks: feedbacksDeFoto(entrada.usos, entrada.feedbacksDeArte),
    ultimaAtividade: isoDoEpoch(ultima),
  }
}
