/**
 * A JANELA ASSISTIDA (F2b da direção por referência, 02/11/2026): a composição por referência com OUTRA foto calcula a
 * janela que leva o assunto da foto nova para o lugar e o tamanho que o assunto tinha na referência (posição E ocupação),
 * dentro dos limites: o assunto inteiro na janela, a janela dentro da foto, o zoom com teto, o mínimo do renderer.
 * Quando o alvo não é alcançável, a janela fica no mais perto que os limites deixam, com `ajustes` e `erro` ditos.
 *
 * As contas são em px da foto; a janela sai CANONICALIZADA pelo clamp do renderer (`janelaEfetiva`): é ela que mede,
 * chaveia e desenha. Módulo PURO.
 */
import type { ImageSize } from '@/lib/image-crop-utils'
import { lerCaixaDoAssunto, type AssuntoNormalizado } from '../assunto-da-foto'
import { chaveDoCorte, escalaDaJanela, janelaEfetiva, JANELA_MINIMA, type Janela } from '../corte-da-foto'
import type { Caixa } from './tipos'

export const ZOOM_MAXIMO_DA_ASSISTENCIA = 1.6
/** LINEAR nos lados: a área vai por 0,7225 / 1,3225. A ideal primeiro. */
export const FATORES_DOS_LADOS = [1, 0.85, 1.15] as const
/** A diferença numérica aceita entre a janela calculada e a canônica: tolerância, não igualdade estrita. */
const TOLERANCIA_DO_CLAMP = 1e-9

export type AjusteDaJanela = 'deslizada' | 'zoom-minimo' | 'zoom-maximo' | 'cover' | 'minimo-por-eixo'
export type MotivoDaInviabilidade = 'assunto-nao-cabe-no-cover' | 'minimo-do-renderer' | 'dominio-invalido'

export interface JanelaAssistida {
  ok: true
  janela: Janela
  ajustes: AjusteDaJanela[]
  zoom: number
  escala: number
  obtido: { centro: { x: number; y: number }; ocupacao: number }
  /** `dx`, `dy` em frações do canvas; `ocupacao` RELATIVA: (obtida − alvo) / alvo. */
  erro: { dx: number; dy: number; ocupacao: number }
}

export interface ArgsDaJanela {
  /** `formatos[f].assunto.caixa`, em frações do canvas. */
  alvo: Caixa
  /** A caixa da foto NOVA, em frações da foto. */
  assunto: AssuntoNormalizado
  /** Px da foto nova. */
  foto: ImageSize
  /** Px da caixa que ela preenche. */
  caixa: ImageSize
  /** 1 (ideal), 0,85, 1,15: finito e > 0. */
  fatorDosLados?: number
  /** Finito e ≥ 1. */
  zoomMaximo?: number
}

const positivo = (v: number) => Number.isFinite(v) && v > 0
const naFaixa = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export function janelaDoAssunto({ alvo, assunto, foto, caixa, fatorDosLados = 1, zoomMaximo = ZOOM_MAXIMO_DA_ASSISTENCIA }: ArgsDaJanela): JanelaAssistida | { ok: false; motivo: MotivoDaInviabilidade } {
  const lida = lerCaixaDoAssunto(assunto)
  const alvoValido = naFaixa(alvo.x) && naFaixa(alvo.y) && positivo(alvo.w) && positivo(alvo.h) && naFaixa(alvo.x + alvo.w) && naFaixa(alvo.y + alvo.h)
  if (!lida || !alvoValido || ![foto.width, foto.height, caixa.width, caixa.height, fatorDosLados].every(positivo) || !(Number.isFinite(zoomMaximo) && zoomMaximo >= 1)) return { ok: false, motivo: 'dominio-invalido' }

  const { width: W, height: H } = foto
  const r = caixa.width / caixa.height
  const [x0, x1, y0, y1] = [lida.x0 * W, lida.x1 * W, lida.y0 * H, lida.y1 * H]
  const [bw, bh] = [x1 - x0, y1 - y0]
  const a = alvo.w * alvo.h

  const hDesejada = Math.sqrt((bw * bh) / (a * r)) * fatorDosLados
  const hCover = Math.min(H, W / r) // a janela não passa da foto
  const hConter = Math.max(bh, bw / r) // o assunto inteiro dentro
  const hMinZoom = hCover / zoomMaximo // não ampliar além do teto
  const hMin1pct = Math.max(JANELA_MINIMA * H, (JANELA_MINIMA * W) / r) // o mínimo do renderer, por eixo
  if (hConter > hCover) return { ok: false, motivo: 'assunto-nao-cabe-no-cover' }
  if (hMin1pct > hCover) return { ok: false, motivo: 'minimo-do-renderer' }

  const h = clamp(hDesejada, Math.max(hConter, hMinZoom, hMin1pct), hCover)
  const w = r * h
  const ajustes: AjusteDaJanela[] = []
  if (h !== hDesejada) {
    if (h === hConter) ajustes.push('zoom-minimo')
    if (h === hMinZoom) ajustes.push('zoom-maximo')
    if (h === hCover) ajustes.push('cover')
    if (h === hMin1pct) ajustes.push('minimo-por-eixo')
  }

  // O deslize CONTÉM nos dois eixos: dentro da foto ∩ com o assunto inteiro (nunca vazia: w ≥ bw, h ≥ bh e o assunto está na foto).
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2]
  const [alvoCx, alvoCy] = [alvo.x + alvo.w / 2, alvo.y + alvo.h / 2]
  const [xDesejado, yDesejado] = [cx - alvoCx * w, cy - alvoCy * h]
  const x = clamp(xDesejado, Math.max(0, x1 - w), Math.min(W - w, x0))
  const y = clamp(yDesejado, Math.max(0, y1 - h), Math.min(H - h, y0))
  if (x !== xDesejado || y !== yDesejado) ajustes.push('deslizada')

  const crua: Janela = { x: x / W, y: y / H, width: w / W, height: h / H }
  const janela = janelaEfetiva(crua)
  if ((['x', 'y', 'width', 'height'] as const).some((k) => Math.abs(janela[k] - crua[k]) > TOLERANCIA_DO_CLAMP)) return { ok: false, motivo: 'dominio-invalido' }

  const [wFinal, hFinal] = [janela.width * W, janela.height * H]
  const centro = { x: (cx - janela.x * W) / wFinal, y: (cy - janela.y * H) / hFinal }
  const ocupacao = (bw * bh) / (wFinal * hFinal)
  return {
    ok: true,
    janela,
    ajustes,
    zoom: hCover / h,
    escala: escalaDaJanela(janela, foto, caixa),
    obtido: { centro, ocupacao },
    erro: { dx: centro.x - alvoCx, dy: centro.y - alvoCy, ocupacao: (ocupacao - a) / a },
  }
}

export type CandidataDoAssunto = JanelaAssistida & { chave: string; fator: number }

/** As até três candidatas (a ideal primeiro), sem repetição por `chaveDoCorte`. Nenhuma: `motivo` diz por quê. */
export function candidatasDoAssunto(args: Omit<ArgsDaJanela, 'fatorDosLados'>): { candidatas: CandidataDoAssunto[]; motivo?: MotivoDaInviabilidade } {
  const candidatas: CandidataDoAssunto[] = []
  let motivo: MotivoDaInviabilidade | undefined
  for (const fator of FATORES_DOS_LADOS) {
    const r = janelaDoAssunto({ ...args, fatorDosLados: fator })
    if ('motivo' in r) {
      motivo ??= r.motivo
      continue
    }
    const chave = chaveDoCorte({ janela: r.janela })
    if (!candidatas.some((c) => c.chave === chave)) candidatas.push({ ...r, chave, fator })
  }
  return candidatas.length > 0 ? { candidatas } : { candidatas, motivo }
}
