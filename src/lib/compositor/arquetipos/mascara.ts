/**
 * A MÁSCARA `arco-janela` da foto em caixa (#9, 25/10/2026) — puro: sem banco, sem render.
 *
 * O desenho é DERIVADO da caixa em px (nunca um path fixo, que distorceria por formato): círculo de raio `raio × w`,
 * centro em (w/2, r) nas coordenadas da caixa, pico no topo, laterais retas do ponto de toque (a `flecha`) até a base.
 * Cada metade do arco (meio ângulo θ = asin(w/2r)) vira ⌈θ/45°⌉ cúbicas iguais (`k = 4/3·tan(φ/4)`), e o path sai em
 * coordenadas 0–100 da caixa (a semântica de `style.mask.path` nos dois renderizadores), já compensando a escala não
 * uniforme: só `M L C Z`, 4 casas, sem `-0` nem zero à direita.
 *
 * A derivação v1 é IMUTÁVEL: a peça congela a receita (`ReceitaDaMascara`) e a recomposição confere o path gravado
 * byte a byte contra `pathDoArcoJanela` do PRÓPRIO raio/caixa. Mudar o algoritmo ou o formatador = `versao: 2` ao lado.
 */
import { MASCARAS_DO_ARQUETIPO, type MascaraDoArquetipo } from './tipos'

export const VERSAO_DA_MASCARA = 1

/** A caixa da foto em px inteiros (a da `bg-foto`). */
export interface CaixaDaMascara {
  readonly w: number
  readonly h: number
}

/** A receita congelada na peça (`composicao.arquetipo.foto.mascara`): a única fonte do desenho na recomposição. */
export interface ReceitaDaMascara {
  readonly tipo: MascaraDoArquetipo
  readonly versao: typeof VERSAO_DA_MASCARA
  readonly raio: number
  readonly caixa: CaixaDaMascara
  readonly path: string
}

const ehNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * A flecha do arco (o quanto ele desce do pico até tocar as laterais), em px. `null` fora do domínio do raio — e também
 * quando a CONTA não é representável com entradas finitas (R1 da I9): r ou r² transbordam (raio 1e308, 1e200; caixa de
 * 1e200 px), r ou w/2 somem (caixa subnormal), ou a flecha sai ≤ 0 por cancelamento (raio 1e150, arco degenerado).
 */
export function flechaDoArcoJanela(largura: number, raio: number): number | null {
  if (!ehNumero(largura) || largura <= 0 || !ehNumero(raio) || raio < 0.5) return null
  const r = raio * largura
  const meia = largura / 2
  if (!(ehNumero(r) && ehNumero(r * r) && r > 0 && meia > 0)) return null
  const flecha = r - Math.sqrt(Math.max(0, r * r - meia * meia))
  return ehNumero(flecha) && flecha > 0 ? flecha : null
}

/** O que recusa o domínio (`null` = desenhável): raio < 0,5 ou não finito, caixa sem área, conta não representável, flecha ≥ altura. */
export function problemaDoArcoJanela(caixa: CaixaDaMascara, raio: number): string | null {
  if (!ehObjeto(caixa) || !ehNumero(caixa.w) || !ehNumero(caixa.h) || caixa.w <= 0 || caixa.h <= 0) return 'a caixa da foto não tem largura e altura positivas'
  if (!ehNumero(raio) || raio < 0.5) return `o raio do arco é uma fração ≥ 0,5 da largura da caixa (recebido ${String(raio)})`
  const flecha = flechaDoArcoJanela(caixa.w, raio)
  if (flecha === null) return `o arco de raio ${String(raio)} não é representável na caixa de ${caixa.w}×${caixa.h} px (a conta não dá uma flecha finita e positiva)`
  if (flecha >= caixa.h) return `a flecha do arco (${flecha.toFixed(1)} px) não cabe na altura da caixa (${caixa.h} px)`
  return null
}

/** 4 casas, sem zero à direita e sem `-0`. */
const num = (v: number) => String(Number(v.toFixed(4)))

/** O path v1 do arco-janela da caixa `caixa` (px), em coordenadas 0–100. Fora do domínio LANÇA (nunca desenha outro). */
export function pathDoArcoJanela(caixa: CaixaDaMascara, raio: number): string {
  const problema = problemaDoArcoJanela(caixa, raio)
  if (problema) throw new RangeError(`arco-janela: ${problema}`)
  const { w, h } = caixa
  const r = raio * w
  const theta = Math.asin(Math.min(1, w / 2 / r))
  // O épsilon só protege θ = 45° exatos (raio 1/√2) de virar 2 cúbicas pelo arredondamento do float.
  const n = Math.max(1, Math.ceil(theta / (Math.PI / 4) - 1e-9))
  const phi = theta / n
  const k = (4 / 3) * Math.tan(phi / 4)
  const ponto = (a: number) => [w / 2 + r * Math.sin(a), r - r * Math.cos(a)] as const
  const p = (x: number, y: number) => `${num((x / w) * 100)} ${num((y / h) * 100)}`
  const [x0, y0] = ponto(-theta)
  const partes = ['M0 100', `L${p(x0, y0)}`]
  for (let i = 0; i < 2 * n; i++) {
    const a = -theta + i * phi
    const b = a + phi
    const [ax, ay] = ponto(a)
    const [bx, by] = ponto(b)
    partes.push(`C ${p(ax + k * r * Math.cos(a), ay + k * r * Math.sin(a))} ${p(bx - k * r * Math.cos(b), by - k * r * Math.sin(b))} ${p(bx, by)}`)
  }
  partes.push('L100 100 Z')
  const path = partes.join(' ')
  // Defesa (R1): nenhum path dito válido sai com coordenada não finita.
  if (/NaN|Infinity/.test(path)) throw new RangeError(`arco-janela: o path do raio ${String(raio)} na caixa de ${w}×${h} px tem coordenada não finita`)
  return path
}

/** Retângulo em px nas coordenadas da CAIXA (0,0 = canto superior esquerdo dela), como `assuntoEmPixels` devolve. */
export interface RetanguloNaCaixa {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Fatias da integração da fração visível — o erro fica muito abaixo do ±0,5% do alfa contado em pixel. */
const FATIAS = 2048

/**
 * A fração do retângulo que o ARCO mostra (caixa ∩ região abaixo do arco), por integração em x: a regra 0,75 do #8 vale
 * igual, só a região muda. Fora do domínio do arco LANÇA (a composição já recusou antes).
 */
export function fracaoVisivelNoArco(ret: RetanguloNaCaixa, caixa: CaixaDaMascara, raio: number): number {
  const problema = problemaDoArcoJanela(caixa, raio)
  if (problema) throw new RangeError(`arco-janela: ${problema}`)
  if (!(ret.width > 0 && ret.height > 0)) return 0
  const { w, h } = caixa
  const r = raio * w
  const x0 = Math.max(0, ret.x)
  const x1 = Math.min(w, ret.x + ret.width)
  const yFim = Math.min(h, ret.y + ret.height)
  if (x1 <= x0 || yFim <= Math.max(0, ret.y)) return 0
  const passo = (x1 - x0) / FATIAS
  let area = 0
  for (let i = 0; i < FATIAS; i++) {
    const x = x0 + (i + 0.5) * passo
    const topo = r - Math.sqrt(Math.max(0, r * r - (x - w / 2) ** 2))
    area += Math.max(0, yFim - Math.max(ret.y, topo, 0)) * passo
  }
  const fracao = area / (ret.width * ret.height)
  if (!ehNumero(fracao)) throw new RangeError('arco-janela: a fração visível não é um número finito')
  return fracao
}

/** A receita da peça nova: o path derivado da caixa e do raio do formato. */
export function receitaDoArcoJanela(caixa: CaixaDaMascara, raio: number): ReceitaDaMascara {
  return { tipo: 'arco-janela', versao: VERSAO_DA_MASCARA, raio, caixa: { w: caixa.w, h: caixa.h }, path: pathDoArcoJanela(caixa, raio) }
}

/**
 * A receita GRAVADA, lida FECHADA e conferida contra a derivação v1 do PRÓPRIO raio/caixa (MK-16): cinco chaves, tipo e
 * versão conhecidos, caixa em px inteiros positivos e o path IGUAL, byte a byte, a `pathDoArcoJanela(caixa, raio)`. Ser
 * legível pelos parsers não basta: um retângulo ou um path de outro raio é recusado. Nunca rederiva no lugar do gravado.
 */
export function lerReceitaDaMascara(valor: unknown): ReceitaDaMascara | { problema: string } {
  if (!ehObjeto(valor)) return { problema: 'a máscara gravada não é um objeto' }
  const chaves = Object.keys(valor).sort().join(',')
  if (chaves !== 'caixa,path,raio,tipo,versao') return { problema: `a máscara gravada tem as chaves ${chaves || '(nenhuma)'}` }
  if (!(MASCARAS_DO_ARQUETIPO as readonly unknown[]).includes(valor.tipo)) return { problema: `tipo de máscara desconhecido: ${String(valor.tipo)}` }
  if (valor.versao !== VERSAO_DA_MASCARA) return { problema: `versão da máscara desconhecida: ${String(valor.versao)}` }
  if (!ehNumero(valor.raio)) return { problema: `raio da máscara ilegível: ${String(valor.raio)}` }
  const c = valor.caixa
  if (!ehObjeto(c) || Object.keys(c).sort().join(',') !== 'h,w' || !Number.isInteger(c.w) || !Number.isInteger(c.h) || (c.w as number) <= 0 || (c.h as number) <= 0) {
    return { problema: 'a caixa da máscara não é { w, h } em px inteiros positivos' }
  }
  if (typeof valor.path !== 'string') return { problema: 'o path da máscara não é texto' }
  const caixa = { w: c.w as number, h: c.h as number }
  const dominio = problemaDoArcoJanela(caixa, valor.raio)
  if (dominio) return { problema: dominio }
  let derivado: string
  try {
    derivado = pathDoArcoJanela(caixa, valor.raio)
  } catch (e) {
    return { problema: (e as Error).message }
  }
  if (valor.path !== derivado) return { problema: 'o path gravado não é o arco-janela v1 do próprio raio e caixa' }
  return { tipo: valor.tipo as MascaraDoArquetipo, versao: VERSAO_DA_MASCARA, raio: valor.raio, caixa, path: valor.path }
}
