/**
 * G4.2 — imagem e grade de fotos na prévia do /gerar-criativo (27/10/2026). Puro, sem React e sem banco: a tela, o
 * export e o `finalize` usam as mesmas funções.
 *
 * A prévia antiga desenhava toda imagem em cover pelo centro, ignorava `style.crop` e os espelhos e tinha piso de
 * 20 px: a célula de grade recortada (ou de 8 px) saía diferente da arte do servidor, e o PNG gravado é o do cliente.
 * A prévia nova desenha pelo mesmo `resolveImageSourceRect` do editor e do servidor, com espelho, raio e o piso do
 * editor (`ladoMinimoNoEditor`: 8 px na célula, 20 px no resto). A marca é compatibilidade do cliente, NÃO prova de
 * pixel: chamada forjada passa (limite declarado, o mesmo da marca do vetor).
 */
import type { Layer } from '@/types/template'
import { resolveImageSourceRect, type ImageSize } from '@/lib/image-fit'
import { ladoMinimoNoEditor } from '@/lib/grades/ajustes'
import { celulaVazia } from '@/lib/grades/conferir'

/** Sinal de compatibilidade do cliente que desenha recorte e grade. NÃO é prova de pixel. */
export const VERSAO_DA_PREVIA_DE_IMAGEM = 'imagem-v1' as const

const TIPOS_DE_IMAGEM = new Set(['image', 'logo', 'element'])

type CamadaMinima = Pick<Layer, 'id' | 'type'> & Partial<Pick<Layer, 'visible' | 'fileUrl' | 'style' | 'metadata'>>

const membroDeGrade = (l: CamadaMinima) => (l.metadata as { grade?: unknown } | undefined)?.grade != null
const temRecorteManual = (l: CamadaMinima) => {
  const c = l.style?.crop
  return !!c && c.width > 0 && c.height > 0
}

/**
 * Camadas desenhadas (fora de `ocultas`, `visible !== false`) que só a prévia nova desenha igual ao servidor: toda
 * célula de grade e toda imagem COM foto que tem recorte manual. Chamada sobre as camadas EFETIVAS (depois de trocar
 * as fotos): a foto que entra numa camada com recorte passa a desenhá-lo.
 */
export function imagensQueExigemAPrevia(camadas: CamadaMinima[], ocultas: ReadonlySet<string> = new Set()): string[] {
  return camadas
    .filter((l) => TIPOS_DE_IMAGEM.has(l.type) && !ocultas.has(l.id) && l.visible !== false)
    .filter((l) => membroDeGrade(l) || (temRecorteManual(l) && !celulaVazia(l.fileUrl)))
    .map((l) => l.id)
}

export interface DesenhoDaImagem {
  largura: number
  altura: number
  /** Retângulo-fonte em px da foto; ausente = a foto inteira esticada na caixa */
  crop?: { x: number; y: number; width: number; height: number }
  cornerRadius: number
  /** Espelho DENTRO da caixa (como o editor: escala negativa na imagem, nunca no nó que o Transformer mexe) */
  espelho: { x: number; y: number; scaleX: number; scaleY: number } | null
}

/**
 * Como a prévia desenha a imagem: a caixa com o piso do editor, o recorte pelo helper único (sem `objectFit`, a
 * prévia segue o cover de sempre), o raio da borda e os espelhos. `natural` só da foto que a camada pede
 * (`dimensoesDaFotoCarregada`); sem ela, nada de recorte.
 */
export function desenhoDaImagemNaPrevia(camada: Layer, natural: ImageSize | undefined): DesenhoDaImagem {
  const piso = ladoMinimoNoEditor(camada)
  const largura = Math.max(piso, camada.size?.width ?? 100)
  const altura = Math.max(piso, camada.size?.height ?? 100)
  const style = { ...camada.style, objectFit: camada.style?.objectFit ?? 'cover' }
  const src = natural ? resolveImageSourceRect(natural, { width: largura, height: altura }, style) : undefined
  const flipH = camada.style?.flipH === true
  const flipV = camada.style?.flipV === true
  return {
    largura,
    altura,
    ...(src ? { crop: { x: src.cropX, y: src.cropY, width: src.cropWidth, height: src.cropHeight } } : {}),
    cornerRadius: camada.style?.border?.radius ?? 0,
    espelho: flipH || flipV ? { x: flipH ? largura : 0, y: flipV ? altura : 0, scaleX: flipH ? -1 : 1, scaleY: flipV ? -1 : 1 } : null,
  }
}

/**
 * Rodada 1 do Codex (27/10): o PNG gravado é o do cliente, e uma foto que ainda não carregou (ou falhou, ou é a da URL
 * anterior) sai como célula VAZIA — com a URL certa e a marca, o servidor aceitaria. Antes do export, toda imagem
 * desenhada (fora de `ocultas`, `visible !== false`) com foto — a trocada pelo assistente ou a da camada — precisa estar
 * pronta NA URL ATUAL (`prontas`: camada → URL cuja foto foi conferida por `dimensoesDaFotoCarregada`). Sem foto
 * (célula vazia de propósito) não espera nada. Devolve as camadas que faltam.
 */
export function fotosPendentes<T extends CamadaMinima & { name?: string }>(
  camadas: T[],
  ocultas: ReadonlySet<string>,
  trocas: Record<string, { url?: string } | undefined>,
  prontas: ReadonlyMap<string, string | null>,
): T[] {
  return camadas.filter((l) => {
    if (!TIPOS_DE_IMAGEM.has(l.type) || ocultas.has(l.id) || l.visible === false) return false
    const src = trocas[l.id]?.url || l.fileUrl || ''
    return src !== '' && prontas.get(l.id) !== src
  })
}
