/**
 * Camadas de grade escritas À MÃO para os testes (caixas calculadas nos comentários), sem chamar o algoritmo.
 * Feed 1080×1350, g=10, raio 0:
 * - 2-colunas: colunas de 540 ⇒ [0, 535] · [545, 1080]
 * - 2x2: colunas como acima; linhas de 675 ⇒ [0, 670] · [680, 1350]
 */
import type { Layer } from '@/types/template'

export const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
export const FEED = { x: 0, y: 0, w: 1080, h: 1350 }

export function celula(
  id: string,
  grade: { id: string; layout: string; versao?: number; espacamento?: number; raio?: number; caixa?: typeof FEED },
  indice: number,
  caixa: { x: number; y: number; w: number; h: number },
  extra: Partial<Layer> = {},
): Layer {
  const meta = {
    id: grade.id,
    layout: grade.layout,
    versao: grade.versao ?? 1,
    celula: indice,
    espacamento: grade.espacamento ?? 10,
    raio: grade.raio ?? 0,
    caixa: { ...(grade.caixa ?? FEED) },
  }
  return {
    id,
    type: 'image',
    name: `Grade · foto ${indice + 1}`,
    visible: true,
    locked: false,
    order: indice,
    position: { x: caixa.x, y: caixa.y },
    size: { width: caixa.w, height: caixa.h },
    rotation: 0,
    fileUrl: '',
    style: { objectFit: 'cover', border: { radius: 0 } },
    metadata: { grade: meta, groupId: grade.id },
    ...extra,
  } as Layer
}

export function duasColunas(fotos: [string | undefined, string | undefined] = ['', '']): Layer[] {
  const g = { id: 'g1', layout: '2-colunas' }
  return [
    celula('c0', g, 0, { x: 0, y: 0, w: 535, h: 1350 }, { fileUrl: fotos[0] }),
    celula('c1', g, 1, { x: 545, y: 0, w: 535, h: 1350 }, { fileUrl: fotos[1] }),
  ]
}

export function doisPorDois(fotos: string[]): Layer[] {
  const g = { id: 'g2', layout: '2x2' }
  return [
    celula('d0', g, 0, { x: 0, y: 0, w: 535, h: 670 }, { fileUrl: fotos[0] }),
    celula('d1', g, 1, { x: 545, y: 0, w: 535, h: 670 }, { fileUrl: fotos[1] }),
    celula('d2', g, 2, { x: 0, y: 680, w: 535, h: 670 }, { fileUrl: fotos[2] }),
    celula('d3', g, 3, { x: 545, y: 680, w: 535, h: 670 }, { fileUrl: fotos[3] }),
  ]
}
