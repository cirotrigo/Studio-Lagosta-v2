/**
 * CAMADAS EXTRAS — texto que veste o estilo de um papel da assinatura SEM ser
 * esse papel (F3 de "Marca simples, copy melhor", PR 9, 12/09/2026).
 *
 * "Copy primeiro, campos depois" (Ciro, 11/09/2026): a mensagem decide os
 * blocos, e nenhum texto é descartado por falta de campo. Até aqui um papel que
 * a variante não tinha era RECUSADO (`PAPEIS_INCOMPATIVEIS`). Agora o autor
 * declara de que papel o texto herda o estilo (`herdaDe`), e o texto entra como
 * camada EXTRA: id próprio, função própria (o papel original ou `livre`), grupo
 * de leitura do autor e um GRUPO VISUAL (onde ele pousa) separado do papel de
 * onde herda — ele nunca herda coordenada, id nem grupo desse papel (§5 do plano).
 *
 * O que herda: fonte, peso, corpo (na faixa do papel, com a mesma escala da
 * peça), entrelinha, tracking, caixa, cor, sombra e prefixo — é `assinatura.
 * papeis[herdaDe]` inteiro, menos `caixa`, `grupo` e `alinhamento`, que são a
 * POSIÇÃO do papel na página e ficam de fora por regra.
 *
 * Módulo PURO (sem Prisma, sem medidor): a preparação (`preparar-blocos.ts`) e
 * a composição (`compor.ts`) chamam a MESMA resolução — medir e compor não
 * podem divergir (lição do PR 8).
 */
import type { EstiloDePapel } from './assinatura'
import type { GrupoVisual, Papel } from './spec'

/** O papel original de um extra: um papel da spec, ou `livre` (bloco sem função do compositor). */
export type FuncaoDoExtra = Papel | 'livre'

export interface IdentidadeDoExtra {
  /** Id da camada — do autor; nunca o id do papel de que herda. */
  id: string
  funcao: FuncaoDoExtra
  herdaDe: Papel
  grupoVisual: GrupoVisual
  grupoDeLeitura?: string
  ordem?: number
}

/** Um bloco como a preparação o recebe: `papel` é o papel de ESTILO (para o extra, o `herdaDe`). */
export interface BlocoResolvido {
  papel: Papel
  linhas: string[]
  extra?: IdentidadeDoExtra
}

export interface BlocoDaSpec {
  papel?: Papel
  linhas?: string[]
  id?: string
  herdaDe?: Papel
  grupoVisual?: GrupoVisual
  /** R04: o bloco com função que herda estilo também é um extra — leva o grupo de leitura e a ordem do autor. */
  grupoDeLeitura?: string
  ordem?: number
}

/** Uma camada extra que NÃO pôde ser resolvida: o papel de que herdaria o estilo não existe na variante (R03). */
export interface FalhaDeResolucao {
  id: string
  funcao: FuncaoDoExtra
  herdaDe: Papel
  grupoVisual: GrupoVisual
  linhas: number
}

/**
 * Como a camada extra chega da spec. Os campos são opcionais no TIPO porque,
 * com `strict: false`, o `z.infer` do schema marca tudo como opcional — a
 * garantia é do `validarSpec`; aqui a entrada sem id ou sem herança é pulada.
 */
export interface CamadaExtraDaSpec {
  id?: string
  linhas?: string[]
  herdaDe?: Papel
  grupoVisual?: GrupoVisual
  grupoDeLeitura?: string
  ordem?: number
}

/**
 * A spec tem camada EXTRA em alguma das DUAS representações: `camadasExtras` (o bloco `livre` do contrato com herança)
 * ou um bloco de `blocos` com `herdaDe` (o extra COM FUNÇÃO — o serviço que herda do apoio). Quem decide comportamento
 * por "a peça tem extra" pergunta aqui, nunca a uma forma só: a guarda do re-render da recomposição olhava só
 * `camadasExtras` e deixava o extra com função cair no caminho por papel, que descarta id e herança (PR9-F01, revisão
 * FINAL do Codex sobre b6980b5b, 21/09/2026).
 */
export function specTemExtra(spec: { blocos?: ReadonlyArray<{ herdaDe?: unknown }> | null; camadasExtras?: ReadonlyArray<unknown> | null }): boolean {
  return (spec.camadasExtras?.length ?? 0) > 0 || (spec.blocos ?? []).some((b) => !!b.herdaDe)
}

export interface ResolucaoDosExtras {
  blocos: BlocoResolvido[]
  /** Os papéis que a peça pede e a variante não tem, sem herança declarada que os salve — a composição recusa (`PAPEIS_INCOMPATIVEIS`). */
  faltam: Papel[]
  /** R03: cada extra que não pôde ser composto, pelo id — a medição os declara um a um, e `cabeTudo` os conta. */
  falhas: FalhaDeResolucao[]
  avisos: string[]
}

/**
 * Ids que a COMPOSIÇÃO produz sozinha e nenhum extra pode tomar (R02, R10): a
 * segunda voz da manchete (`headline2`) e o segundo texto do mesmo papel
 * (`servico-2`, `apoio-3`…). O nome nu do papel (`servico`) é o id padrão do
 * extra sem id — ele só colide quando um bloco comum do mesmo papel existe, e
 * isso a unicidade por id já pega.
 */
export function idReservado(id: string): boolean {
  return (
    id === 'headline2' ||
    /^(pre|headline|apoio|cta|servico)-\d+$/.test(id) ||
    // R10: as camadas internas da composição — a foto de fundo, a logo (a do
    // canto e a do arranjo), os gradientes de leitura (um por borda) e os
    // elementos presos aos textos (`<texto>-elemento-N`).
    id === 'bg-foto' ||
    id === 'logo' ||
    id.startsWith('gradiente-leitura-') ||
    /-elemento-\d+$/.test(id)
  )
}

/** Os ids que aparecem mais de uma vez no conjunto FINAL de camadas (R10) — a composição recusa em vez de gravar identidade ambígua. */
export function idsDeCamadaRepetidos(camadas: ReadonlyArray<{ id: string }>): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const c of camadas) {
    if (vistos.has(c.id)) repetidos.add(c.id)
    vistos.add(c.id)
  }
  return [...repetidos]
}

/**
 * O grupo visual de um extra que não o declarou: linha de serviço vai ao
 * RODAPÉ (regra da casa para serviço solto); todo o resto se junta ao bloco
 * principal, como continuação da mensagem. Nunca o grupo do papel de origem.
 */
export function grupoVisualPadrao(funcao: FuncaoDoExtra): GrupoVisual {
  return funcao === 'servico' ? 'rodape' : 'principal'
}

/** A chave de grupo de um extra na preparação. `principal` é resolvida por quem conhece o grupo da manchete. */
export function chaveDoGrupoExtra(grupoVisual: Exclude<GrupoVisual, 'principal'>): string {
  return `extra:${grupoVisual}`
}

/** O estilo que o extra veste: o do papel de origem SEM a posição dele (caixa, grupo, alinhamento). */
export function estiloHerdado(estilo: EstiloDePapel): EstiloDePapel {
  const { caixa: _caixa, grupo: _grupo, alinhamento: _alinhamento, ...resto } = estilo
  return resto
}

/**
 * Resolve os blocos da spec contra a variante: quem tem o papel entra como
 * sempre; quem declarou `herdaDe` vira extra (mesmo que a variante tenha o
 * papel — função ≠ estilo é decisão do autor); quem não tem o papel nem
 * herança FALTA. As `camadasExtras` (blocos `livre` do contrato) entram na
 * ordem declarada, depois dos blocos por papel.
 */
export function resolverCamadasExtras(
  spec: { blocos?: BlocoDaSpec[]; camadasExtras?: CamadaExtraDaSpec[] },
  assinatura: { papeis: Partial<Record<Papel, unknown>> },
): ResolucaoDosExtras {
  const blocos: BlocoResolvido[] = []
  const faltam: Papel[] = []
  const falhas: FalhaDeResolucao[] = []
  const avisos: string[] = []
  const idsUsados = new Set<string>()
  const falta = (p: Papel) => {
    if (!faltam.includes(p)) faltam.push(p)
  }
  // Candidatos a extra, das DUAS fontes, numa lista só: o bloco com função que
  // herda estilo (`spec.blocos` com `herdaDe`) e a camada livre do contrato
  // (`camadasExtras`). A ordem é a do AUTOR (`ordem`), conjunta — acrescentar
  // primeiro os por papel e depois os livres invertia a sequência de um
  // contrato com nota livre na ordem 1 e serviço na ordem 2 (R04). Sem `ordem`
  // (spec legada) vale a posição de declaração, blocos antes de camadasExtras.
  const candidatos: Array<{ chave: number; id: string; funcao: FuncaoDoExtra; herdaDe: Papel; linhas: string[]; grupoVisual: GrupoVisual; grupoDeLeitura?: string; ordem?: number }> = []
  let seq = 0
  for (const b of spec.blocos ?? []) {
    const papel = b.papel as Papel
    const linhas = [...(b.linhas ?? [])]
    seq++
    if (b.herdaDe) {
      candidatos.push({
        chave: b.ordem ?? 1000 + seq,
        id: b.id ?? papel,
        funcao: papel,
        herdaDe: b.herdaDe,
        linhas,
        grupoVisual: b.grupoVisual ?? grupoVisualPadrao(papel),
        ...(b.grupoDeLeitura ? { grupoDeLeitura: b.grupoDeLeitura } : {}),
        ...(b.ordem !== undefined ? { ordem: b.ordem } : {}),
      })
      continue
    }
    if (!assinatura.papeis[papel]) {
      falta(papel)
      continue
    }
    idsUsados.add(papel)
    blocos.push({ papel, linhas })
  }
  for (const e of spec.camadasExtras ?? []) {
    seq++
    if (!e.id || !e.herdaDe) {
      avisos.push(`camada extra sem id ou sem herdaDe foi ignorada`)
      continue
    }
    candidatos.push({
      chave: e.ordem ?? 1000 + seq,
      id: e.id,
      funcao: 'livre',
      herdaDe: e.herdaDe,
      linhas: [...(e.linhas ?? [])],
      grupoVisual: e.grupoVisual ?? grupoVisualPadrao('livre'),
      ...(e.grupoDeLeitura ? { grupoDeLeitura: e.grupoDeLeitura } : {}),
      ...(e.ordem !== undefined ? { ordem: e.ordem } : {}),
    })
  }
  candidatos.sort((a, z) => a.chave - z.chave)
  for (const c of candidatos) {
    const rotulo = c.funcao === 'livre' ? `camada extra "${c.id}"` : `${c.funcao} ("${c.id}")`
    if (!assinatura.papeis[c.herdaDe]) {
      falta(c.herdaDe)
      falhas.push({ id: c.id, funcao: c.funcao, herdaDe: c.herdaDe, grupoVisual: c.grupoVisual, linhas: c.linhas.length })
      avisos.push(`${rotulo}: herda de "${c.herdaDe}", que a variante não tem`)
      continue
    }
    // R02: o id do extra não pode ser um que a preparação produz sozinha
    // (`headline2`, `servico-2`) nem um já tomado — `validarSpec` recusa antes;
    // aqui é a última porta, com aviso.
    if (idsUsados.has(c.id) || idReservado(c.id)) {
      avisos.push(`${rotulo}: id já usado por outro bloco ou reservado pela composição — a camada ficou de fora`)
      continue
    }
    idsUsados.add(c.id)
    blocos.push({
      papel: c.herdaDe,
      linhas: c.linhas,
      extra: {
        id: c.id,
        funcao: c.funcao,
        herdaDe: c.herdaDe,
        grupoVisual: c.grupoVisual,
        ...(c.grupoDeLeitura ? { grupoDeLeitura: c.grupoDeLeitura } : {}),
        ...(c.ordem !== undefined ? { ordem: c.ordem } : {}),
      },
    })
  }
  return { blocos, faltam, falhas, avisos }
}
