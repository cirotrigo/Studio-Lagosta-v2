/**
 * A linha do tempo da página (Fase 3 do plano de 02/10/2026): fotos e vídeos
 * marcados com `clipe` tocam em SEQUÊNCIA, um de cada vez, no fundo da página.
 * Módulo PURO (sem DOM, sem Prisma): o canvas, o export, o render de servidor
 * e as portas de escrita calculam o MESMO instante e a MESMA duração.
 *
 * Dado por camada: `layer.clipe?: { duracao?: number }` em camada `image` ou
 * `video`. Os clipes são o bloco contíguo no FUNDO de `layers` (menores
 * `order`), na ordem da página — `normalizarClipes` garante isso em toda
 * escrita do editor; a LEITURA é tolerante (ordena por `order`).
 *
 * Paridade legada: página sem nenhum `clipe` usa EXATAMENTE a conta de hoje
 * (`duracaoDaPagina` → `videoPrincipal` → `trechoDoVideo` → `duracaoDoExport`).
 *
 * Transição (plano de 03/10/2026, Fase 3): `clipe.transicao` no clipe que
 * ENTRA, centrada no corte; ausente = corte seco; no primeiro clipe, ignorada.
 * A duração total e o quadro de t = 0 não mudam.
 */

import {
  clipesDaPagina,
  duracaoDaPagina,
  duracaoDoClipe,
  duracaoDoExport,
  ehClipe,
  DURACAO_MAX_DO_CLIPE,
  DURACAO_MIN_DO_CLIPE,
  MAX_CLIPES,
  paginaEVideo,
  trechoDoVideo,
} from './camadas-de-video'
import { ehMovimento, MOVIMENTOS, progressoDoMovimento, QUADRO_ANOTADO, quadroDoMovimento, suavizar } from './movimento'

type CamadaDaLinha = {
  id: string
  type?: string
  visible?: boolean
  order?: number
  videoMetadata?: { trimStart?: number; trimEnd?: number; duration?: number; overlay?: boolean; [k: string]: unknown } | null
  clipe?: { duracao?: number; transicao?: unknown } | null
  [k: string]: unknown
}

type TrilhaLike = { source?: string; musicId?: number | null; startTime?: number; endTime?: number }

export const TRANSICOES = ['dissolver', 'deslizar'] as const
export type Transicao = (typeof TRANSICOES)[number]

export function ehTransicao(v: unknown): v is Transicao {
  return typeof v === 'string' && (TRANSICOES as readonly string[]).includes(v)
}

/** Teto da janela de uma transição (nunca mais que metade do clipe mais curto da junção). */
export const DURACAO_DA_TRANSICAO = 0.5

export type Clipe = {
  id: string
  tipo: 'foto' | 'video'
  /** Instante da PÁGINA em que o clipe entra. */
  inicio: number
  /** Quanto fica na tela (0 enquanto a duração do vídeo não é conhecida). */
  duracao: number
  /** Início do trecho dentro do arquivo (só vídeo; 0 na foto). */
  trimStart: number
  /** Como este clipe ENTRA (só do segundo em diante; ausente = corte seco). */
  transicao?: Transicao
}

export type LinhaDoTempo = {
  clipes: Clipe[]
  /** Soma dos clipes; `null` na página legada (sem clipe). */
  total: number | null
  /** A duração da página como vídeo: min(total, fatia da música) — ou a conta legada. */
  duracao: number | null
  avisos: string[]
}

export function linhaDoTempo(
  layers: readonly CamadaDaLinha[] | null | undefined,
  audio: TrilhaLike | null | undefined,
  duracoesCarregadas?: ReadonlyMap<string, number> | null,
): LinhaDoTempo {
  const todos = clipesDaPagina(layers)
  if (todos.length === 0) {
    return { clipes: [], total: null, duracao: duracaoDaPagina(layers, audio, duracoesCarregadas), avisos: [] }
  }
  const avisos: string[] = []
  if (todos.length > MAX_CLIPES) {
    avisos.push(`A linha do tempo aceita até ${MAX_CLIPES} clipes: ${todos.length - MAX_CLIPES} ficaram de fora.`)
  }
  const clipes: Clipe[] = []
  let t = 0
  for (const c of todos.slice(0, MAX_CLIPES)) {
    const d = duracaoDoClipe(c, duracoesCarregadas?.get(c.id))
    if (c.type === 'video' && d === null) avisos.push(`"${String(c.name ?? c.id)}" ainda está carregando.`)
    const tipo = c.type === 'video' ? 'video' : 'foto'
    const pedida = c.clipe?.transicao
    const transicao = clipes.length > 0 && ehTransicao(pedida) ? pedida : undefined
    clipes.push({
      id: c.id,
      tipo,
      inicio: t,
      duracao: d ?? 0,
      trimStart: tipo === 'video' ? trechoDoVideo(c.videoMetadata).inicio : 0,
      ...(transicao ? { transicao } : {}),
    })
    t += d ?? 0
  }
  return { clipes, total: t, duracao: duracaoDoExport(t, audio), avisos }
}

/**
 * O clipe que está na tela no instante `t`: o último cujo `inicio` ≤ t (passado
 * o fim do último, ele segura — como o vídeo segura o último quadro); antes do
 * primeiro, o primeiro.
 */
export function clipeAtivoEm(clipes: readonly Clipe[], t: number): Clipe | null {
  if (clipes.length === 0) return null
  let ativo = clipes[0]
  for (const c of clipes) if (c.inicio <= t) ativo = c
  return ativo
}

export type QuadroDoClipe = {
  visivel: boolean
  /** 0–1, no grupo de efeito do clipe (multiplica a opacidade da camada). */
  opacidade: number
  /** Deslocamento horizontal, em fração da LARGURA DA PÁGINA. */
  deslocamentoX: number
}

/** A janela da transição da junção que termina no clipe `i`, centrada no corte; `null` = corte seco. */
export function janelaDaTransicao(
  clipes: readonly Clipe[],
  i: number,
): { de: number; ate: number; duracao: number } | null {
  const sai = clipes[i - 1]
  const entra = clipes[i]
  if (!sai || !entra?.transicao) return null
  const duracao = Math.min(DURACAO_DA_TRANSICAO, Math.min(sai.duracao, entra.duracao) / 2)
  if (!(duracao > 0)) return null
  return { de: entra.inicio - duracao / 2, ate: entra.inicio + duracao / 2, duracao }
}

/**
 * O que cada clipe mostra no instante `t`. Fora das janelas, só o clipe ativo
 * (`clipeAtivoEm`), inteiro e no lugar — como sempre foi. Dentro da janela de
 * uma junção com transição (aberta nas pontas: nas bordas a imagem é pura), os
 * dois clipes da junção aparecem:
 * - dissolver: o que ENTRA, desenhado por cima (vem depois na ordem da
 *   página), vai de transparente a opaco; o que sai fica opaco — no meio dá a
 *   média das duas imagens, sem escurecer;
 * - deslizar: o que sai anda para a esquerda e o que entra chega pela direita,
 *   empurrando, os dois na mesma suavização.
 * A janela nunca passa de metade do clipe mais curto, então duas janelas não
 * se encostam e t = 0 nunca está numa delas.
 */
export function quadroDosClipes(clipes: readonly Clipe[], t: number): Map<string, QuadroDoClipe> {
  const quadros = new Map<string, QuadroDoClipe>()
  const ativo = clipeAtivoEm(clipes, t)
  for (const c of clipes) quadros.set(c.id, { visivel: c === ativo, opacidade: 1, deslocamentoX: 0 })
  for (let i = 1; i < clipes.length; i++) {
    const janela = janelaDaTransicao(clipes, i)
    if (!janela || t <= janela.de || t >= janela.ate) continue
    const p = (t - janela.de) / janela.duracao
    const sai = clipes[i - 1].id
    const entra = clipes[i].id
    if (clipes[i].transicao === 'dissolver') {
      quadros.set(sai, { visivel: true, opacidade: 1, deslocamentoX: 0 })
      quadros.set(entra, { visivel: true, opacidade: p, deslocamentoX: 0 })
    } else {
      const s = suavizar(p)
      quadros.set(sai, { visivel: true, opacidade: 1, deslocamentoX: -s })
      quadros.set(entra, { visivel: true, opacidade: 1, deslocamentoX: 1 - s })
    }
  }
  return quadros
}

/**
 * As camadas que o instante `t` desenha: só o clipe ativo, mais tudo que não é
 * clipe (texto, logo, motion…). Página sem clipe volta inteira.
 *
 * Em página-vídeo (a decisão olha a página INTEIRA, antes de a sequência virar
 * o clipe ativo — por isso o `audio`), cada foto em movimento sai com o quadro
 * daquele `t` anotado em `QUADRO_ANOTADO`, que o render de servidor desenha.
 */
export function camadasNoInstante<T extends CamadaDaLinha>(
  layers: readonly T[],
  t: number,
  opcoes?: { audio?: TrilhaLike | null },
): T[] {
  const audio = opcoes?.audio ?? null
  const linha = linhaDoTempo(layers, audio)
  const ativo = clipeAtivoEm(linha.clipes, t)
  const doInstante = ativo ? layers.filter((l) => !ehClipe(l) || l.id === ativo.id) : [...layers]
  if (!paginaEVideo(layers, audio)) return doInstante
  return doInstante.map((l) =>
    l.type === 'image' && ehMovimento(l.movimento)
      ? { ...l, [QUADRO_ANOTADO]: quadroDoMovimento(l.movimento, progressoDoMovimento(l, linha, t)) }
      : l,
  )
}

/**
 * Reordena: clipes (pela ordem dada, ou pela ordem atual) no FUNDO, contíguos,
 * e o resto por cima na ordem em que estava; `order` renumerado. Toda escrita
 * do editor que marca, desmarca ou reordena clipe passa aqui.
 */
export function normalizarClipes<T extends CamadaDaLinha>(layers: readonly T[], idsNaOrdem?: readonly string[]): T[] {
  const porOrdem = [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  let clipes = porOrdem.filter((l) => ehClipe(l))
  if (idsNaOrdem) {
    const indice = new Map(idsNaOrdem.map((id, i) => [id, i]))
    clipes = [...clipes].sort((a, b) => (indice.get(a.id) ?? clipes.length) - (indice.get(b.id) ?? clipes.length))
  }
  const resto = porOrdem.filter((l) => !ehClipe(l))
  return [...clipes, ...resto].map((l, order) => (l.order === order ? l : { ...l, order }))
}

/**
 * O "+" da linha do tempo: a camada inserida (foto ou vídeo) vira clipe em
 * TELA CHEIA no fim da sequência. Na primeira vez, o fundo que já existia — o
 * vídeo de base ou a imagem mais ao fundo que cobre a página — vira o clipe 1,
 * senão ele sumiria atrás do clipe novo. Devolve as camadas já normalizadas.
 */
export function inserirClipe<T extends CamadaDaLinha>(
  layers: readonly T[],
  nova: T,
  canvas: { width: number; height: number },
): T[] {
  const comoClipe = (l: T): T => ({
    ...l,
    position: { x: 0, y: 0 },
    size: { width: canvas.width, height: canvas.height },
    clipe: l.clipe ?? {},
  })
  let base = [...layers]
  if (!base.some((l) => ehClipe(l))) {
    const cobre = (l: CamadaDaLinha) => {
      const s = l.size as { width?: number; height?: number } | undefined
      return !!s && (s.width ?? 0) >= canvas.width * 0.9 && (s.height ?? 0) >= canvas.height * 0.9
    }
    const porOrdem = [...base].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const fundo =
      porOrdem.find((l) => l.type === 'video' && l.visible !== false && !l.videoMetadata?.overlay) ??
      porOrdem.find((l) => l.type === 'image' && l.visible !== false && cobre(l))
    if (fundo) base = base.map((l) => (l === fundo ? { ...l, clipe: {} } : l))
  }
  // A ordem é DADA: a camada nova nasce com `order` 0 e, ordenada por ele,
  // entraria no meio da sequência em vez de no fim
  const ordem = normalizarClipes(base).filter((l) => ehClipe(l)).map((l) => l.id)
  return normalizarClipes([...base, comoClipe(nova)], [...ordem, nova.id])
}

/** Cabem mais `n` clipes na página? Inserir, duplicar e colar perguntam ANTES de mexer. */
export function cabemMaisClipes(layers: readonly CamadaDaLinha[] | null | undefined, n = 1): boolean {
  return (layers ?? []).filter((l) => ehClipe(l)).length + n <= MAX_CLIPES
}

/**
 * O teto de clipes num lote de ações síncronas (duplicar vários selecionados,
 * Ctrl+D): cada ação conferia o MESMO `design.layers`, ainda sem as anteriores,
 * e 9 + 2 passavam. A reserva soma o que já foi aceito até a próxima renderização,
 * que a `zerar` (o `design` novo já conta os clipes que entraram).
 */
export function criarReservaDeClipes() {
  let pendentes = 0
  return {
    zerar() {
      pendentes = 0
    },
    reservar(layers: readonly CamadaDaLinha[] | null | undefined, n = 1): boolean {
      if (!cabemMaisClipes(layers, pendentes + n)) return false
      pendentes += n
      return true
    },
  }
}

export const MENSAGEM_TETO_DE_CLIPES = `A linha do tempo aceita até ${MAX_CLIPES} fotos e vídeos. Tire um clipe antes de pôr outro.`

/**
 * O que o servidor recusa em `Page.layers` (PATCH da página, portas MCP):
 * `clipe.duracao` fora de [0,5; 60] s, mais de 10 clipes, `movimento` e
 * `clipe.transicao` fora da lista. Página legada (sem clipe) passa sempre.
 * Mensagens em português, uma por problema.
 */
export function problemasDosClipes(layers: readonly CamadaDaLinha[] | null | undefined): string[] {
  const problemas: string[] = []
  // Movimento (Fase 2): valor fora da lista é recusado; ausente ou null = parado
  for (const l of layers ?? []) {
    const m = l?.movimento
    if (m !== undefined && m !== null && !ehMovimento(m)) {
      problemas.push(
        `A camada "${String(l.name ?? l.id)}" tem um movimento inválido (${String(m)}): vale ${MOVIMENTOS.join(', ')}.`,
      )
    }
  }
  const clipes = (layers ?? []).filter((l) => l && ehClipe(l))
  if (clipes.length > MAX_CLIPES) {
    problemas.push(`A linha do tempo aceita até ${MAX_CLIPES} clipes (recebeu ${clipes.length}).`)
  }
  for (const c of clipes) {
    const nome = String(c.name ?? c.id)
    if (c.type === 'video') problemas.push(...problemasDoTrecho(nome, c.videoMetadata))
    // Transição: ausente ou null = corte seco (no primeiro clipe vale, só é ignorada)
    const tr = c.clipe?.transicao
    if (tr !== undefined && tr !== null && !ehTransicao(tr)) {
      problemas.push(`O clipe "${nome}" tem uma transição inválida (${String(tr)}): vale ${TRANSICOES.join(', ')}.`)
    }
    const d = c.clipe?.duracao
    if (d === undefined) continue
    if (typeof d !== 'number' || !Number.isFinite(d) || d < DURACAO_MIN_DO_CLIPE || d > DURACAO_MAX_DO_CLIPE) {
      problemas.push(
        `O clipe "${nome}" tem duração inválida (${String(d)}): vale de ${DURACAO_MIN_DO_CLIPE} a ${DURACAO_MAX_DO_CLIPE} segundos.`,
      )
    }
  }
  return problemas
}

/** O trecho de um clipe de vídeo: números finitos, início ≥ 0, trecho mínimo e fim dentro do arquivo (quando conhecido). */
function problemasDoTrecho(nome: string, meta: CamadaDaLinha['videoMetadata']): string[] {
  if (!meta) return []
  const problemas: string[] = []
  const campos = { trimStart: meta.trimStart, trimEnd: meta.trimEnd, duration: meta.duration }
  for (const [campo, v] of Object.entries(campos)) {
    if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) {
      problemas.push(`O vídeo "${nome}" tem um corte inválido (${campo}: ${String(v)}).`)
    }
  }
  if (problemas.length > 0) return problemas
  const inicio = meta.trimStart ?? 0
  if (inicio < 0) problemas.push(`O vídeo "${nome}" começa antes do início do arquivo (${inicio} s).`)
  if (meta.duration !== undefined && meta.duration !== null && meta.duration <= 0) {
    problemas.push(`O vídeo "${nome}" tem uma duração inválida (${meta.duration} s).`)
  }
  const fonte = meta.duration && meta.duration > 0 ? meta.duration : null
  if (fonte !== null && inicio > fonte - DURACAO_MIN_DO_CLIPE) {
    problemas.push(`O vídeo "${nome}" começa depois do fim do arquivo (${inicio} s de ${fonte} s).`)
  }
  if (meta.trimEnd !== undefined && meta.trimEnd !== null) {
    if (meta.trimEnd < inicio + DURACAO_MIN_DO_CLIPE) {
      problemas.push(`O trecho do vídeo "${nome}" é curto demais: o mínimo é ${DURACAO_MIN_DO_CLIPE} s.`)
    }
    if (fonte !== null && meta.trimEnd > fonte + 0.05) {
      problemas.push(`O vídeo "${nome}" termina depois do fim do arquivo (${meta.trimEnd} s de ${fonte} s).`)
    }
  }
  return problemas
}
