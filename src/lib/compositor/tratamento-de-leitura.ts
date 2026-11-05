/**
 * O TRATAMENTO DE LEITURA de cada BORDA (CP2A, 14/10/2026): qual gradiente,
 * se algum, torna a leitura válida para os textos que o layout ATUAL pôs
 * naquela borda. Não move grupo nenhum — onde o texto está é decisão de quem
 * posiciona (CP2B).
 *
 * Antes, UMA cor de véu servia à peça inteira (a que mais distava da luz de
 * todos os textos, sem olhar o fundo) e toda borda com texto ganhava véu,
 * com força mínima 0.45 mesmo sem necessidade. Na peça piloto, o véu creme
 * que servia ao texto escuro do topo clareava o fundo do serviço claro do
 * rodapé (p98 166 → 194).
 *
 * Agora, por borda e só com o que foi MEDIDO (o p02/p98 da régua sob cada
 * texto, sem tratamento):
 *  - texto claro precisa de fundo escuro o bastante (p98 ≤ alvoPorContraste),
 *    texto escuro de fundo claro o bastante (p02 ≥ alvoClaroPorContraste) —
 *    a polaridade é a mesma de quem detecta a piora (`polaridadeDoTexto`);
 *  - todos já leem → nenhum tratamento automático;
 *  - claros e escuros sem leitura na mesma borda → nenhum véu serve aos dois:
 *    a ESTRATÉGIA de tratamento é inviável (POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA),
 *    não a peça — uma posição diferente pode resolver;
 *  - candidata que, no pior caso previsto, PIORA a leitura de algum texto da
 *    borda (o contrato do CP1, `pioraDaLeitura`) não vence.
 * A régua confere depois, com e sem o véu desenhado; o que ela provar pior o
 * compositor tira (`gradientesARecusar`).
 *
 * Módulo PURO.
 */

import { alvoPorContraste, type Rect } from '@/lib/creatives/halo/halo'
import { faixaDeOpacidade, type Borda, type CurvaDoGradiente } from './gradiente-de-leitura'
import {
  alvoClaroPorContraste,
  ehCorHex,
  luzMedida,
  pioraDaLeitura,
  polaridadeDoTexto,
  TOLERANCIA_DO_ALVO,
  TRATAMENTO_PIOROU_LEITURA,
  type PercentisDoFundo,
  type PioraDeTratamento,
} from './regua'

/**
 * De onde vem uma cor candidata, na ordem de preferência: a assinatura (a
 * camada de gradiente da página, a cor do gradiente nos números, a mancha da
 * marca) e, por último, a biblioteca LEGADA (`GRADIENTES_POR_PROJETO`).
 */
export type OrigemDaCandidata = 'pagina' | 'numeros-da-assinatura' | 'mancha' | 'biblioteca-legada'

export interface CandidataDoTratamento {
  cor: string
  origem: OrigemDaCandidata
}

export const MOTIVOS_DO_TRATAMENTO = {
  /** Textos claros E escuros pedem leitura na mesma borda: nenhum véu serve aos dois. */
  polaridadeIncompativel: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA',
  /** Nenhuma cor aprovada da marca anda no sentido que a borda pede. */
  semCor: 'SEM_COR_APROVADA_PARA_A_POLARIDADE',
  /** A cor da candidata não fica do lado legível do alvo de quem pede leitura (não pode levá-lo ao alvo). */
  sentidoErrado: 'SENTIDO_ERRADO',
  /** A candidata piora (prevista) ou piorou (medida pela régua) a leitura de um texto. */
  piorou: TRATAMENTO_PIOROU_LEITURA,
} as const

export type MotivoDoTratamento = (typeof MOTIVOS_DO_TRATAMENTO)[keyof typeof MOTIVOS_DO_TRATAMENTO]

export interface TextoNaBorda {
  camada: string
  grupo: string
  cor: string
  rect: Rect
  /** O fundo SEM tratamento sob o texto (a régua, `medirFundoDosTextos`). */
  percentis: PercentisDoFundo
  caixaDeFundo?: boolean
}

export interface LeituraNaBorda {
  camada: string
  grupo: string
  polaridade: 'clara' | 'escura'
  /** O percentil que limita a leitura: p98 do texto claro, p02 do escuro. */
  percentil: 'p98' | 'p02'
  antes: number
  alvo: number
  ok: boolean
}

export interface PlanoDaBorda {
  borda: Borda
  estado: 'sem-necessidade' | 'tratado' | 'inviavel'
  grupos: string[]
  textos: LeituraNaBorda[]
  /** Textos que o plano não julga: caixa de fundo própria ou cor que não é #hex. */
  foraDoPlano?: string[]
  cor?: string
  origemDaCor?: OrigemDaCandidata
  forca?: number
  /** A força que a conta pede (pode passar do teto da marca; `null` = cor que não alcança o alvo). */
  forcaPedida?: number | null
  alcancaAlvo?: boolean
  motivo?: MotivoDoTratamento
  /** As candidatas recusadas e por quê (`camada`: o texto que piorava; `forca`: a do véu que a régua provou pior). */
  recusadas?: Array<{ cor: string; origem: OrigemDaCandidata; motivo: MotivoDoTratamento; camada?: string; forca?: number }>
}

const arred = (v: number, casas = 3) => Number(v.toFixed(casas))

/** As candidatas sem repetir cor (fica a origem mais preferida) e só as que a régua sabe ler. */
export function candidatasDistintas(candidatas: Array<{ cor?: string | null; origem: OrigemDaCandidata }>): CandidataDoTratamento[] {
  const vistas = new Set<string>()
  const saida: CandidataDoTratamento[] = []
  for (const c of candidatas) {
    if (!ehCorHex(c.cor)) continue
    const chave = c.cor.toUpperCase()
    if (vistas.has(chave)) continue
    vistas.add(chave)
    saida.push({ cor: c.cor, origem: c.origem })
  }
  return saida
}

/** O trecho da faixa [0 = borda, 1 = onde o véu some] que a caixa do texto ocupa. */
function trechoNaFaixa(rect: Rect, borda: Borda, altura: number, H: number): [number, number] {
  return borda === 'topo'
    ? [rect.y / altura, (rect.y + rect.height) / altura]
    : [(H - (rect.y + rect.height)) / altura, (H - rect.y) / altura]
}

/**
 * O pior caso do fundo sob um texto com um véu de luz `L` e força `F`: a régua
 * mistura o fundo com a cor (`v + a·(L − v)`), e `a` varia na caixa do texto
 * entre `F·min` e `F·max` da curva. Para o p98 vale a maior subida (ou a menor
 * descida); para o p02, a maior descida (ou a menor subida) — o que tornaria
 * a piora mais provável. É com ele que `pioraDaLeitura` julga a candidata.
 */
export function fundoNoPiorCaso(sem: PercentisDoFundo, L: number, F: number, opacidade: { min: number; max: number }): PercentisDoFundo {
  const p98 = L > sem.p98 ? sem.p98 + F * opacidade.max * (L - sem.p98) : sem.p98 - F * opacidade.min * (sem.p98 - L)
  const p02 = L < sem.p02 ? sem.p02 - F * opacidade.max * (sem.p02 - L) : sem.p02 + F * opacidade.min * (L - sem.p02)
  return { p02, p98 }
}

type Leitura = LeituraNaBorda & { cor: string; percentis: PercentisDoFundo; opacidade: { min: number; max: number }; alvoExato: number }

/**
 * Pura: o tratamento de leitura de UMA borda. `curva`, `forcaMinima` e
 * `forcaMaxima` são os da marca (a faixa só se aplica quando há necessidade:
 * sem ela não há véu); `altura` é a da faixa que o véu ocuparia. `vizinhos`
 * são os textos das OUTRAS bordas: só entram na conferência de piora, para a
 * cauda do véu (a faixa chega a 62% da peça) não piorar quem está do outro lado.
 */
export function planejarTratamentoDaBorda(args: {
  borda: Borda
  textos: TextoNaBorda[]
  vizinhos?: TextoNaBorda[]
  candidatas: CandidataDoTratamento[]
  curva: CurvaDoGradiente
  forcaMinima: number
  forcaMaxima: number
  altura: number
  H: number
}): PlanoDaBorda {
  const grupos = [...new Set(args.textos.map((t) => t.grupo))]
  const foraDoPlano: string[] = []
  const lerTexto = (t: TextoNaBorda): Leitura | null => {
    const polaridade = t.caixaDeFundo ? null : polaridadeDoTexto(t.cor, t.percentis)
    if (!polaridade) return null
    const clara = polaridade.polaridade === 'clara'
    // O alvo EXATO decide (como na régua); o arredondado é só para o diagnóstico.
    const alvoExato = clara ? alvoPorContraste(t.cor, 3) : alvoClaroPorContraste(t.cor, 3)
    const antes = clara ? t.percentis.p98 : t.percentis.p02
    const [ta, tb] = trechoNaFaixa(t.rect, args.borda, args.altura, args.H)
    return {
      camada: t.camada,
      grupo: t.grupo,
      polaridade: polaridade.polaridade,
      percentil: clara ? 'p98' : 'p02',
      antes,
      alvo: Math.round(alvoExato),
      alvoExato,
      ok: clara ? antes <= alvoExato + TOLERANCIA_DO_ALVO : antes >= alvoExato - TOLERANCIA_DO_ALVO,
      cor: t.cor,
      percentis: t.percentis,
      opacidade: faixaDeOpacidade(args.curva, ta, tb),
    }
  }
  const leituras: Leitura[] = []
  for (const t of args.textos) {
    const l = lerTexto(t)
    if (l) leituras.push(l)
    else foraDoPlano.push(t.camada)
  }
  // Os vizinhos que a faixa alcança (opacidade > 0) também não podem piorar.
  const protegidos = [...leituras, ...(args.vizinhos ?? []).map(lerTexto).filter((l): l is Leitura => !!l && l.opacidade.max > 0)]
  const textos = leituras.map(({ camada, grupo, polaridade, percentil, antes, alvo, ok }) => ({ camada, grupo, polaridade, percentil, antes, alvo, ok }))
  const base = { borda: args.borda, grupos, textos, ...(foraDoPlano.length > 0 ? { foraDoPlano } : {}) }

  const falhas = leituras.filter((l) => !l.ok)
  if (falhas.length === 0) return { ...base, estado: 'sem-necessidade' }
  const escurecer = falhas.some((l) => l.polaridade === 'clara')
  if (escurecer && falhas.some((l) => l.polaridade === 'escura')) return { ...base, estado: 'inviavel', motivo: MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel }

  const recusadas: NonNullable<PlanoDaBorda['recusadas']> = []
  const validas: Array<{ candidata: CandidataDoTratamento; forca: number; pedida: number | null; alcanca: boolean; ordem: number }> = []
  args.candidatas.forEach((candidata, ordem) => {
    // A luz da candidata no espaço da medida (o mesmo do fundo e do alvo).
    const L = luzMedida(candidata.cor)
    // A cor tem de ficar do LADO LEGÍVEL do alvo de quem pede leitura: só assim nenhum pixel do fundo passa
    // de legível a ilegível, e o véu leva ao alvo (comparar com o p02/p98 aceitava véu escuro sob texto
    // escuro sobre foto com pontos mais escuros que o véu — revisão B do CP2A).
    if (!falhas.every((f) => (escurecer ? L <= f.alvoExato : L >= f.alvoExato))) {
      recusadas.push({ ...candidata, motivo: MOTIVOS_DO_TRATAMENTO.sentidoErrado })
      return
    }
    // A força que leva o pior texto ao alvo (com a opacidade MENOR da curva sobre ele: garante o alvo).
    let pedida: number | null = 0
    for (const f of falhas) {
      if (f.opacidade.min <= 0 || f.antes === L) {
        pedida = null
        break
      }
      const mistura = escurecer ? (f.antes - f.alvoExato) / (f.antes - L) : (f.alvoExato - f.antes) / (L - f.antes)
      pedida = Math.max(pedida, mistura / f.opacidade.min)
    }
    const forca = arred(Math.min(args.forcaMaxima, Math.max(args.forcaMinima, pedida ?? args.forcaMaxima)))
    // Nenhum texto que o véu alcança pode piorar, nem no pior caso previsto (o contrato do CP1).
    const piora = protegidos.find((l) => pioraDaLeitura({ cor: l.cor, sem: l.percentis, com: fundoNoPiorCaso(l.percentis, L, forca, l.opacidade) }))
    if (piora) {
      recusadas.push({ ...candidata, motivo: MOTIVOS_DO_TRATAMENTO.piorou, camada: piora.camada })
      return
    }
    validas.push({ candidata, forca, pedida: pedida === null ? null : arred(pedida), alcanca: pedida !== null && pedida <= args.forcaMaxima, ordem })
  })

  const extras = recusadas.length > 0 ? { recusadas } : {}
  // Vence a que alcança o alvo; entre elas (ou entre as que só melhoram), a da origem mais preferida.
  const vencedora = [...validas].sort((a, b) => Number(b.alcanca) - Number(a.alcanca) || a.ordem - b.ordem)[0]
  if (!vencedora) {
    const pioraNoOutroSentido = recusadas.some((r) => r.motivo === MOTIVOS_DO_TRATAMENTO.piorou && protegidos.find((l) => l.camada === r.camada)?.polaridade !== (escurecer ? 'clara' : 'escura'))
    const motivo = pioraNoOutroSentido
      ? MOTIVOS_DO_TRATAMENTO.polaridadeIncompativel
      : recusadas.some((r) => r.motivo === MOTIVOS_DO_TRATAMENTO.piorou)
        ? MOTIVOS_DO_TRATAMENTO.piorou
        : MOTIVOS_DO_TRATAMENTO.semCor
    return { ...base, estado: 'inviavel', motivo, ...extras }
  }
  return {
    ...base,
    estado: 'tratado',
    cor: vencedora.candidata.cor,
    origemDaCor: vencedora.candidata.origem,
    forca: vencedora.forca,
    forcaPedida: vencedora.pedida,
    alcancaAlvo: vencedora.alcanca,
    ...extras,
  }
}

/**
 * Pura: os gradientes AUTOMÁTICOS que a régua provou piores (TRATAMENTO_PIOROU_LEITURA
 * medido com e sem eles) — o compositor os tira da peça. O tratamento explícito
 * do template e o decorativo nunca entram aqui. `automaticos` dá a luz de cada
 * véu (espaço da medida): quando vários cobrem o texto, sai o que empurra o
 * fundo CONTRA ele (mais claro que o p98 de antes do texto claro, mais escuro
 * que o p02 do escuro). Se nenhum automático o faz: com só automáticos sob o
 * texto, a régua provou o conjunto pior e saem todos; com um véu que não é
 * automático (o explícito do template) sob ele, a piora é dele e o automático
 * que ajuda FICA.
 */
export function gradientesARecusar(pioras: PioraDeTratamento[], automaticos: ReadonlyMap<string, number>): string[] {
  return [
    ...new Set(
      pioras.flatMap((p) => {
        const todos = p.gradientes ?? (p.gradiente ? [p.gradiente] : [])
        const sob = todos.filter((id) => automaticos.has(id))
        const culpados = sob.filter((id) => (p.polaridade === 'clara' ? automaticos.get(id)! > p.antes : automaticos.get(id)! < p.antes))
        return culpados.length > 0 ? culpados : sob.length === todos.length ? sob : []
      }),
    ),
  ]
}
