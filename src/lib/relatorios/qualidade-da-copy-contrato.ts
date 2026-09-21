/**
 * A QUALIDADE DA COPY, MEDIDA (PR 15 de "Marca simples, copy melhor", 12/09/2026).
 *
 * Consolida a captura que nasceu nos PRs 3 a 7 — o contrato da copy autoral
 * (`original` do autor × `efetiva` desenhada, com o histórico de revisões) e o
 * carimbo da voz — em quatro medidas para o relatório de domingo:
 *
 *  1. **Fidelidade até a agenda**: a copy que chegou ao post (o contrato da
 *     PÁGINA hoje, ou a efetiva da arte) é a que o autor escreveu? E, à parte,
 *     o SISTEMA deixou o texto como veio?
 *  2. **Causa de cada correção**: redação · compositor · foto · design ·
 *     revisor (e `indeterminada` quando não dá para saber).
 *  3. **Correções indevidas**: o sistema mudou linhas; um ajuste do revisor foi
 *     desfeito; alguém devolveu ao original o texto que o sistema mudou; um
 *     refino foi desfeito.
 *  4. **Tempo até o rascunho** (proxy declarado) e **voz refletida** (só
 *     contagem de carimbos).
 *
 * Regras que este módulo IMPÕE — e que não se relaxam "para o número sair":
 *
 * - 🔴 **A causa NUNCA sai só do autor.** `autor: 'equipe'` pode ser a pessoa
 *   corrigindo o texto (redação) ou o ajuste do REVISOR aplicado pelo app; o
 *   que separa é o motivo que `ajustarArte` grava em TODA chamada só de
 *   ajustes (`MOTIVO_DO_AJUSTE_DO_REVISOR`). Proximidade no tempo NÃO separa
 *   (C15-01): a correção de texto numa OUTRA chamada, um minuto depois do
 *   ajuste, é de quem a pediu. `sistema` na superfície do compositor é
 *   compositor; em `reverter-arte` é design.
 * - 🔴 **O esconder do revisor não passa pelo contrato** (C15-02): a camada
 *   escondida com a marca do PR 0 é lida como PRESENTE pela autoria
 *   (`camadasParaDecisao`), então nem o esconder nem a reexibição pela equipe
 *   geram revisão. O desfecho do ajuste de `visibilidade` se mede pelas
 *   CAMADAS — `revisao.aplicados` da arte do ajuste contra `Page.layers` de
 *   hoje, com `marcaDoRevisor`/`ocultaPeloRevisor` do PR 0 —, casado pelo id
 *   da camada, nunca pela função.
 * - 🔴 **O ajuste do revisor é classe PRÓPRIA e nunca vira preferência da
 *   equipe** — nem conta como redação. É a mesma regra do aprendizado ("a
 *   correção do revisor não pode virar preferência da equipe").
 * - **Amostra abaixo do limiar declarado não vira percentual**: a medida sai
 *   `amostraInsuficiente` com os números crus.
 * - **Legado fica FORA do denominador**: peça sem contrato, ou com autoria
 *   `desconhecida` (o adaptador do legado), não é "fiel" nem "infiel" — é
 *   excluída, e a contagem das excluídas sai junto.
 * - **Uma peça por página**: ajustar a arte cria Generation nova para a MESMA
 *   página; contar cada uma inflaria tudo. A peça é a página (ou a arte, quando
 *   a mídia não tem página) — e cada MÍDIA do post acha a sua pela URL exata
 *   (PR15-01): o carrossel de três páginas são três peças.
 * - 🔴 **A página de hoje só vale para o post que ainda a segue** (PR15-02):
 *   o congelado (publicado, entregue ao publicador) precisa de prova de que a
 *   mídia mostra o que a página mostra; sem prova, o snapshot da arte que ele
 *   publicou; sem snapshot, `congelada-sem-prova` — fora do denominador.
 * - **A mensagem é linhas E ordem de leitura** (PR15-03): trocar a `ordem` de
 *   dois blocos não é "mensagem preservada".
 *
 * Módulo PURO (tipos do contrato e leitores puros), sem Prisma: os testes rodam
 * sem banco e o script de medida o reusa.
 */

import type { CopyAutoral, RevisaoDaCopy } from '@/lib/copy-autoral/contrato'
import { registroDaCopyDaArte } from '@/lib/copy-autoral/registro-da-arte'
import { lerCopyAutoral } from '@/lib/copy-autoral/serializar'
import { blocosEmOrdem } from '@/lib/copy-autoral/validar'
import { lerCamadas, textosDaPagina } from '@/lib/posts/page-layers'
import { ehCopiaDaPagina, textosDoSlot } from '@/lib/posts/copy-segue-a-pagina'
import { lerCarimboDaVoz, type CarimboDaVoz, type FonteDaVoz } from '@/lib/brand/voz-na-escrita'
import { ocultaPeloRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'

export const VERSAO_DA_METRICA = 'qualidade-da-copy-v1' as const

/** Mínimo de peças COMPARÁVEIS para uma proporção por cliente virar percentual. */
export const LIMIAR_DE_AMOSTRA = 5
/** O mesmo, para a carteira inteira. */
export const LIMIAR_DE_AMOSTRA_DA_CARTEIRA = 15

/**
 * O motivo que `ajustarArte` grava na revisão da copy quando o ajuste é SÓ de
 * diagramação (os `ajustes` do revisor, sem texto trocado). É a marca mais
 * direta de que a mudança veio do revisor, assine quem assinar.
 */
export const MOTIVO_DO_AJUSTE_DO_REVISOR = 'ajuste de diagramação (revisor)'

/**
 * Janela que casa a arte de um ajuste do revisor com a revisão da copy que a
 * MESMA chamada gravou (a revisão entra na escrita das camadas e a Generation
 * nasce logo depois do render — segundos). Serve SÓ para não contar o mesmo
 * ajuste duas vezes; nunca para classificar uma revisão (C15-01).
 */
export const JANELA_DO_MESMO_AJUSTE_MS = 2 * 60_000

const SUPERFICIES_DO_COMPOSITOR = new Set(['compositor', 'recomposicao'])

export const CAUSAS = ['redacao', 'compositor', 'foto', 'design', 'revisor', 'indeterminada'] as const
export type CausaDaCorrecao = (typeof CAUSAS)[number]

export const TIPOS_DE_INDEVIDA = ['sistema-mudou-linhas', 'ajuste-do-revisor-revertido', 'equipe-voltou-ao-original', 'refino-revertido'] as const
export type TipoDeIndevida = (typeof TIPOS_DE_INDEVIDA)[number]

/** Quem produziu um estado da copy (por bloco). */
export type OrigemDaMudanca = 'autor' | 'compositor' | 'recomposicao' | 'revisor' | 'refino' | 'equipe' | 'claude' | 'sistema' | 'desconhecido'

const HUMANAS: ReadonlySet<OrigemDaMudanca> = new Set(['equipe', 'claude'])

// ─── o que o serviço lê do banco (formas cruas, Json como veio) ────────────

export type Instante = Date | string

export interface PostLido {
  id: string
  pageId: string | null
  generationId: string | null
  createdAt: Instante
  /**
   * As mídias, na ordem dos slides. `generationId` é UM ponteiro e responde só
   * pelo primeiro slide (PR15-01): cada mídia se casa com a sua arte pela URL.
   */
  mediaUrls: string[]
  /** `SocialPost.status` — com `laterPostId`, diz se a mídia ainda segue a página (PR15-02). */
  status: string
  /** Não nulo = entregue ao publicador: a mídia está congelada. */
  laterPostId: string | null
  /** A cópia do texto DESENHADO na mídia, quando marcada `_copiaDaPagina` (o render a regrava). */
  slotValues: unknown
}

export interface ArteLida {
  id: string
  /** `fieldValues.pageId`. */
  pageId: string | null
  /** A imagem ATUAL da arte — é pela URL exata que a mídia de um post se casa com ela. */
  resultUrl: string | null
  createdAt: Instante
  /** `fieldValues.source` (`compositor`, `ajuste-arte`, `arte-ia`…). */
  source: string | null
  canal: string | null
  /** `fieldValues.copyAutoral` = `{ original, efetiva, comparavel, lacunas? }`. */
  copyAutoral: unknown
  /** `fieldValues.revisao` — presente na arte de `ajustarArte` com `ajustes` do revisor. */
  revisao: unknown
  /** `fieldValues.ajustes` — os textos trocados naquele ajuste (vazio = só diagramação). */
  ajustes: unknown
  /** `fieldValues.composicao.avisos`. */
  avisos: unknown
  /** `fieldValues.recomposicao` — o registro do último render; até C6-01 a recusa também morava aqui (`estado: 'recusada'`). */
  recomposicao: unknown
  /** `fieldValues.recusaDaRecomposicao` (`{ em, errorCode, … }`) — onde `registrarRecusa` grava a recusa desde C6-01 (PR15-04). */
  recusaDaRecomposicao: unknown
  /** `fieldValues.vozNaEscrita`. */
  vozNaEscrita: unknown
  /** `fieldValues.modo` (melhoria: `rediagramar` | `redesenhar` | `refinar`). */
  modo?: string | null
}

export interface PaginaLida {
  id: string
  copyAutoral: unknown
  layers: unknown
}

export interface ItemLido {
  id: string
  postId: string | null
  pageId: string | null
  generationId: string | null
  createdAt: Instante
}

export interface SinalLido {
  tipo: string
  desfecho: string | null
  postId: string | null
  pageId: string | null
  generationId: string | null
  /** Para cortar o que veio depois da imagem que foi publicada (PR15-02). */
  createdAt?: Instante
}

export interface LeituraDaSemana {
  posts: PostLido[]
  artes: ArteLida[]
  paginas: PaginaLida[]
  itens: ItemLido[]
  sinais: SinalLido[]
}

// ─── utilitários ──────────────────────────────────────────────────────────

const tempo = (i: Instante): number => (i instanceof Date ? i.getTime() : Date.parse(i))
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const mesmasLinhas = (a: readonly string[] | undefined, b: readonly string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
const zeradas = (): Record<CausaDaCorrecao, number> => Object.fromEntries(CAUSAS.map((c) => [c, 0])) as Record<CausaDaCorrecao, number>
const linhasPorBloco = (copy: CopyAutoral): Record<string, string[]> => Object.fromEntries(copy.blocos.map((b) => [b.id, b.linhas]))

/** A copy lida sem lançar: forma inválida vira `null` (e a peça sai do denominador). */
function copyLida(v: unknown): CopyAutoral | null {
  if (v == null) return null
  return lerCopyAutoral(v).copy
}

/**
 * A revisão muda a MENSAGEM de algum bloco — as linhas, a ordem de leitura,
 * bloco acrescentado ou removido? A ordem entra pelo mesmo motivo que em
 * `mesmaMensagem` (PR15-03): sem ela, a peça reordenada pelo sistema saía
 * "não preservada" sem nenhuma mudança do sistema que a explicasse.
 */
export function revisaoMudaLinhas(r: RevisaoDaCopy): boolean {
  if (r.removidos?.length) return true
  return r.blocos.some((id) => !r.campos?.[id] || r.campos[id].includes('linhas') || r.campos[id].includes('ordem'))
}

/** A ordem de LEITURA: os ids dos blocos com texto, pela `ordem` do contrato — a ordem do array não é contrato. */
function ordemDeLeitura(copy: CopyAutoral): string[] {
  return blocosEmOrdem(copy)
    .filter((b) => b.linhas.length > 0)
    .map((b) => b.id)
}

/**
 * As duas copies dizem a MESMA mensagem: as mesmas linhas em cada bloco, literais,
 * E a mesma ordem de leitura (PR15-03 da revisão final do Codex, 18/09/2026: o
 * mapa id → linhas descartava a ordem, e trocar a `ordem` de dois blocos seguia
 * "mensagem preservada"). Função, grupo de leitura, estilo e fatos são COMO a
 * mensagem é desenhada — mudam a causa da correção, não a fidelidade.
 */
export function mesmaMensagem(a: CopyAutoral, b: CopyAutoral): boolean {
  const la = linhasPorBloco(a)
  const lb = linhasPorBloco(b)
  if (![...new Set([...Object.keys(la), ...Object.keys(lb)])].every((id) => mesmasLinhas(la[id], lb[id]))) return false
  return JSON.stringify(ordemDeLeitura(a)) === JSON.stringify(ordemDeLeitura(b))
}

/**
 * A cópia do texto DESENHADO (`_copiaDaPagina`, que o render regrava) prova
 * que a mídia mostra a mensagem de `medida`? (PR15-05 da revisão final do
 * Codex, 21/09/2026.) Só com o texto LITERAL — a quebra de linha é mensagem, e
 * o `copyIgual` do render colapsa espaço — e só quando não há ORDEM a provar:
 * um texto na página e no máximo um bloco com texto na copy medida. O registro
 * é um mapa por camada (e o jsonb nem guarda a ordem das chaves): não comprova
 * a ordem de leitura dos blocos, nem a das linhas de um bloco repartido em
 * camadas. Com mais que isso, a exclusão conservadora (`congelada-sem-prova`)
 * fica.
 */
function copiaProvaAMensagem(slotValues: unknown, layers: unknown, medida: CopyAutoral | null): boolean {
  const desenhada = textosDoSlot(slotValues)
  const hoje = Object.entries(textosDaPagina(layers))
  if (!desenhada || !medida || hoje.length !== 1 || ordemDeLeitura(medida).length > 1) return false
  const [[camada, texto]] = hoje
  return Object.keys(desenhada).length === 1 && desenhada[camada] === texto
}

/** A revisão mexe só em ESTILO (a segunda voz, a herança de estilo)? */
function soEstilo(r: RevisaoDaCopy): boolean {
  if (r.removidos?.length) return false
  return r.blocos.length > 0 && r.blocos.every((id) => (r.campos?.[id] ?? []).length > 0 && r.campos![id].every((c) => c === 'estilo'))
}

// ─── o revisor ────────────────────────────────────────────────────────────

export interface AjusteDoRevisor {
  em: Instante
  /** O ajuste não trocou texto nenhum (só diagramação). */
  soDiagramacao: boolean
}

/**
 * A CAUSA de uma revisão da copy. Nunca pelo autor sozinho — ver o cabeçalho.
 * O revisor é reconhecido pelo MOTIVO que a chamada só de ajustes grava, antes
 * de o autor humano virar "redação". Não há regra de proximidade no tempo: toda
 * revisão que só uma janela alcançaria é, por construção, de OUTRA chamada — a
 * de quem pediu o texto (C15-01).
 */
export function causaDaRevisao(r: RevisaoDaCopy): CausaDaCorrecao {
  if (r.motivo === MOTIVO_DO_AJUSTE_DO_REVISOR) return 'revisor'
  if (r.autor === 'equipe' || r.autor === 'claude') return soEstilo(r) ? 'design' : 'redacao'
  if (r.autor === 'sistema') {
    if (r.superficie && SUPERFICIES_DO_COMPOSITOR.has(r.superficie)) return 'compositor'
    if (r.superficie === 'reverter-arte') return 'design'
    return 'indeterminada'
  }
  return 'indeterminada'
}

/** Um ajuste de `visibilidade` que o revisor APLICOU (`fieldValues.revisao.aplicados` da arte do ajuste). */
export interface AjusteDeVisibilidade {
  em: number
  camadas: string[]
  /** `true` = escondeu (`detalhe: 'escondidas'`); `false` = mostrou. */
  escondeu: boolean
}

/** Os ajustes de visibilidade das artes do ajuste, em ordem. Forma inesperada é ignorada. */
export function ajustesDeVisibilidade(artes: ArteLida[]): AjusteDeVisibilidade[] {
  const saida: AjusteDeVisibilidade[] = []
  for (const a of artes) {
    if (a.source !== 'ajuste-arte') continue
    const aplicados = objeto(a.revisao)?.aplicados
    if (!Array.isArray(aplicados)) continue
    for (const x of aplicados) {
      const o = objeto(x)
      if (!o || o.tipo !== 'visibilidade' || !Array.isArray(o.camadas)) continue
      if (o.detalhe !== 'escondidas' && o.detalhe !== 'mostradas') continue
      const camadas = o.camadas.filter((c): c is string => typeof c === 'string' && c.length > 0)
      if (camadas.length) saida.push({ em: tempo(a.createdAt), camadas, escondeu: o.detalhe === 'escondidas' })
    }
  }
  return saida.sort((x, y) => x.em - y.em)
}

export type DesfechoDaVisibilidade = 'aceito' | 'desfeito' | 'camada-removida'

/**
 * O DESFECHO de cada camada que o revisor escondeu ou mostrou, pelas camadas
 * de HOJE (C15-02). Vale a ÚLTIMA decisão do revisor sobre a camada:
 *  - escondeu e ela continua escondida com a marca (`ocultaPeloRevisor`) → aceito;
 *  - escondeu e ela está VISÍVEL (com ou sem a marca esquecida) → desfeito: alguém a mostrou;
 *  - escondeu e ela está escondida SEM marca válida → aceito: o estado final é
 *    o do ajuste. É o caso de o editor tirar a marca porque a pessoa a escondeu
 *    de novo (`reconciliarMarcasDoRevisor`) e, também, o da marca MALFORMADA
 *    (`marcaDoRevisor` nulo): o que se mede é se a decisão sobreviveu, e a
 *    camada escondida é a decisão sobrevivendo (C15-12);
 *  - mostrou e ela está escondida → desfeito; visível → aceito;
 *  - a camada não existe mais → `camada-removida` (nem aceito nem desfeito).
 * Camadas ilegíveis devolvem `null`: ilegível nunca vira desfecho.
 */
export function desfechosDaVisibilidade(ajustes: AjusteDeVisibilidade[], layersDeHoje: unknown): Array<{ camada: string; desfecho: DesfechoDaVisibilidade }> | null {
  if (ajustes.length === 0) return []
  const { camadas, legivel } = lerCamadas(layersDeHoje)
  if (!legivel) return null
  const porId = new Map(camadas.map((c) => [String(c.id), c]))
  const ultima = new Map<string, boolean>()
  for (const a of ajustes) for (const c of a.camadas) ultima.set(c, a.escondeu)
  return [...ultima].map(([camada, escondeu]) => {
    const l = porId.get(camada)
    if (!l) return { camada, desfecho: 'camada-removida' as const }
    if (escondeu) {
      if (ocultaPeloRevisor(l)) return { camada, desfecho: 'aceito' as const }
      if (l.visible !== false) return { camada, desfecho: 'desfeito' as const }
      // Escondida sem marca válida (`ocultaPeloRevisor` exige a marca, então aqui
      // `marcaDoRevisor(l)` é sempre nulo): reescondida pela pessoa ou marca
      // malformada — o estado é o do ajuste (C15-12).
      return { camada, desfecho: 'aceito' as const }
    }
    return { camada, desfecho: l.visible === false ? ('desfeito' as const) : ('aceito' as const) }
  })
}

/** A origem da mudança que uma revisão representa, por bloco. */
function origemDaRevisao(r: RevisaoDaCopy, causa: CausaDaCorrecao): OrigemDaMudanca {
  if (causa === 'revisor') return 'revisor'
  if (causa === 'compositor') return r.superficie === 'recomposicao' ? 'recomposicao' : 'compositor'
  if (r.autor === 'equipe' || r.autor === 'claude') return r.autor
  if (r.autor === 'sistema') return 'sistema'
  return 'desconhecido'
}

// ─── a peça ───────────────────────────────────────────────────────────────

/** Um estado da copy no tempo, com a origem de cada bloco. */
export interface EstadoDaCopy {
  em: number
  linhas: Record<string, string[]>
  origem: Record<string, OrigemDaMudanca> | OrigemDaMudanca
}

export interface PecaParaMedir {
  chave: string
  pageId: string | null
  postIds: string[]
  original: CopyAutoral | null
  final: CopyAutoral | null
  /** `congelada-sem-prova`: há post congelado e nada prova que a mídia dele mostra a copy medida (PR15-02). */
  exclusao: 'sem-contrato' | 'autoria-desconhecida' | 'congelada-sem-prova' | 'sem-copy-final' | null
  estados: EstadoDaCopy[]
  /** O desfecho dos ajustes de visibilidade do revisor, pelas camadas de hoje. `null` = camadas ilegíveis. */
  visibilidade: Array<{ camada: string; desfecho: DesfechoDaVisibilidade }> | null
  /**
   * A peça não tem PÁGINA lida (C15-11): a arte não aponta página, ou a página
   * não veio. Sem as camadas não há como medir o esconder do revisor — e isso é
   * contado, nunca um zero calado.
   */
  semPagina: boolean
  evidencias: { trocasDeArte: number; fotosTrocadas: number; geometria: number; recusasDoCompositor: number; avisosDoSistema: number; ajustesDoRevisorSemRevisaoDeCopy: number }
  tempo: { inicioEm: number | null; rascunhoEm: number | null }
  voz: CarimboDaVoz | null
}

function origemDoEstadoDaArte(arte: ArteLida, efetiva: CopyAutoral): OrigemDaMudanca {
  if (arte.modo === 'refinar') return 'refino'
  if (arte.source === 'ajuste-arte') {
    const soDiagramacao = !objeto(arte.ajustes) || Object.keys(objeto(arte.ajustes)!).length === 0
    if (objeto(arte.revisao) && soDiagramacao) return 'revisor'
    return arte.canal === 'studio' ? 'equipe' : 'claude'
  }
  if (arte.source === 'compositor') {
    const ultima = efetiva.revisoes[efetiva.revisoes.length - 1]
    return ultima?.superficie === 'recomposicao' ? 'recomposicao' : 'compositor'
  }
  return 'sistema'
}

function origemNoEstado(e: EstadoDaCopy, id: string): OrigemDaMudanca {
  return typeof e.origem === 'string' ? e.origem : (e.origem[id] ?? 'autor')
}

/**
 * O post ainda SEGUE a página: rascunho ou agendado, ainda não entregue ao
 * publicador. É o alcance de `invalidateScheduledRenders` e da recomposição
 * (`SITUACOES_ALCANCADAS` com `laterPostId: null`, em `recompor.ts`): editar a
 * página refaz a mídia desses posts e de nenhum outro. Publicado, publicando,
 * falho ou já entregue ao Zernio, a mídia está CONGELADA (PR15-02).
 */
export function postVivo(p: Pick<PostLido, 'status' | 'laterPostId'>): boolean {
  return (p.status === 'DRAFT' || p.status === 'SCHEDULED') && !p.laterPostId
}

/**
 * A recomposição recusou a linha que não cabe — na chave própria desde C6-01,
 * ou no registro antigo. Uma por arte (PR15-04). Com `ate` (o instante do PNG
 * congelado), só a recusa registrada até ele, pelo `em` DELA (PR15-07 da
 * revisão final do Codex, 21/09/2026): a recusa não troca o PNG, e a de depois
 * foi a tentativa de levar a outro post uma edição que a mídia congelada nunca
 * recebeu. Recusa sem `em` legível não prova que veio antes.
 */
export function recusouPorTextoQueNaoCabe(a: ArteLida, ate: number | null = null): boolean {
  const naoCabe = (r: Record<string, unknown> | null) =>
    !!r && typeof r.errorCode === 'string' && r.errorCode.startsWith('TEXTO_NAO_CABE') && (ate == null || (typeof r.em === 'string' && Date.parse(r.em) <= ate))
  if (naoCabe(objeto(a.recusaDaRecomposicao))) return true
  const antiga = objeto(a.recomposicao)
  return antiga?.estado === 'recusada' && naoCabe(antiga)
}

/** Uma mídia de um post na peça, e a arte que a descreve. */
interface Ocorrencia {
  post: PostLido
  indice: number
  arte: ArteLida | null
  /** A arte casou pela URL EXATA da mídia — só então a efetiva dela descreve ESTA imagem. */
  porUrl: boolean
}

/** O instante do PNG ATUAL da arte: a recomposição e o re-render em lugar registram `recomposicao.em`. */
function instanteDoPng(a: ArteLida): number {
  const r = objeto(a.recomposicao)
  const refeita = r && (r.estado === 'feita' || r.estado === 're-renderizada') && typeof r.em === 'string' ? Date.parse(r.em) : NaN
  return Math.max(tempo(a.createdAt), Number.isFinite(refeita) ? refeita : -Infinity)
}

interface FinalDaPeca {
  final: CopyAutoral | null
  /** O final é o contrato da PÁGINA hoje (e entra na linha do tempo como o último estado). */
  daPagina: boolean
  /** Snapshot: o instante do PNG congelado — o que veio depois não chegou à mídia. */
  corte: number | null
  congeladaSemProva: boolean
}

/**
 * A copy final da peça (PR15-02 da revisão final do Codex, 18/09/2026). A
 * PÁGINA de hoje só vale quando representa a mídia de CADA post da peça: o post
 * vivo a segue (a edição refaz a mídia dele); o congelado não.
 *  1. Só congelados, todos mostrando a MESMA arte pela URL exata: o SNAPSHOT —
 *     a efetiva dela É a copy daquela imagem (quem troca o PNG regrava o
 *     registro, PR3-F02), com a história até ali; o que veio depois do PNG sai
 *     da medida (a edição de depois não chegou à mídia, nem como texto, nem
 *     como geometria). Não vale com ajuste de VISIBILIDADE do revisor até a
 *     arte: a efetiva lida das camadas cruas contaria o bloco escondido como
 *     texto apagado.
 *  2. Senão, a página (ou a arte mais nova) com PROVA para cada mídia
 *     congelada de que ela mostra a mesma mensagem de hoje: a arte casada pela
 *     URL exata tem a mensagem que as camadas de hoje desenhariam (a conta do
 *     registro da arte, `registroDaCopyDaArte`, sobre as camadas CRUAS — o que
 *     o revisor escondeu sai dos dois lados); ou o post de uma mídia só carrega
 *     a cópia do texto DESENHADO (`_copiaDaPagina`, regravada a cada render) e
 *     ela é, LITERAL, o texto de hoje de uma peça sem ordem a provar
 *     (`copiaProvaAMensagem`, PR15-05).
 *  3. Sem snapshot nem prova, a peça sai do denominador
 *     (`congelada-sem-prova`) — nunca a página de hoje atribuída a um post que
 *     ela não alcançou.
 */
function finalDaPeca(ocorrencias: Ocorrencia[], artes: ArteLida[], pagina: PaginaLida | undefined): FinalDaPeca {
  const daPagina = pagina ? copyLida(pagina.copyAutoral) : null
  let candidato = daPagina
  for (let i = artes.length - 1; i >= 0 && !candidato; i--) candidato = copyLida(objeto(artes[i].copyAutoral)?.efetiva)
  const semCorte: FinalDaPeca = { final: candidato, daPagina: !!daPagina, corte: null, congeladaSemProva: false }
  const congeladas = ocorrencias.filter((o) => !postVivo(o.post))
  if (congeladas.length === 0) return semCorte

  const x = congeladas[0].arte
  if (x && congeladas.length === ocorrencias.length && congeladas.every((o) => o.porUrl && o.arte?.id === x.id)) {
    const efetiva = copyLida(objeto(x.copyAutoral)?.efetiva)
    const corte = instanteDoPng(x)
    if (efetiva && ajustesDeVisibilidade(artes.filter((a) => tempo(a.createdAt) <= corte)).length === 0) {
      return { final: efetiva, daPagina: false, corte, congeladaSemProva: false }
    }
  }

  const provada = (o: Ocorrencia): boolean => {
    const desenhada = o.arte && o.porUrl ? copyLida(objeto(o.arte.copyAutoral)?.efetiva) : null
    if (desenhada) {
      const hoje = pagina
        ? (registroDaCopyDaArte({ anterior: o.arte!.copyAutoral, contratoDaPagina: pagina.copyAutoral, camadas: pagina.layers, superficie: 'metrica' }).registro?.efetiva ?? null)
        : candidato
      if (hoje && mesmaMensagem(desenhada, hoje)) return true
    }
    return (
      !!pagina &&
      o.indice === 0 &&
      o.post.mediaUrls.length <= 1 &&
      o.post.pageId === pagina.id &&
      ehCopiaDaPagina(o.post.slotValues) &&
      lerCamadas(pagina.layers).legivel &&
      copiaProvaAMensagem(o.post.slotValues, pagina.layers, candidato)
    )
  }
  if (congeladas.every(provada)) return semCorte
  return { final: null, daPagina: false, corte: null, congeladaSemProva: true }
}

/**
 * Agrupa o que foi lido em PEÇAS: uma por página (ou por arte, quando a mídia
 * não tem página), com o original do autor, a copy final, a linha do tempo dos
 * estados e as evidências de correção fora da copy.
 *
 * 🔴 Cada MÍDIA do post acha a sua peça (PR15-01 da revisão final do Codex,
 * 18/09/2026): `SocialPost.generationId` é UM ponteiro e responde só pelo slide
 * 1 — o carrossel de três páginas do compositor virava uma peça só, e o que
 * acontecia nos slides 2 e 3 sumia sem exclusão nem aviso. A mídia casa com a
 * arte pela URL EXATA (a mais recente vence, a regra de `artes-do-post.ts`); a
 * coluna e o `pageId` do post respondem só pelo slide 1. Slide sem arte nem
 * página (a foto do acervo, o vídeo) não é peça de copy. Sinal e item de plano
 * vão a UMA peça só — a da página, a da arte, ou a primeira peça do post —,
 * senão o sinal que só diz o post contaria uma vez por slide.
 */
export function montarPecas(l: LeituraDaSemana): PecaParaMedir[] {
  const artePorId = new Map(l.artes.map((a) => [a.id, a]))
  const artePorUrl = new Map<string, ArteLida>()
  // O RASTRO: as URLs que a arte já teve (`recomposicao.urlsAnteriores`). A
  // recomposição para outro post vivo troca a `resultUrl`, e a mídia congelada
  // continua com a antiga (PR15-06 da revisão final do Codex, 21/09/2026).
  const artePorUrlAntiga = new Map<string, ArteLida>()
  for (const a of [...l.artes].sort((x, y) => tempo(x.createdAt) - tempo(y.createdAt))) {
    if (a.resultUrl) artePorUrl.set(a.resultUrl, a)
    const rastro = objeto(a.recomposicao)?.urlsAnteriores
    if (Array.isArray(rastro)) for (const u of rastro) if (typeof u === 'string' && u) artePorUrlAntiga.set(u, a)
  }
  const paginaPorId = new Map(l.paginas.map((p) => [p.id, p]))

  const grupos = new Map<string, { pageId: string | null; ocorrencias: Ocorrencia[]; arteDireta: ArteLida | null }>()
  const primeiraPecaDoPost = new Map<string, string>()
  const adicionar = (chave: string, pageId: string | null, o: Ocorrencia) => {
    const g = grupos.get(chave) ?? { pageId, ocorrencias: [], arteDireta: null }
    g.ocorrencias.push(o)
    if (!pageId && o.arte) g.arteDireta = o.arte
    grupos.set(chave, g)
    if (!primeiraPecaDoPost.has(o.post.id)) primeiraPecaDoPost.set(o.post.id, chave)
  }
  for (const post of l.posts) {
    const daColuna = post.generationId ? (artePorId.get(post.generationId) ?? null) : null
    const midias: Array<string | null> = post.mediaUrls.length ? post.mediaUrls : [null]
    let achou = false
    midias.forEach((url, indice) => {
      const porUrl = url ? (artePorUrl.get(url) ?? null) : null
      // Pelo rastro: a arte e a página são desta mídia, mas a efetiva ATUAL da
      // arte descreve outra imagem — o vínculo serve para CONTAR a peça (e a
      // exclusão, sem prova), nunca como snapshot (`porUrl` fica falso).
      const peloRastro = !porUrl && url ? (artePorUrlAntiga.get(url) ?? null) : null
      const arte = porUrl ?? peloRastro ?? (indice === 0 ? daColuna : null)
      const pageId = porUrl ? porUrl.pageId : peloRastro ? peloRastro.pageId : indice === 0 ? (post.pageId ?? daColuna?.pageId ?? null) : null
      if (!arte && !pageId) return
      achou = true
      adicionar(pageId ? `page:${pageId}` : `gen:${arte!.id}`, pageId, { post, indice, arte, porUrl: !!porUrl })
    })
    // Nada resolvido (render ainda pendente, mídia de fora sem ponteiro): o post é a sua própria peça.
    if (!achou) adicionar(`post:${post.id}`, null, { post, indice: 0, arte: null, porUrl: false })
  }

  // As artes de cada peça — deduplicação por página: TODAS as da página numa peça só.
  const artesPorPagina = new Map<string, ArteLida[]>()
  for (const a of l.artes) if (a.pageId) (artesPorPagina.get(a.pageId) ?? artesPorPagina.set(a.pageId, []).get(a.pageId)!).push(a)
  const artesDaPeca = new Map<string, ArteLida[]>()
  const pecaPorPagina = new Map<string, string>()
  const pecaPorArte = new Map<string, string>()
  for (const [chave, g] of grupos) {
    const artes = (g.pageId ? (artesPorPagina.get(g.pageId) ?? []) : g.arteDireta ? [g.arteDireta] : [])
      .filter((a, i, xs) => xs.findIndex((x) => x.id === a.id) === i)
      .sort((a, b) => tempo(a.createdAt) - tempo(b.createdAt))
    artesDaPeca.set(chave, artes)
    if (g.pageId) pecaPorPagina.set(g.pageId, chave)
    for (const a of artes) if (!pecaPorArte.has(a.id)) pecaPorArte.set(a.id, chave)
  }
  const pecaDoVinculo = (v: { postId: string | null; pageId: string | null; generationId: string | null }): string | undefined =>
    (v.pageId != null ? pecaPorPagina.get(v.pageId) : undefined) ??
    (v.generationId != null ? pecaPorArte.get(v.generationId) : undefined) ??
    (v.postId != null ? primeiraPecaDoPost.get(v.postId) : undefined)
  const porPeca = <T extends { postId: string | null; pageId: string | null; generationId: string | null }>(xs: T[]) => {
    const m = new Map<string, T[]>()
    for (const x of xs) {
      const chave = pecaDoVinculo(x)
      if (chave) (m.get(chave) ?? m.set(chave, []).get(chave)!).push(x)
    }
    return m
  }
  const sinaisPorPeca = porPeca(l.sinais)
  const itensPorPeca = porPeca(l.itens)

  const pecas: PecaParaMedir[] = []
  for (const [chave, g] of grupos) {
    const pagina = g.pageId ? paginaPorId.get(g.pageId) : undefined
    const todas = artesDaPeca.get(chave)!
    const { final, daPagina, corte, congeladaSemProva } = finalDaPeca(g.ocorrencias, todas, pagina)
    // Snapshot: a arte que veio depois do PNG congelado não chegou à mídia.
    const artes = corte == null ? todas : todas.filter((a) => tempo(a.createdAt) <= corte)
    const posts = [...new Map(g.ocorrencias.map((o) => [o.post.id, o.post])).values()]
    const postIds = posts.map((p) => p.id)

    // O original do AUTOR: o da primeira arte que o gravou.
    let original: CopyAutoral | null = null
    let arteDoOriginal: ArteLida | null = null
    for (const a of artes) {
      const c = copyLida(objeto(a.copyAutoral)?.original)
      if (c) {
        original = c
        arteDoOriginal = a
        break
      }
    }

    const exclusao: PecaParaMedir['exclusao'] = !original
      ? 'sem-contrato'
      : original.origem.autor === 'desconhecido'
        ? 'autoria-desconhecida'
        : congeladaSemProva
          ? 'congelada-sem-prova'
          : !final
            ? 'sem-copy-final'
            : null

    const ajustesDoRevisor: AjusteDoRevisor[] = artes
      .filter((a) => a.source === 'ajuste-arte' && objeto(a.revisao))
      .map((a) => ({ em: a.createdAt, soDiagramacao: !objeto(a.ajustes) || Object.keys(objeto(a.ajustes)!).length === 0 }))
    const visibilidade = pagina && corte == null ? desfechosDaVisibilidade(ajustesDeVisibilidade(artes), pagina.layers) : []

    // A linha do tempo: o original, as efetivas das artes, e a página hoje.
    const estados: EstadoDaCopy[] = []
    if (original && arteDoOriginal) estados.push({ em: tempo(arteDoOriginal.createdAt) - 1, linhas: linhasPorBloco(original), origem: 'autor' })
    for (const a of artes) {
      const efetiva = copyLida(objeto(a.copyAutoral)?.efetiva)
      if (!efetiva) continue
      const origem = origemDoEstadoDaArte(a, efetiva)
      // A arte do ajuste SÓ do revisor fica fora da linha do tempo: a efetiva
      // dela é lida das camadas cruas, e o bloco que o revisor escondeu sai
      // `linhas: []` — um "texto mudado" que a copy nunca teve. O desfecho do
      // esconder se mede pelas camadas (`visibilidade`, C15-02).
      if (origem === 'revisor') continue
      estados.push({ em: tempo(a.createdAt), linhas: linhasPorBloco(efetiva), origem })
    }
    if (final && daPagina) {
      const origem: Record<string, OrigemDaMudanca> = {}
      for (const r of final.revisoes) {
        const o = origemDaRevisao(r, causaDaRevisao(r))
        for (const id of r.blocos) origem[id] = o
      }
      const ultimaEm = final.revisoes.length ? Math.max(...final.revisoes.map((r) => tempo(r.em)).filter(Number.isFinite)) : -Infinity
      estados.push({ em: Math.max(ultimaEm, estados.length ? estados[estados.length - 1].em + 1 : 0), linhas: linhasPorBloco(final), origem })
    }
    estados.sort((a, b) => a.em - b.em)

    // Evidências fora da copy. No snapshot congelado, evento sem instante legível
    // não prova que veio antes do PNG e fica fora — a mesma regra da recusa (PR15-07).
    const sinais = (sinaisPorPeca.get(chave) ?? []).filter((s) => corte == null || (s.createdAt != null && tempo(s.createdAt) <= corte))
    const recusasDoCompositor = artes.filter((a) => recusouPorTextoQueNaoCabe(a, corte)).length
    const avisosDoSistema = artes.reduce((t, a) => t + (a.source === 'compositor' && Array.isArray(a.avisos) ? a.avisos.length : 0), 0)
    // Ajuste do revisor que não deixou revisão de copy (mexeu só em corpo,
    // posição, gradiente): é correção de classe revisor mesmo assim.
    const revisoesDoRevisor = (final?.revisoes ?? []).filter((r) => causaDaRevisao(r) === 'revisor')
    const ajustesDoRevisorSemRevisaoDeCopy = ajustesDoRevisor.filter((a) => !revisoesDoRevisor.some((r) => Math.abs(tempo(r.em) - tempo(a.em)) <= JANELA_DO_MESMO_AJUSTE_MS)).length

    const itens = itensPorPeca.get(chave) ?? []
    const inicios = [...itens.map((it) => tempo(it.createdAt)), ...(itens.length ? [] : artes.map((a) => tempo(a.createdAt)))].filter(Number.isFinite)
    const rascunhos = posts.map((p) => tempo(p.createdAt)).filter(Number.isFinite)

    const arteDaVoz = arteDoOriginal ?? artes.find((a) => a.vozNaEscrita != null) ?? null

    pecas.push({
      chave,
      pageId: g.pageId,
      postIds,
      original,
      final,
      exclusao,
      estados,
      visibilidade,
      semPagina: !pagina,
      evidencias: {
        trocasDeArte: sinais.filter((s) => s.tipo === 'troca-de-arte').length,
        fotosTrocadas: sinais.filter((s) => s.tipo === 'foto' && s.desfecho === 'trocada').length,
        geometria: sinais.filter((s) => s.tipo === 'geometria').length,
        recusasDoCompositor,
        avisosDoSistema,
        ajustesDoRevisorSemRevisaoDeCopy,
      },
      tempo: { inicioEm: inicios.length ? Math.min(...inicios) : null, rascunhoEm: rascunhos.length ? Math.min(...rascunhos) : null },
      voz: arteDaVoz ? lerCarimboDaVoz(arteDaVoz.vozNaEscrita) : null,
    })
  }
  return pecas
}

// ─── medidas por peça ─────────────────────────────────────────────────────

export interface MedidaDaPeca {
  chave: string
  comparavel: boolean
  exclusao: PecaParaMedir['exclusao']
  /** A copy que chegou à agenda é, bloco a bloco, a que o autor escreveu. `null` fora do denominador. */
  preservada: boolean | null
  /** Alguma revisão do SISTEMA (compositor/recomposição) mudou o texto. */
  sistemaMudouLinhas: boolean
  correcoes: Record<CausaDaCorrecao, number>
  /** `bloco` quando a indevida é de texto; `camada` quando é de visibilidade (C15-02). */
  indevidas: Array<{ tipo: TipoDeIndevida; bloco: string | null; camada?: string }>
  /** O desfecho dos ajustes de visibilidade do revisor. `null` = camadas ilegíveis. */
  visibilidadeDoRevisor: { aceitos: number; desfeitos: number; removidas: number } | null
  /** Sem página lida: o desfecho da visibilidade do revisor NÃO foi medido (C15-11). */
  semPagina: boolean
  minutosAteRascunho: number | null
  voz: CarimboDaVoz | null
  avisosDoSistema: number
}

/** Devolve ao original o texto que o sistema, o revisor ou o refino mudou — pela linha do tempo, bloco a bloco. */
export function reversoesIndevidas(estados: EstadoDaCopy[], original: CopyAutoral | null): Array<{ tipo: TipoDeIndevida; bloco: string }> {
  const achados: Array<{ tipo: TipoDeIndevida; bloco: string }> = []
  const ids = new Set(estados.flatMap((e) => Object.keys(e.linhas)))
  const doOriginal = original ? linhasPorBloco(original) : {}
  for (const id of ids) {
    for (let j = 1; j < estados.length; j++) {
      const antes = estados[j - 1].linhas[id]
      const mudado = estados[j].linhas[id]
      if (mesmasLinhas(antes, mudado)) continue
      const quem = origemNoEstado(estados[j], id)
      if (quem !== 'revisor' && quem !== 'refino' && quem !== 'compositor' && quem !== 'recomposicao') continue
      for (let k = j + 1; k < estados.length; k++) {
        const anterior = estados[k - 1].linhas[id]
        const agora = estados[k].linhas[id]
        if (mesmasLinhas(anterior, agora)) continue
        if (!HUMANAS.has(origemNoEstado(estados[k], id))) continue
        if (!mesmasLinhas(agora, antes) || mesmasLinhas(agora, mudado)) continue
        if (quem === 'revisor') achados.push({ tipo: 'ajuste-do-revisor-revertido', bloco: id })
        else if (quem === 'refino') achados.push({ tipo: 'refino-revertido', bloco: id })
        else if (id in doOriginal && mesmasLinhas(agora, doOriginal[id])) achados.push({ tipo: 'equipe-voltou-ao-original', bloco: id })
        break
      }
    }
  }
  // Dedupe (bloco, tipo): a mesma reversão enxergada por dois estados é uma só.
  return achados.filter((a, i, xs) => xs.findIndex((x) => x.tipo === a.tipo && x.bloco === a.bloco) === i)
}

export function medirPeca(p: PecaParaMedir): MedidaDaPeca {
  const comparavel = p.exclusao === null
  const correcoes = zeradas()
  const indevidas: MedidaDaPeca['indevidas'] = []
  let sistemaMudouLinhas = false
  let preservada: boolean | null = null

  if (comparavel && p.original && p.final) {
    preservada = mesmaMensagem(p.original, p.final)

    for (const r of p.final.revisoes) {
      const causa = causaDaRevisao(r)
      correcoes[causa]++
      if (causa === 'compositor' && revisaoMudaLinhas(r)) sistemaMudouLinhas = true
    }
    // Sem página, a efetiva da arte guarda a revisão do compositor.
    if (sistemaMudouLinhas) indevidas.push({ tipo: 'sistema-mudou-linhas', bloco: null })
    indevidas.push(...reversoesIndevidas(p.estados, p.original))
    for (const v of p.visibilidade ?? []) if (v.desfecho === 'desfeito') indevidas.push({ tipo: 'ajuste-do-revisor-revertido', bloco: null, camada: v.camada })

    correcoes.revisor += p.evidencias.ajustesDoRevisorSemRevisaoDeCopy
    correcoes.compositor += p.evidencias.recusasDoCompositor
    correcoes.foto += p.evidencias.trocasDeArte + p.evidencias.fotosTrocadas
    correcoes.design += p.evidencias.geometria
  }

  const { inicioEm, rascunhoEm } = p.tempo
  const minutos = inicioEm != null && rascunhoEm != null && rascunhoEm >= inicioEm ? (rascunhoEm - inicioEm) / 60_000 : null

  const visibilidadeDoRevisor = p.visibilidade
    ? {
        aceitos: p.visibilidade.filter((v) => v.desfecho === 'aceito').length,
        desfeitos: p.visibilidade.filter((v) => v.desfecho === 'desfeito').length,
        removidas: p.visibilidade.filter((v) => v.desfecho === 'camada-removida').length,
      }
    : null

  return { chave: p.chave, comparavel, exclusao: p.exclusao, preservada, sistemaMudouLinhas, correcoes, indevidas, visibilidadeDoRevisor, semPagina: p.semPagina, minutosAteRascunho: minutos, voz: p.voz, avisosDoSistema: p.evidencias.avisosDoSistema }
}

// ─── agregação ────────────────────────────────────────────────────────────

export type Proporcao =
  | { estado: 'medida'; n: number; de: number; percentual: number }
  | { estado: 'amostraInsuficiente'; n: number; de: number; limiar: number }

export function proporcao(n: number, de: number, limiar: number): Proporcao {
  if (de < limiar) return { estado: 'amostraInsuficiente', n, de, limiar }
  return { estado: 'medida', n, de, percentual: Math.round((n / de) * 1000) / 10 }
}

/** Percentil por posto mais próximo (sem interpolação) sobre valores já ordenados. */
function percentil(ordenados: number[], p: number): number {
  const i = Math.max(0, Math.ceil(p * ordenados.length) - 1)
  return ordenados[Math.min(i, ordenados.length - 1)]
}

export const DEFINICAO_DO_TEMPO =
  'proxy: do item de plano (ou da primeira arte da peça, sem item) até o primeiro post na agenda — não mede o tempo de escrita nem de revisão'

export interface QualidadeDaCopy {
  versao: typeof VERSAO_DA_METRICA
  limiar: number
  pecas: number
  comparaveis: number
  /** Fora do denominador — legado, peça congelada sem prova da mídia (PR15-02) e peça sem copy final. Nunca some. */
  foraDoDenominador: { semContrato: number; autoriaDesconhecida: number; congeladaSemProva: number; semCopyFinal: number }
  fidelidade: { mensagemPreservada: Proporcao; sistemaSemMudarTexto: Proporcao }
  correcoes: { porCausa: Record<CausaDaCorrecao, number>; pecasPorCausa: Record<CausaDaCorrecao, number> }
  indevidas: { pecas: Proporcao; porTipo: Record<TipoDeIndevida, number> }
  /**
   * O desfecho dos ajustes de visibilidade do revisor nas peças comparáveis;
   * `ilegiveis` = peças cujas camadas não deu para ler; `semPagina` = peças sem
   * página lida, em que o desfecho não foi medido (C15-11).
   */
  visibilidadeDoRevisor: { aceitos: number; desfeitos: number; removidas: number; ilegiveis: number; semPagina: number }
  avisosDoSistema: number
  tempoAteRascunho:
    | { estado: 'medida'; n: number; medianaMin: number; p90Min: number; proxy: true; definicao: string }
    | { estado: 'amostraInsuficiente'; n: number; limiar: number; proxy: true; definicao: string }
  voz: { comCarimbo: number; semCarimbo: number; porFonte: Record<FonteDaVoz | 'incerta', number>; naVersaoAtual: number | null }
}

export function medirQualidadeDaCopy(medidas: MedidaDaPeca[], opcoes: { limiar?: number; versaoDaVozAtual?: number | null } = {}): QualidadeDaCopy {
  const limiar = opcoes.limiar ?? LIMIAR_DE_AMOSTRA
  const comparaveis = medidas.filter((m) => m.comparavel)
  const porCausa = zeradas()
  const pecasPorCausa = zeradas()
  const porTipo = Object.fromEntries(TIPOS_DE_INDEVIDA.map((t) => [t, 0])) as Record<TipoDeIndevida, number>
  for (const m of comparaveis) {
    for (const c of CAUSAS) {
      porCausa[c] += m.correcoes[c]
      if (m.correcoes[c] > 0) pecasPorCausa[c]++
    }
    for (const i of m.indevidas) porTipo[i.tipo]++
  }

  const minutos = medidas.map((m) => m.minutosAteRascunho).filter((x): x is number => x != null).sort((a, b) => a - b)
  const meio = Math.floor(minutos.length / 2)
  const tempoAteRascunho: QualidadeDaCopy['tempoAteRascunho'] =
    minutos.length < limiar
      ? { estado: 'amostraInsuficiente', n: minutos.length, limiar, proxy: true, definicao: DEFINICAO_DO_TEMPO }
      : {
          estado: 'medida',
          n: minutos.length,
          medianaMin: Math.round(minutos.length % 2 ? minutos[meio] : (minutos[meio - 1] + minutos[meio]) / 2),
          p90Min: Math.round(percentil(minutos, 0.9)),
          proxy: true,
          definicao: DEFINICAO_DO_TEMPO,
        }

  const carimbos = medidas.map((m) => m.voz).filter((v): v is CarimboDaVoz => v != null)
  const porFonte = { voz: 0, legado: 0, nenhuma: 0, incerta: 0 }
  for (const v of carimbos) porFonte[v.fonte ?? 'incerta']++
  const versaoAtual = opcoes.versaoDaVozAtual ?? null

  return {
    versao: VERSAO_DA_METRICA,
    limiar,
    pecas: medidas.length,
    comparaveis: comparaveis.length,
    foraDoDenominador: {
      semContrato: medidas.filter((m) => m.exclusao === 'sem-contrato').length,
      autoriaDesconhecida: medidas.filter((m) => m.exclusao === 'autoria-desconhecida').length,
      congeladaSemProva: medidas.filter((m) => m.exclusao === 'congelada-sem-prova').length,
      semCopyFinal: medidas.filter((m) => m.exclusao === 'sem-copy-final').length,
    },
    fidelidade: {
      mensagemPreservada: proporcao(comparaveis.filter((m) => m.preservada).length, comparaveis.length, limiar),
      sistemaSemMudarTexto: proporcao(comparaveis.filter((m) => !m.sistemaMudouLinhas).length, comparaveis.length, limiar),
    },
    correcoes: { porCausa, pecasPorCausa },
    indevidas: { pecas: proporcao(comparaveis.filter((m) => m.indevidas.length > 0).length, comparaveis.length, limiar), porTipo },
    visibilidadeDoRevisor: {
      aceitos: comparaveis.reduce((t, m) => t + (m.visibilidadeDoRevisor?.aceitos ?? 0), 0),
      desfeitos: comparaveis.reduce((t, m) => t + (m.visibilidadeDoRevisor?.desfeitos ?? 0), 0),
      removidas: comparaveis.reduce((t, m) => t + (m.visibilidadeDoRevisor?.removidas ?? 0), 0),
      ilegiveis: comparaveis.filter((m) => m.visibilidadeDoRevisor === null).length,
      semPagina: comparaveis.filter((m) => m.semPagina).length,
    },
    avisosDoSistema: comparaveis.reduce((t, m) => t + m.avisosDoSistema, 0),
    tempoAteRascunho,
    voz: {
      comCarimbo: carimbos.length,
      semCarimbo: medidas.length - carimbos.length,
      porFonte,
      naVersaoAtual: versaoAtual == null ? null : carimbos.filter((v) => v.fonte === 'voz' && v.versao === versaoAtual).length,
    },
  }
}

// ─── falta de esquema (PRs 3/7 ainda não aplicados no banco) ──────────────

/**
 * O erro é a COLUNA ou a TABELA que ainda não existe? (`Page.copyAutoral` do
 * PR 3, `BrandVoice` do PR 7.) P2022/P2021 do Prisma, ou 42703/42P01 do
 * Postgres numa consulta crua. Devolve o que falta, para a saída DIZER.
 */
export function faltaDeEsquema(erro: unknown): string | null {
  const e = objeto(erro)
  if (!e) return null
  const code = typeof e.code === 'string' ? e.code : null
  const meta = objeto(e.meta)
  const mensagem = typeof e.message === 'string' ? e.message : ''
  if (code === 'P2022') return `coluna ausente: ${String(meta?.column ?? 'desconhecida')}`
  if (code === 'P2021') return `tabela ausente: ${String(meta?.table ?? 'desconhecida')}`
  const pg = typeof meta?.code === 'string' ? meta.code : null
  if (pg === '42703' || /column .* does not exist/i.test(mensagem)) return `coluna ausente (${mensagem.slice(0, 120)})`
  if (pg === '42P01' || /relation .* does not exist/i.test(mensagem)) return `tabela ausente (${mensagem.slice(0, 120)})`
  return null
}

/**
 * O erro é o TEMPO acabando? Três portas, e as três são o teto por cliente:
 *  - o `statement_timeout` do servidor cancelando a consulta (57014) — é como
 *    o teto se cumpre de verdade (C15-03): a consulta é cancelada no Postgres,
 *    e a conexão volta ao pool;
 *  - o Prisma fechando a transação interativa pelo `timeout` dela (P2028), que
 *    pode chegar antes de qualquer 57014 quando a ida e volta pelo pooler soma;
 *  - o Prisma desistindo de esperar a conexão (`maxWait`, P2024).
 * Sem as duas últimas, o relatório dizia "erro na leitura: Transaction API
 * error…" para o mesmo teto (C15-13).
 */
export function cancelamentoPorTempo(erro: unknown): boolean {
  const e = objeto(erro)
  if (!e) return false
  const meta = objeto(e.meta)
  const mensagem = typeof e.message === 'string' ? e.message : ''
  if (e.code === 'P2028' || e.code === 'P2024') return true
  return e.code === '57014' || meta?.code === '57014' || /statement timeout/i.test(mensagem)
}

// ─── o texto do relatório ─────────────────────────────────────────────────

function textoDaProporcao(p: Proporcao): string {
  return p.estado === 'medida' ? `${String(p.percentual).replace('.', ',')}% (${p.n}/${p.de})` : `amostra insuficiente (${p.n}/${p.de}, mínimo ${p.limiar})`
}

const ROTULO_DA_CAUSA: Record<CausaDaCorrecao, string> = { redacao: 'redação', compositor: 'compositor', foto: 'foto', design: 'design', revisor: 'revisor', indeterminada: 'indeterminada' }
const ROTULO_DA_INDEVIDA: Record<TipoDeIndevida, string> = {
  'sistema-mudou-linhas': 'o sistema mudou o texto',
  'ajuste-do-revisor-revertido': 'ajuste do revisor desfeito',
  'equipe-voltou-ao-original': 'devolvido ao original',
  'refino-revertido': 'refino desfeito',
}

function duracao(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Uma linha por cliente, para ir abaixo da linha dele. `null` quando não há peça. */
export function linhaDaCopyDoCliente(q: QualidadeDaCopy | null): string | null {
  if (!q || q.pecas === 0) return null
  const fora = q.pecas - q.comparaveis
  if (q.comparaveis === 0) return `  copy: ${q.pecas} peça(s), todas fora da medida (legado, congelada sem prova ou sem copy final)`
  const indevidas = q.indevidas.porTipo
  const nIndevidas = Object.values(indevidas).reduce((t, n) => t + n, 0)
  return `  copy: fidelidade ${textoDaProporcao(q.fidelidade.mensagemPreservada)}${nIndevidas ? ` · ${nIndevidas} indevida(s)` : ''}${fora ? ` · ${fora} fora da medida` : ''}`
}

export interface BlocoDaCopy {
  carteira: QualidadeDaCopy | null
  /** Clientes em que a medida não rodou (esquema ausente, tempo, erro) — com o motivo. */
  indisponiveis: Array<{ nome: string; motivo: string }>
  /** Clientes que não couberam no orçamento de tempo do cron. */
  foraDoOrcamento: string[]
}

/** O bloco da carteira no relatório de domingo (molde `relatorio-extras.ts`): string pronta ou `null`. */
export function blocoDaQualidadeDaCopy(b: BlocoDaCopy): string | null {
  const q = b.carteira
  if ((!q || q.pecas === 0) && b.indisponiveis.length === 0 && b.foraDoOrcamento.length === 0) return null
  const partes = ['\n✍️ *Copy da semana* — fidelidade até a agenda']
  if (q && q.pecas > 0) {
    const fora = q.foraDoDenominador
    const nFora = fora.semContrato + fora.autoriaDesconhecida + fora.congeladaSemProva + fora.semCopyFinal
    const congeladas = fora.congeladaSemProva ? `, ${fora.congeladaSemProva} congelada(s) sem prova da mídia` : ''
    partes.push(`${q.comparaveis} peça(s) comparável(is)${nFora ? ` · ${nFora} fora da medida (${fora.semContrato} sem contrato, ${fora.autoriaDesconhecida} autoria desconhecida${congeladas}, ${fora.semCopyFinal} sem copy final)` : ''}`)
    if (q.comparaveis > 0) {
      partes.push(`  mensagem preservada: ${textoDaProporcao(q.fidelidade.mensagemPreservada)}`)
      partes.push(`  sistema sem mudar o texto: ${textoDaProporcao(q.fidelidade.sistemaSemMudarTexto)}`)
      const causas = CAUSAS.filter((c) => q.correcoes.porCausa[c] > 0).map((c) => `${ROTULO_DA_CAUSA[c]} ${q.correcoes.porCausa[c]}`)
      partes.push(`  correções: ${causas.length ? causas.join(' · ') : 'nenhuma'}`)
      const tipos = TIPOS_DE_INDEVIDA.filter((t) => q.indevidas.porTipo[t] > 0).map((t) => `${ROTULO_DA_INDEVIDA[t]} ${q.indevidas.porTipo[t]}`)
      partes.push(`  indevidas: ${textoDaProporcao(q.indevidas.pecas)}${tipos.length ? ` — ${tipos.join(' · ')}` : ''}`)
      const vis = q.visibilidadeDoRevisor
      if (vis.aceitos + vis.desfeitos + vis.removidas + vis.ilegiveis + vis.semPagina > 0) {
        const semMedida = [vis.ilegiveis ? `${vis.ilegiveis} peça(s) com camadas ilegíveis` : '', vis.semPagina ? `${vis.semPagina} peça(s) sem página, não medida(s)` : ''].filter(Boolean)
        partes.push(`  revisor escondeu/mostrou: ${vis.aceitos} aceito(s) · ${vis.desfeitos} desfeito(s)${vis.removidas ? ` · ${vis.removidas} camada(s) removida(s)` : ''}${semMedida.length ? ` · ${semMedida.join(' · ')}` : ''}`)
      }
    }
    const t = q.tempoAteRascunho
    partes.push(t.estado === 'medida' ? `  até o rascunho (proxy): mediana ${duracao(t.medianaMin)} · p90 ${duracao(t.p90Min)}` : `  até o rascunho (proxy): amostra insuficiente (${t.n}, mínimo ${t.limiar})`)
    const v = q.voz
    partes.push(`  voz na escrita: ${v.comCarimbo} com carimbo (voz ${v.porFonte.voz} · legado ${v.porFonte.legado} · incerta ${v.porFonte.incerta}) · ${v.semCarimbo} sem`)
  }
  for (const i of b.indisponiveis) partes.push(`  ⚠️ ${i.nome}: medida indisponível — ${i.motivo}`)
  if (b.foraDoOrcamento.length) partes.push(`  ⏱️ fora do tempo do relatório: ${b.foraDoOrcamento.join(', ')}`)
  return partes.join('\n')
}
