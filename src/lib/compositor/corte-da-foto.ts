/**
 * O CORTE DA FOTO (F2a da direção por referência, 01/11/2026): a JANELA é o retângulo da foto original que a caixa
 * mostra, em FRAÇÕES — o mesmo `style.crop` que o editor grava e que os dois renderizadores desenham com precedência
 * (`resolveImageSourceRect`, `image-fit.ts`). O compositor, que só falava as 9 âncoras (`CropPosition`), passa a
 * falar `Corte = { janela, rotulo? }`: a âncora vira janela pela MESMA conta do desenho (`calculateImageCrop`), e a
 * janela explícita (da spec ou da página) não tem rótulo.
 *
 * Contrato (revisão do Codex sobre o plano, 01/11): um retângulo-fonte efetivo só (o clamp é o de
 * `resolveImageSourceRect`: mínimo 0,01, dentro de 0..1); igualdade por VALOR (`chaveDoCorte`), nunca por referência;
 * o rótulo é preservado quando existe (a peça legada grava `cropPosition` como sempre); a proporção se confere em
 * PIXELS da foto contra a caixa, com expansão mínima centrada acima da tolerância e recusa quando sai da foto.
 *
 * Módulo PURO.
 */
import { calculateImageCrop, type CropData, type CropPosition, type ImageSize } from '@/lib/image-crop-utils'

/** Frações da foto ORIGINAL (0..1), como `style.crop`. */
export interface Janela {
  x: number
  y: number
  width: number
  height: number
}

/** O corte que o compositor avalia e grava: a janela sempre; o rótulo quando veio de uma âncora. */
export interface Corte {
  janela: Janela
  rotulo?: CropPosition
}

/** O mesmo mínimo de `resolveImageSourceRect`: abaixo disso o desenho e a medida divergiriam. */
export const JANELA_MINIMA = 0.01
/** Erro relativo de proporção (em px) tolerado sem ajuste: 0,5 %. */
export const TOLERANCIA_DA_PROPORCAO = 0.005
export const ROTULO_DA_JANELA = 'janela' as const
export type RotuloDoCorte = CropPosition | typeof ROTULO_DA_JANELA

const finito = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Lê uma janela de um valor qualquer (`style.crop`, a spec, o diagnóstico) e a RESOLVE como o desenho (o clamp de
 * `resolveImageSourceRect`): o estado existente que o renderer aceita nunca é ignorado — ignorá-lo faria a recomposição
 * trocar o enquadramento visível e o revisor medir o corte errado (Codex, F2a rodada 1, P2 #7). `null` só no que o
 * renderer também não desenha por ela (não é objeto, lado não finito ou ≤ 0, nada sobra depois do clamp). A forma de um
 * PEDIDO novo é a `janelaSchema` da spec, estrita. A faixa na borda que fica abaixo de 1 % DEPOIS do clamp (`x: 0.995,
 * width: 0.5` → 0,5 % da largura) é o que o renderer desenha — fica (Codex, rodada 2); só o lado que chega a zero (x ≥ 1) é null.
 */
export function lerJanela(valor: unknown): Janela | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const j = valor as Record<string, unknown>
  if (![j.x, j.y, j.width, j.height].every(finito)) return null
  const { width, height } = j as unknown as Janela
  if (!(width > 0 && height > 0)) return null
  const e = janelaEfetiva(j as unknown as Janela)
  return e.width > 0 && e.height > 0 ? e : null
}

/** A janela como `resolveImageSourceRect` a desenha (clamp): é esta que a medida usa — nunca a crua. */
export function janelaEfetiva(j: Janela): Janela {
  const x = Math.min(Math.max(j.x, 0), 1)
  const y = Math.min(Math.max(j.y, 0), 1)
  const width = Math.min(Math.max(j.width, JANELA_MINIMA), 1 - x)
  const height = Math.min(Math.max(j.height, JANELA_MINIMA), 1 - y)
  return { x, y, width, height }
}

/** A janela em px da foto original — a mesma conta do desenho. */
export function janelaEmPx(j: Janela, foto: ImageSize): CropData {
  const e = janelaEfetiva(j)
  return { cropX: e.x * foto.width, cropY: e.y * foto.height, cropWidth: e.width * foto.width, cropHeight: e.height * foto.height }
}

/** A âncora (`cover` + `cropPosition`) como janela, pela MESMA conta do desenho (`calculateImageCrop`). Sem arredondar. */
export function janelaDoRotulo(foto: ImageSize, caixa: ImageSize, rotulo: CropPosition): Janela {
  const c = calculateImageCrop(foto, caixa, rotulo)
  return { x: c.cropX / foto.width, y: c.cropY / foto.height, width: c.cropWidth / foto.width, height: c.cropHeight / foto.height }
}

export function corteDoRotulo(foto: ImageSize, caixa: ImageSize, rotulo: CropPosition): Corte {
  return { rotulo, janela: janelaDoRotulo(foto, caixa, rotulo) }
}

export function corteDaJanela(janela: Janela): Corte {
  return { janela: janelaEfetiva(janela) }
}

/** O rótulo que o diagnóstico mostra: a âncora, ou `'janela'`. */
export const rotuloDoCorte = (c: Corte): RotuloDoCorte => c.rotulo ?? ROTULO_DA_JANELA

/** A chave canônica — igualdade por VALOR para `Map`, `find` e desempate (a janela com as frações inteiras, sem arredondar). */
export function chaveDoCorte(c: Pick<Corte, 'rotulo' | 'janela'>): string {
  if (c.rotulo) return c.rotulo
  const j = c.janela
  return `janela:${j.x},${j.y},${j.width},${j.height}`
}

export const cortesIguais = (a: Corte, b: Corte): boolean => chaveDoCorte(a) === chaveDoCorte(b)

/** A chave de uma escolha gravada (`corte` rótulo, ou `'janela'` + `janela`): a mesma régua de `chaveDoCorte`. */
export function chaveDaEscolha(escolha: { corte: RotuloDoCorte; janela?: Janela | null }): string {
  return escolha.corte === ROTULO_DA_JANELA && escolha.janela ? chaveDoCorte({ janela: escolha.janela }) : escolha.corte
}

/** O corte de uma escolha gravada, para a reprodução (o rótulo vira janela pela caixa). `null` = janela ilegível. */
export function corteDaEscolha(escolha: { corte: RotuloDoCorte; janela?: Janela | null }, foto: ImageSize, caixa: ImageSize): Corte | null {
  if (escolha.corte === ROTULO_DA_JANELA) return escolha.janela ? corteDaJanela(escolha.janela) : null
  return corteDoRotulo(foto, caixa, escolha.corte)
}

/** A proporção da janela em PIXELS da foto (largura/altura) — é o que a caixa estica. */
export const proporcaoDaJanela = (j: Janela, foto: ImageSize) => (j.width * foto.width) / (j.height * foto.height)

/**
 * A janela na proporção da CAIXA: dentro da tolerância, a mesma; acima, expansão MÍNIMA centrada do lado que falta
 * (a caixa mostraria MAIS foto, nunca menos), deslocada só o necessário para ficar dentro da foto. `null` quando a
 * expansão não cabe na foto (o lado precisaria passar de 1). Quem chama DIZ o ajuste.
 */
export function janelaNaProporcao(j: Janela, foto: ImageSize, caixa: ImageSize, tolerancia = TOLERANCIA_DA_PROPORCAO): { janela: Janela; ajustada: boolean } | null {
  const e = janelaEfetiva(j)
  const alvo = caixa.width / caixa.height
  const atual = proporcaoDaJanela(e, foto)
  if (Math.abs(atual - alvo) / alvo <= tolerancia) return { janela: e, ajustada: false }
  let { x, y, width, height } = e
  if (atual < alvo) {
    // Estreita demais: alarga (em frações da LARGURA da foto).
    const largura = (alvo * height * foto.height) / foto.width
    x = x + (width - largura) / 2
    width = largura
  } else {
    const altura = (width * foto.width) / (alvo * foto.height)
    y = y + (height - altura) / 2
    height = altura
  }
  if (width > 1 + 1e-9 || height > 1 + 1e-9) return null
  x = Math.min(Math.max(x, 0), 1 - width)
  y = Math.min(Math.max(y, 0), 1 - height)
  return { janela: { x, y, width, height }, ajustada: true }
}

/** Quanto a caixa amplia a foto a partir da janela (1 = tamanho natural): o aviso de ampliação (#8) conta a janela-fonte. */
export const escalaDaJanela = (j: Janela, foto: ImageSize, caixa: ImageSize) => Math.max(caixa.width / (j.width * foto.width), caixa.height / (j.height * foto.height))
