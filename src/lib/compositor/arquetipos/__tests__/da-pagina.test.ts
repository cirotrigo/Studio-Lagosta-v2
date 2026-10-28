import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import type { CopyAutoral } from '@/lib/copy-autoral'
import { verArquetipo } from '../catalogo'
import {
  contratoDoLayout,
  fotoDaPaginaParaLayout,
  nomeDaPaginaDoLayout,
  specDoLayout,
  tagsDaPaginaDoLayout,
  textosDaPagina,
} from '../da-pagina'

const topo = verArquetipo('minimal-fb-topo-esquerda')!
const PAGINA = { width: 1080, height: 1920 }

const texto = (id: string, content: string, y: number, extra: Partial<Layer> = {}): Layer =>
  ({
    id,
    name: id,
    type: 'text',
    visible: true,
    content,
    position: { x: 80, y },
    size: { width: 800, height: 100 },
    ...extra,
  }) as Layer
const imagem = (
  id: string,
  fileUrl: string,
  pos: { x: number; y: number },
  size: { width: number; height: number },
  extra: Partial<Layer> = {},
): Layer =>
  ({
    id,
    name: id,
    type: 'image',
    visible: true,
    fileUrl,
    position: pos,
    size,
    ...extra,
  }) as Layer

describe('textosDaPagina (CP-T2)', () => {
  it('lê o papel pela metadata antes do nome e devolve as linhas na ordem da página', () => {
    const camadas = [
      texto('a', 'Seg a sex\n11h às 15h', 1500, { name: 'Rodapé' }),
      texto('b', 'Almoço executivo', 300, {
        name: 'Qualquer',
        metadata: { compositor: { papel: 'headline' } } as Layer['metadata'],
      }),
      texto('c', 'Novidade', 200, { name: 'pre' }),
    ]
    const { porPapel, foraDoLayout } = textosDaPagina(camadas, topo)
    expect(porPapel.get('headline')).toEqual(['Almoço executivo'])
    expect(porPapel.get('pre')).toEqual(['Novidade'])
    expect(porPapel.get('servico')).toEqual(['Seg a sex', '11h às 15h'])
    expect(foraDoLayout).toEqual([])
  })

  it('a segunda voz volta para a manchete, depois dela, mesmo estando acima na página', () => {
    const camadas = [
      texto('h2', 'da casa', 100, { name: 'headline 2' }),
      texto('h', 'Feijoada', 400, { name: 'headline' }),
    ]
    expect(textosDaPagina(camadas, topo).porPapel.get('headline')).toEqual(['Feijoada', 'da casa'])
  })

  it('cta, texto sem papel, oculto e vazio não entram; os dois primeiros voltam DITOS', () => {
    const camadas = [
      texto('h', 'Título', 300, { name: 'headline' }),
      texto('cta', 'Reserve', 1600, { name: 'cta' }),
      texto('solto', 'Desde 1998', 900, { name: 'Texto 3' }),
      texto('oculto', 'x', 950, { name: 'apoio', visible: false }),
      texto('vazio', '   ', 960, { name: 'apoio' }),
    ]
    const { porPapel, foraDoLayout } = textosDaPagina(camadas, topo)
    expect([...porPapel.keys()]).toEqual(['headline'])
    expect(foraDoLayout).toEqual([
      { camada: 'solto', nome: 'Texto 3', motivo: 'sem-papel' },
      {
        camada: 'cta',
        nome: 'cta',
        motivo: 'papel-fora-do-layout',
        papel: 'cta',
      },
    ])
  })

  it('rich-text leva o destaque como [colchetes]', () => {
    const rico = {
      ...texto('h', 'Feijoada completa', 300, { name: 'headline' }),
      type: 'rich-text',
      style: { fill: '#ffffff', fontFamily: 'A', fontSize: 80 },
      richTextStyles: [{ start: 9, end: 17, fill: '#ff6600' }],
    } as unknown as Layer
    expect(textosDaPagina([rico], topo).porPapel.get('headline')).toEqual(['Feijoada [completa]'])
  })
})

describe('fotoDaPaginaParaLayout (CP-T2)', () => {
  it('bg-foto vence qualquer outra imagem', () => {
    const camadas = [
      imagem('grande', 'https/x/grande.jpg', { x: 0, y: 0 }, PAGINA),
      imagem('bg-foto', 'https://x/bg.jpg', { x: 0, y: 0 }, { width: 10, height: 10 }),
    ]
    expect(fotoDaPaginaParaLayout(camadas, PAGINA)).toBe('https://x/bg.jpg')
  })

  it('sem bg-foto: a maior imagem que cobre ≥ 90%; abaixo disso, nenhuma', () => {
    const cobre95 = imagem('a', 'https://x/a.jpg', { x: 0, y: 0 }, { width: 1080, height: 1824 })
    const cobre100 = imagem('b', 'https://x/b.jpg', { x: -50, y: -50 }, { width: 1200, height: 2100 })
    expect(fotoDaPaginaParaLayout([cobre95, cobre100], PAGINA)).toBe('https://x/b.jpg')
    const cobre85 = imagem('c', 'https://x/c.jpg', { x: 0, y: 0 }, { width: 1080, height: 1632 })
    expect(fotoDaPaginaParaLayout([cobre85], PAGINA)).toBeNull()
    expect(fotoDaPaginaParaLayout([{ ...cobre95, visible: false } as Layer], PAGINA)).toBeNull()
    expect(fotoDaPaginaParaLayout([], PAGINA)).toBeNull()
  })
})

describe('specDoLayout (CP-T2)', () => {
  it('blocos na ordem de leitura do arquétipo; obrigatório ausente vira placeholder; opcional ausente some', () => {
    const porPapel = new Map([['apoio', ['Só hoje']] as const])
    const { spec, placeholders } = specDoLayout({
      projectId: 8,
      formato: 'story',
      arquetipo: { id: topo.id, versao: 1 },
      definicao: topo,
      fotoUrl: 'https://x/f.jpg',
      porPapel: porPapel as never,
    })
    expect(placeholders).toEqual(['headline', 'servico'])
    expect(spec).toEqual({
      projectId: 8,
      formato: 'story',
      foto: { url: 'https://x/f.jpg' },
      blocos: [
        { papel: 'headline', linhas: ['Título'] },
        { papel: 'apoio', linhas: ['Só hoje'] },
        { papel: 'servico', linhas: ['Serviço'] },
      ],
      arquetipo: { id: topo.id, versao: 1 },
    })
  })

  it('nome e tags da página', () => {
    expect(nomeDaPaginaDoLayout('Foto inteira', true)).toBe('Layout — Foto inteira (rascunho)')
    expect(nomeDaPaginaDoLayout('Foto inteira', false)).toBe('Layout — Foto inteira')
    expect(tagsDaPaginaDoLayout('minimal-fb-topo-esquerda')).toEqual(['layout', 'arquetipo:minimal-fb-topo-esquerda'])
  })
})

describe('contratoDoLayout (CP-T2, rodada 1)', () => {
  const EM = '2026-10-24T05:00:00.000Z'
  const copy = (blocos: CopyAutoral['blocos']): CopyAutoral => ({
    versao: 'copy-autoral-v1',
    origem: { autor: 'claude' },
    blocos,
    revisoes: [],
  })

  it('nada a recortar: devolve o MESMO contrato, sem revisão', () => {
    const c = copy([
      { id: 'm', funcao: 'headline', ordem: 0, linhas: ['A', 'B'], estilo: { linhasNaVoz2: [1] } },
      { id: 's', funcao: 'servico', ordem: 1, linhas: ['12h'] },
    ])
    const r = contratoDoLayout(c, topo, { em: EM })
    expect(r).toEqual({ ok: true, contrato: c, placeholders: [], removidos: [] })
    expect(r.ok && r.contrato).toBe(c)
  })

  it('cta e livre saem numa revisão do sistema com o que diziam; o bloco vazio obrigatório ganha o placeholder', () => {
    const c = copy([
      { id: 'm', funcao: 'headline', ordem: 0, linhas: [] },
      { id: 's', funcao: 'servico', ordem: 1, linhas: ['12h'] },
      { id: 'c', funcao: 'cta', ordem: 2, linhas: ['Reserve'] },
      { id: 'extra-x', funcao: 'livre', ordem: 3, linhas: ['Desde 1998'] },
    ])
    const r = contratoDoLayout(c, topo, { em: EM })
    if (r.ok === false) throw new Error(r.aviso)
    expect(r.placeholders).toEqual(['headline'])
    expect(r.removidos).toEqual(['c', 'extra-x'])
    expect(r.contrato.origem).toEqual(c.origem)
    expect(r.contrato.blocos).toEqual([
      { id: 'm', funcao: 'headline', ordem: 0, linhas: ['Título'] },
      { id: 's', funcao: 'servico', ordem: 1, linhas: ['12h'] },
    ])
    expect(r.contrato.revisoes).toEqual([
      expect.objectContaining({
        em: EM,
        autor: 'sistema',
        superficie: 'layout',
        removidos: [
          { id: 'c', funcao: 'cta', linhas: ['Reserve'] },
          { id: 'extra-x', funcao: 'livre', linhas: ['Desde 1998'] },
        ],
        motivo: expect.stringContaining('placeholder do sistema'),
      }),
    ])
  })

  it('obrigatório ausente: bloco novo com id livre, no fim da ordem', () => {
    const c = copy([{ id: 'headline', funcao: 'servico', ordem: 0, linhas: ['12h'] }])
    const r = contratoDoLayout(c, topo, { em: EM })
    if (r.ok === false) throw new Error(r.aviso)
    expect(r.contrato.blocos.at(-1)).toEqual({ id: 'headline-2', funcao: 'headline', ordem: 1, linhas: ['Título'] })
  })

  it('cta NO MEIO: os que ficam são renumerados na mesma ordem relativa, e a mudança de ordem é da revisão do sistema', () => {
    const c = copy([
      { id: 'm', funcao: 'headline', ordem: 0, linhas: ['A'] },
      { id: 'c', funcao: 'cta', ordem: 1, linhas: ['Reserve'] },
      { id: 's', funcao: 'servico', ordem: 2, linhas: ['12h'] },
    ])
    const r = contratoDoLayout(c, topo, { em: EM })
    if (r.ok === false) throw new Error(r.aviso)
    expect(r.contrato.blocos.map((b) => [b.id, b.ordem])).toEqual([
      ['m', 0],
      ['s', 1],
    ])
    expect(r.contrato.revisoes[0]).toMatchObject({
      autor: 'sistema',
      campos: { s: ['ordem'] },
      removidos: [{ id: 'c' }],
    })
  })

  it('o leitor recusa (histórico cheio): ok false com o aviso, nada inventado', () => {
    const revisao = { em: EM, autor: 'equipe' as const, motivo: 'x', blocos: ['s'] }
    const c = {
      ...copy([{ id: 's', funcao: 'servico', ordem: 0, linhas: ['12h'] }]),
      revisoes: Array.from({ length: 200 }, () => revisao),
    }
    const r = contratoDoLayout(c, topo, { em: EM })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.aviso).toMatch(/não comportou o recorte do layout/)
  })
})
