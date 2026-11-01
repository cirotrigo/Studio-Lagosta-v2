/**
 * F1: o medir-copy mede a peça por REFERÊNCIA como o compor a compõe — sem a pilha da faixa e sem a margem da marca:
 * a partida da manchete é a caixa aprovada do Ciro (y 1618), não a pilha a partir do apoio (y 1637 com gap 0).
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { montarAssinatura } from '../assinatura'
import { compilarReferencia } from '../arquetipos/referencia'
import { prepararArquetipo } from '../arquetipos/na-spec'
import { medirCopy } from '../medir-copy'
import brunch from '../arquetipos/__tests__/suporte/emporio-ref02-brunch.json'

const PAGINA = brunch as unknown as { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const largura = Math.max(...linhas.map((l) => l.length * fontSize * 0.55))
  const height = linhas.length * fontSize * Number(layer.style?.lineHeight ?? 1.1)
  return { height, maxLineWidth: largura, lineCount: linhas.length, linhas: linhas.map((l) => ({ texto: l, largura: l.length * fontSize * 0.55 })) }
}
const texto = (id: string, style: Record<string, unknown>, content = 'x'): Layer => ({ id, name: id, type: 'text', visible: true, locked: false, order: 0, position: { x: 92, y: 100 }, size: { width: 896, height: 100 }, rotation: 0, content, style: { fontFamily: 'Montserrat', fontSize: 40, lineHeight: 1.1, color: '#fff', ...style } } as unknown as Layer)
const assinatura = montarAssinatura({
  pagina: {
    id: 'assinatura',
    name: 'Story base',
    width: 1080,
    height: 1920,
    layers: [
      texto('headline', { fontFamily: 'Montserrat', fontSize: 70, color: '#FFFFFF', lineHeight: 1 }),
      texto('apoio', { fontFamily: 'Montserrat', fontSize: 25, color: '#FFFFFF', lineHeight: 1 }),
    ],
  },
  formatoDaPagina: 'story',
  numerosDoProjeto: null,
  logoDoProjeto: { url: 'https://x/logo.png', razao: 65 / 200 },
})

describe('medir-copy por referência', () => {
  it('a partida da manchete é a caixa aprovada (y 1618), sem pilha: a MESMA do compor', () => {
    const c = compilarReferencia(PAGINA, { pageVersion: 'v', versao: 1 })
    if (!c.ok) throw new Error('não compilou')
    const spec = { projectId: 12, formato: 'story' as const, foto: { driveFileId: 'x' }, arquetipo: { id: c.definicao.id }, blocos: [{ papel: 'headline' as const, linhas: ['Café da manhã'] }, { papel: 'apoio' as const, linhas: ['Sabores da manhã'] }] }
    const arq = prepararArquetipo(spec, { definicoes: [c.definicao] })!
    const m = medirCopy({ assinatura, medir: medirFalso, familias: ['Montserrat'], fonteCarregada: () => true, formato: 'story', spec, arquetipo: arq })
    const pos = m.arquetipo?.posicoes
    expect(pos?.headline?.posicao.y).toBe(1618)
    expect(pos?.apoio?.posicao.y).toBe(1707)
    expect(pos?.logo?.posicao).toMatchObject({ x: 816, y: 160 })
  })
})
