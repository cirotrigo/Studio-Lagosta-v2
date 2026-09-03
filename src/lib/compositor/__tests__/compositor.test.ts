/**
 * O contrato PURO do compositor: spec, assinatura lida da página, blocos
 * medidos com uma régua falsa, e o mapa de calma sobre uma foto sintética.
 */
import { describe, it, expect } from 'vitest'

import type { Layer } from '@/types/template'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'

import { validarSpec } from '../spec'
import { estiloDaCamada, montarAssinatura, papelDoNome, papeisQueFaltam, NUMEROS_PADRAO } from '../assinatura'
import { empilhar, montarBloco, vaoEntre } from '../blocos'
import { estimarAssunto, lerMapaSob, mapaDeCalma, pontuarCandidatos } from '../mapa-de-calma'

const texto = (id: string, name: string, style: Record<string, unknown>, content = 'x'): Layer => ({
  id,
  name,
  type: 'text',
  visible: true,
  locked: false,
  order: 0,
  position: { x: 0, y: 0 },
  size: { width: 400, height: 80 },
  content,
  style,
})

describe('spec', () => {
  it('aceita a forma da leva e recusa papel repetido', () => {
    const ok = validarSpec({ projectId: 8, formato: 'story', blocos: [{ papel: 'headline', linhas: ['A', 'B'] }] })
    expect(ok.spec).not.toBeNull()
    const dup = validarSpec({ projectId: 8, formato: 'story', blocos: [{ papel: 'cta', linhas: ['A'] }, { papel: 'cta', linhas: ['B'] }] })
    expect(dup.spec).toBeNull()
    expect(dup.problemas[0]).toMatch(/repetido/)
  })
})

describe('assinatura', () => {
  it('reconhece o papel pelo nome da camada, com e sem acento', () => {
    expect(papelDoNome('Pré-título')).toBe('pre')
    expect(papelDoNome('headline')).toBe('headline')
    expect(papelDoNome('Descrição')).toBe('apoio')
    expect(papelDoNome('CTA')).toBe('cta')
    expect(papelDoNome('Serviço')).toBe('servico')
    expect(papelDoNome('Foto de fundo')).toBeNull()
  })

  it('lê o estilo, o prefixo do CTA e a sombra', () => {
    const e = estiloDaCamada(
      texto('cta', 'cta', { fontFamily: 'YanoneKaffeesatz Bold', fontSize: 32, letterSpacing: 3, textTransform: 'uppercase', color: '#FF6B00' }, '→ Conheça'),
    )
    expect(e?.prefixo).toBe('→ ')
    expect(e?.textTransform).toBe('uppercase')
    expect(e?.letterSpacing).toBe(3)
  })

  it('monta a assinatura da página e mescla os números do projeto', () => {
    const a = montarAssinatura({
      pagina: {
        id: 'p1',
        width: 1080,
        height: 1920,
        background: '#0B0B0B',
        layers: [
          texto('headline', 'headline', { fontFamily: 'Lobster', fontSize: 96, color: '#FF6B00', lineHeight: 0.94 }),
          { ...texto('logo', 'Logo', {}), type: 'logo', fileUrl: 'https://x/logo.png', size: { width: 236, height: 97 } },
        ],
      },
      formatoDaPagina: 'story',
      numerosDoProjeto: { halo: { faixaTexto: [0.2, 0.5] }, geometria: { story: { safeTopo: 200 } } },
    })
    expect(a.papeis.headline?.fontFamily).toBe('Lobster')
    expect(a.logo?.largura).toBe(236)
    expect(a.numeros.halo.faixaTexto).toEqual([0.2, 0.5])
    expect(a.numeros.halo.faixaMarca).toEqual(NUMEROS_PADRAO.halo.faixaMarca)
    expect(a.numeros.geometria.story.safeTopo).toBe(200)
    expect(a.numeros.geometria.story.safeRodape).toBe(224)
    expect(papeisQueFaltam(a, ['headline', 'apoio'])).toEqual(['apoio'])
  })
})

/** Régua falsa: 0,55 × fontSize por caractere, uma linha por \n, altura = linhas × fontSize × lineHeight. */
const medirFalso = (layer: Layer) => {
  const fontSize = Number(layer.style?.fontSize ?? 16)
  const linhas = (layer.content ?? '').split('\n')
  const larguraDaLinha = (l: string) => l.length * fontSize * 0.55
  const box = layer.size.width - 12
  const quebradas = linhas.reduce((n, l) => n + Math.max(1, Math.ceil(larguraDaLinha(l) / box)), 0)
  return {
    height: quebradas * fontSize * Number(layer.style?.lineHeight ?? 1.1),
    maxLineWidth: Math.min(box, Math.max(...linhas.map(larguraDaLinha))),
    lineCount: quebradas,
  }
}

describe('blocos', () => {
  const estilo = { fontFamily: 'Lobster', fontSize: 96, lineHeight: 0.94, letterSpacing: 0, color: '#FF6B00' }

  it('monta o bloco quando as linhas cabem e grava a largura da tinta', () => {
    const r = montarBloco({ papel: 'headline', linhas: ['Foto Nova', 'a Cada Dia'], estilo, escalaDoFormato: 1, colunaUtil: 896, textAlign: 'left', groupId: 'g', corDaMancha: '#0B0B0B', medir: medirFalso })
    expect(r.bloco).not.toBeNull()
    expect(r.bloco!.escala).toBe(1)
    expect(r.bloco!.width).toBeLessThan(896)
    expect(r.bloco!.layer.content).toBe('Foto Nova\na Cada Dia')
    expect(r.bloco!.layer.metadata?.groupId).toBe('g')
  })

  it('encolhe até 80% antes de recusar, e recusa com orçamento', () => {
    const longa = 'Uma linha que não cabe de jeito nenhum na coluna útil'
    const r = montarBloco({ papel: 'headline', linhas: [longa], estilo, escalaDoFormato: 1, colunaUtil: 896, textAlign: 'left', groupId: 'g', corDaMancha: '#0B0B0B', medir: medirFalso })
    expect(r.bloco).toBeNull()
    expect(r.recusa!.orcamento[0].caracteresQueCabem).toBeLessThan(longa.length)
    const quaseCabe = 'Dezoito caracteres'.padEnd(18, 'x') // 18 × 96 × 0,55 = 950 > 896; a 92%: 874 cabe
    const r2 = montarBloco({ papel: 'headline', linhas: [quaseCabe], estilo, escalaDoFormato: 1, colunaUtil: 896, textAlign: 'left', groupId: 'g', corDaMancha: '#0B0B0B', medir: medirFalso })
    expect(r2.bloco).not.toBeNull()
    expect(r2.bloco!.escala).toBeLessThan(1)
    expect(r2.bloco!.escala).toBeGreaterThanOrEqual(0.8)
  })

  it('empilha com o ritmo da casa (headline perto do pré, CTA mais longe)', () => {
    const b = (papel: 'pre' | 'headline' | 'cta', height: number) => ({ papel, layer: texto(papel, papel, {}), width: 300, height, escala: 1, cor: '#fff' })
    const p = empilhar([b('pre', 30), b('headline', 180), b('cta', 34)], 14)
    expect(vaoEntre('pre', 'headline', 14)).toBe(7)
    expect(vaoEntre('headline', 'cta', 14)).toBe(18)
    expect(p.offsets).toEqual([0, 37, 235])
    expect(p.height).toBe(269)
  })
})

/** Foto sintética: metade esquerda lisa e escura, metade direita ruidosa e clara. */
function fotoSintetica(): FotoCinza {
  const width = 60
  const height = 100
  const data = Buffer.alloc(width * height)
  let seed = 7
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < width / 2) data[y * width + x] = 30
      else {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        data[y * width + x] = 150 + (seed % 100)
      }
    }
  }
  return { data, width, height, stride: 1, escala: 60 / 1080, canvas: { width: 1080, height: 1800 } }
}

describe('mapa de calma', () => {
  it('a coluna lisa e escura ganha; a agitada e clara perde ou é descartada como assunto', () => {
    const mapa = mapaDeCalma(fotoSintetica(), 6, 10)
    const esquerda = lerMapaSob(mapa, { x: 0, y: 0, width: 500, height: 900 })
    const direita = lerMapaSob(mapa, { x: 580, y: 0, width: 500, height: 900 })
    expect(esquerda.energia).toBeLessThan(direita.energia)
    expect(esquerda.p98).toBeLessThan(direita.p98)

    const assunto = estimarAssunto(mapa)
    expect(assunto).not.toBeNull()
    expect(assunto!.x).toBeGreaterThanOrEqual(500)

    const pontuados = pontuarCandidatos({
      mapa,
      candidatos: [
        { rect: { x: 92, y: 200, width: 400, height: 500 }, preferencia: 0, rotulo: 'esq' },
        { rect: { x: 600, y: 200, width: 400, height: 500 }, preferencia: 1, rotulo: 'dir' },
      ],
      coresDoTexto: ['#FFFFFF'],
      corDaMancha: '#0B0B0B',
      assunto,
    })
    expect(pontuados[0].rotulo).toBe('esq')
    expect(pontuados[1].descartado).toBe(true)
  })
})

import { escolherVariante } from '../assinatura'

describe('escolherVariante', () => {
  const pag = (name: string, tags: string[] = [], width = 1080, height = 1920) => ({ name, tags, width, height })
  const paginas = [pag('Assinatura — story'), pag('Story clara', ['clara']), pag('Story escura', ['escura']), pag('Assinatura — feed', [], 1080, 1350)]

  it('variante pedida vence, pelo nome ou pela tag', () => {
    expect(escolherVariante(paginas, { formato: 'story', variante: 'escura' }).pagina?.name).toBe('Story escura')
    expect(escolherVariante(paginas, { formato: 'story', variante: 'story clara' }).pagina?.name).toBe('Story clara')
  })

  it('foto clara escolhe a variante clara; escura, a escura', () => {
    expect(escolherVariante(paginas, { formato: 'story', luzDaFoto: 200, chave: 'x' }).pagina?.name).toBe('Story clara')
    expect(escolherVariante(paginas, { formato: 'story', luzDaFoto: 40, chave: 'x' }).pagina?.name).toBe('Story escura')
  })

  it('sem tag nem pedido, o rodízio pela chave varia e é determinístico', () => {
    const neutras = [pag('A'), pag('B'), pag('C')]
    const a = escolherVariante(neutras, { formato: 'story', chave: 'peça-1' }).pagina?.name
    const b = escolherVariante(neutras, { formato: 'story', chave: 'peça-1' }).pagina?.name
    expect(a).toBe(b)
    const nomes = new Set(['peça-1', 'peça-2', 'peça-3', 'peça-4', 'peça-5', 'peça-6'].map((c) => escolherVariante(neutras, { formato: 'story', chave: c }).pagina?.name))
    expect(nomes.size).toBeGreaterThan(1)
  })

  it('feed sem página cai na de story; formato é lido do nome ou do tamanho', () => {
    const r = escolherVariante([pag('Assinatura — story')], { formato: 'feed' })
    expect(r.formatoDaPagina).toBe('story')
    expect(escolherVariante(paginas, { formato: 'feed' }).pagina?.name).toBe('Assinatura — feed')
  })
})
