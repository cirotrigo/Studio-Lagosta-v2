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
} from './camadas-de-video'

type CamadaDaLinha = {
  id: string
  type?: string
  visible?: boolean
  order?: number
  videoMetadata?: { trimStart?: number; trimEnd?: number; duration?: number; overlay?: boolean; [k: string]: unknown } | null
  clipe?: { duracao?: number } | null
  [k: string]: unknown
}

type TrilhaLike = { source?: string; musicId?: number | null; startTime?: number; endTime?: number }

export type Clipe = {
  id: string
  tipo: 'foto' | 'video'
  /** Instante da PÁGINA em que o clipe entra. */
  inicio: number
  /** Quanto fica na tela (0 enquanto a duração do vídeo não é conhecida). */
  duracao: number
  /** Início do trecho dentro do arquivo (só vídeo; 0 na foto). */
  trimStart: number
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
    clipes.push({
      id: c.id,
      tipo,
      inicio: t,
      duracao: d ?? 0,
      trimStart: tipo === 'video' ? Math.max(0, c.videoMetadata?.trimStart ?? 0) : 0,
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

/**
 * As camadas que o instante `t` desenha: só o clipe ativo, mais tudo que não é
 * clipe (texto, logo, motion…). Página sem clipe volta inteira.
 */
export function camadasNoInstante<T extends CamadaDaLinha>(layers: readonly T[], t: number): T[] {
  const ativo = clipeAtivoEm(linhaDoTempo(layers, null).clipes, t)
  if (!ativo) return [...layers]
  return layers.filter((l) => !ehClipe(l) || l.id === ativo.id)
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
  return normalizarClipes([...base, comoClipe(nova)])
}

/**
 * O que o servidor recusa em `Page.layers` (PATCH da página, portas MCP):
 * `clipe.duracao` fora de [0,5; 60] s e mais de 10 clipes. Página legada (sem
 * clipe) passa sempre. Mensagens em português, uma por problema.
 */
export function problemasDosClipes(layers: readonly CamadaDaLinha[] | null | undefined): string[] {
  const problemas: string[] = []
  const clipes = (layers ?? []).filter((l) => l && ehClipe(l))
  if (clipes.length > MAX_CLIPES) {
    problemas.push(`A linha do tempo aceita até ${MAX_CLIPES} clipes (recebeu ${clipes.length}).`)
  }
  for (const c of clipes) {
    const d = c.clipe?.duracao
    if (d === undefined) continue
    if (typeof d !== 'number' || !Number.isFinite(d) || d < DURACAO_MIN_DO_CLIPE || d > DURACAO_MAX_DO_CLIPE) {
      problemas.push(
        `O clipe "${String(c.name ?? c.id)}" tem duração inválida (${String(d)}): vale de ${DURACAO_MIN_DO_CLIPE} a ${DURACAO_MAX_DO_CLIPE} segundos.`,
      )
    }
  }
  return problemas
}
