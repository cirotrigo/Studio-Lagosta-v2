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

export interface ResolucaoDosExtras {
  blocos: BlocoResolvido[]
  /** Os papéis que a peça pede e a variante não tem, sem herança declarada que os salve — a composição recusa (`PAPEIS_INCOMPATIVEIS`). */
  faltam: Papel[]
  avisos: string[]
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
  const avisos: string[] = []
  const idsUsados = new Set<string>()
  const falta = (p: Papel) => {
    if (!faltam.includes(p)) faltam.push(p)
  }
  for (const b of spec.blocos ?? []) {
    const papel = b.papel as Papel
    const linhas = [...(b.linhas ?? [])]
    if (b.herdaDe) {
      if (!assinatura.papeis[b.herdaDe]) {
        falta(b.herdaDe)
        avisos.push(`${papel}: herda de "${b.herdaDe}", que a variante não tem`)
        continue
      }
      const id = b.id ?? papel
      idsUsados.add(id)
      blocos.push({ papel: b.herdaDe, linhas, extra: { id, funcao: papel, herdaDe: b.herdaDe, grupoVisual: b.grupoVisual ?? grupoVisualPadrao(papel) } })
      continue
    }
    if (!assinatura.papeis[papel]) {
      falta(papel)
      continue
    }
    idsUsados.add(papel)
    blocos.push({ papel, linhas })
  }
  const extras = [...(spec.camadasExtras ?? [])].sort((a, z) => (a.ordem ?? 0) - (z.ordem ?? 0))
  for (const e of extras) {
    if (!e.id || !e.herdaDe) {
      avisos.push(`camada extra sem id ou sem herdaDe foi ignorada`)
      continue
    }
    if (!assinatura.papeis[e.herdaDe]) {
      falta(e.herdaDe)
      avisos.push(`camada extra "${e.id}": herda de "${e.herdaDe}", que a variante não tem`)
      continue
    }
    if (idsUsados.has(e.id)) {
      avisos.push(`camada extra "${e.id}": id já usado por outro bloco — a camada ficou de fora`)
      continue
    }
    idsUsados.add(e.id)
    blocos.push({
      papel: e.herdaDe,
      linhas: [...(e.linhas ?? [])],
      extra: {
        id: e.id,
        funcao: 'livre',
        herdaDe: e.herdaDe,
        grupoVisual: e.grupoVisual ?? grupoVisualPadrao('livre'),
        ...(e.grupoDeLeitura ? { grupoDeLeitura: e.grupoDeLeitura } : {}),
        ...(e.ordem !== undefined ? { ordem: e.ordem } : {}),
      },
    })
  }
  return { blocos, faltam, avisos }
}
