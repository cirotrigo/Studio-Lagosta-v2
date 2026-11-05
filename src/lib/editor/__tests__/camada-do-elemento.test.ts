/**
 * CP-V2c — o construtor da camada inserida pelo painel de formas e a escolha explícita de cor. Puro, no Node.
 */
import { describe, expect, it } from 'vitest'
import { createDefaultLayer } from '@/contexts/template-editor-context'
import { SHAPES_LIBRARY, type ShapeDefinition } from '@/lib/assets/shapes-library'
import type { DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import { canonicalizeShapeStyleForPersistence } from '@/lib/shape-style'
import { exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { problemasDoVetor } from '@/lib/vetor/validar-camada'
import type { Layer } from '@/types/template'
import { camadaDoElemento, escolhaExplicitaDaCor } from '../camada-do-elemento'

const item = (id: string) => SHAPES_LIBRARY.find((s) => s.id === id) as ShapeDefinition
const CANVAS = { width: 1080, height: 1920 }
/** escuro/texto = fundo #0F2027; destaque = destaque.fill #C0392B; claro = Creme. */
const MARCA: DadosDaMarca = {
  paleta: [
    { name: 'Preto', hexCode: '#1A1A1A' },
    { name: 'Creme', hexCode: '#F5EBDC' },
    { name: 'Laranja', hexCode: '#E8590C' },
  ],
  assinaturaCrua: { fundo: '#0F2027', destaque: { fill: '#C0392B' } },
}
const TEXTO = 'rgba(15, 32, 39, 1)'
const DESTAQUE = 'rgba(192, 57, 43, 1)'
const construir = (d: ShapeDefinition, base: Layer = createDefaultLayer('shape'), canvas = CANVAS, marca = MARCA) =>
  camadaDoElemento(d, { base, canvas, marca })

describe('camadaDoElemento: a camada final, centrada e no tamanho da fórmula de antes', () => {
  it('largura min(360, 33% do canvas), linha com 40 de altura, o resto pela proporção, centrada', () => {
    const geo = (id: string, canvas = CANVAS) => {
      const c = construir(item(id), undefined, canvas)
      return [c.size, c.position]
    }
    expect(geo('spark-4')).toEqual([{ width: 356, height: 356 }, { x: 362, y: 782 }])
    expect(geo('fio-fino')).toEqual([{ width: 356, height: 40 }, { x: 362, y: 940 }])
    expect(geo('colchete')).toEqual([{ width: 356, height: 890 }, { x: 362, y: 515 }])
    expect(geo('onda-suave')).toEqual([{ width: 356, height: 36 }, { x: 362, y: 942 }])
    expect(geo('rectangle', { width: 600, height: 600 })).toEqual([{ width: 198, height: 198 }, { x: 201, y: 201 }])
    expect(geo('rectangle', { width: 0, height: 0 })).toEqual([{ width: 240, height: 240 }, { x: 0, y: 0 }])
  })

  it('a base fica (id, tipo, ordem, visível); o nome é o do item', () => {
    const base = createDefaultLayer('shape')
    const c = construir(item('moldura-fina'), base)
    expect([c.id, c.type, c.order, c.visible, c.locked, c.name]).toEqual([base.id, 'shape', base.order, true, false, 'Moldura fina'])
  })
})

describe('camadaDoElemento: cor pela marca, canonizada, com proveniência', () => {
  it('cada canal sai do papel do slot, já na forma canônica do servidor (rgba), e o canal sem slot fica sem cor', () => {
    const cores = (id: string) => {
      const s = construir(item(id)).style!
      return [s.fill, s.strokeColor ?? null]
    }
    expect(cores('fio-fino')).toEqual([TEXTO, null]) // a line pinta por fill
    expect(cores('moldura-fina')).toEqual(['transparent', TEXTO])
    expect(cores('pilula-contorno')).toEqual(['transparent', TEXTO])
    expect(cores('spark-4')).toEqual([DESTAQUE, null])
    expect(cores('onda-suave')).toEqual(['transparent', DESTAQUE])
    expect(cores('pontos')).toEqual([TEXTO, null])
    // legados (D3): básicas e decorativas → destaque; setas e linhas → texto; um canal só
    expect(cores('circle')).toEqual([DESTAQUE, null])
    expect(cores('heart')).toEqual([DESTAQUE, null])
    expect(cores('arrow')).toEqual([TEXTO, null])
    expect(cores('line-arrow')).toEqual([TEXTO, null])
    for (const d of SHAPES_LIBRARY) {
      const s = construir(d).style!
      expect([d.id, s]).toEqual([d.id, canonicalizeShapeStyleForPersistence(s)]) // nada a canonizar depois
      expect([d.id, s.opacity, s.fillOpacity, s.strokeOpacity]).toEqual([d.id, 1, 1, 1])
    }
  })

  it('vetor.asset e vetor.papeis em todo item; manterProporcao só nos travados (nunca false)', () => {
    for (const d of SHAPES_LIBRARY.filter((x) => !x.partes)) { // o multicor tem partes/cores por slot: multicor.test.ts
      const s = construir(d).style!
      expect([d.id, s.vetor]).toEqual([d.id, { asset: { id: d.id, versao: 1 }, papeis: Object.fromEntries(d.slots!.map((x) => [x.canal, x.papelPadrao])) }])
      expect([d.id, s.manterProporcao]).toEqual([d.id, d.ajuste === 'travado' ? true : undefined])
      expect([d.id, 'manterProporcao' in s]).toEqual([d.id, d.ajuste === 'travado'])
    }
    expect(SHAPES_LIBRARY.filter((d) => construir(d).style!.manterProporcao).map((d) => d.id)).toEqual(['spark-4', 'pontos', 'onda-base'])
  })

  it('pílula com raio de pílula (sem ligar contorno de borda); moldura só contorno; pontas e traço do item', () => {
    const pilula = construir(item('pilula-contorno')).style!
    expect([pilula.shapeType, pilula.border, pilula.strokeWidth]).toEqual(['rounded-rectangle', { width: 0, color: 'transparent', radius: 9999 }, 2])
    expect(SHAPES_LIBRARY.filter((d) => construir(d).style!.border).map((d) => d.id)).toEqual(['pilula-contorno'])
    const moldura = construir(item('moldura-fina')).style!
    expect([moldura.shapeType, moldura.fill, moldura.strokeWidth]).toEqual(['rectangle', 'transparent', 2])
    expect(construir(item('sublinhado-suave')).style!.tracoPontas).toBe('round')
    expect(SHAPES_LIBRARY.filter((d) => construir(d).style!.tracoPontas).map((d) => d.id)).toEqual(['sublinhado-suave'])
    // sem strokeWidth no item, o da base (2), como antes
    expect(construir(item('circle')).style!.strokeWidth).toBe(2)
    expect(construir(item('pontos')).style!.pathData).toBe(item('pontos').pathData)
  })

  it('a vitrine nunca é lida: com cor-sentinela no fill e no strokeColor do item, a camada é a mesma', () => {
    const base = createDefaultLayer('shape')
    for (const d of SHAPES_LIBRARY) {
      const comSentinela = { ...d, fill: '#abcdef', strokeColor: 'rgba(250, 0, 250, 0.5)' }
      const camada = construir(comSentinela, base)
      expect([d.id, camada]).toEqual([d.id, construir(d, base)])
      const texto = JSON.stringify(camada).toLowerCase()
      expect([d.id, /abcdef|171, 205, 239|250, 0, 250/.test(texto)]).toEqual([d.id, false])
    }
  })

  it('marca sem cores: os padrões do resolvedor, nunca a vitrine', () => {
    const vazia: DadosDaMarca = { paleta: [], assinaturaCrua: null }
    expect(construir(item('spark-4'), undefined, CANVAS, vazia).style!.fill).toBe('rgba(17, 17, 17, 1)')
    expect(construir(item('moldura-fina'), undefined, CANVAS, vazia).style!.strokeColor).toBe('rgba(17, 17, 17, 1)')
  })

  it('toda camada construída passa nos validadores das portas (problemasDoVetor e exigirVetoresValidos)', () => {
    const camadas = SHAPES_LIBRARY.map((d) => construir(d))
    for (const c of camadas) expect([c.name, problemasDoVetor(c)]).toEqual([c.name, []])
    expect(() => exigirVetoresValidos(camadas)).not.toThrow()
    expect(() => exigirVetoresValidos(JSON.stringify(camadas))).not.toThrow()
  })

  it('gate da revisão (gate-v4): a proveniência é inerte; retângulo e pílula seguem medidos, svg-path e linha seguem fora', async () => {
    const { limitesDe } = await import('@/lib/creatives/revisao/gate')
    const medidas = new Set(['rectangle', 'rounded-rectangle', 'circle', 'triangle', 'star'])
    for (const d of SHAPES_LIBRARY) {
      const persistida = JSON.parse(JSON.stringify(construir(d))) as Layer // o que o PATCH grava e o gate lê
      const r = limitesDe(persistida)
      expect([d.id, d.shapeType, r.contido]).toEqual([d.id, d.shapeType, medidas.has(d.shapeType)])
      // fora pelo desenho (path ou shapeType), nunca pela proveniência
      if ('motivo' in r) expect([d.id, /vetor/.test(r.motivo), /style\.(pathData|lineStyle|lineStartCap|lineEndCap)|não é descrito pela caixa/.test(r.motivo)]).toEqual([d.id, false, true])
    }
  })

  it('item sem slot é erro de programação, não camada com cor inventada', () => {
    expect(() => construir({ ...item('circle'), slots: [] })).toThrow(/sem slot/)
  })
})

describe('escolhaExplicitaDaCor: escolher a cor de um canal apaga só o papel daquele canal', () => {
  const vetor = { asset: { id: 'x', versao: 1 }, papeis: { preenchimento: 'destaque' as const, contorno: 'texto' as const } }

  it('remove o papel do canal tocado e mantém o do outro e o asset', () => {
    expect(escolhaExplicitaDaCor({ vetor }, 'preenchimento')).toEqual({ vetor: { asset: vetor.asset, papeis: { contorno: 'texto' } } })
    expect(escolhaExplicitaDaCor({ vetor }, 'contorno')).toEqual({ vetor: { asset: vetor.asset, papeis: { preenchimento: 'destaque' } } })
  })

  it('o último papel removido leva a chave papeis junto; o asset fica', () => {
    const r = escolhaExplicitaDaCor({ vetor: { asset: vetor.asset, papeis: { contorno: 'texto' } } }, 'contorno')
    expect(r).toEqual({ vetor: { asset: vetor.asset } })
    expect('papeis' in r.vetor!).toBe(false)
  })

  it('sem vetor, sem papeis ou sem papel naquele canal: nada a gravar', () => {
    expect(escolhaExplicitaDaCor(undefined, 'preenchimento')).toEqual({})
    expect(escolhaExplicitaDaCor({ fill: '#000000' }, 'preenchimento')).toEqual({})
    expect(escolhaExplicitaDaCor({ vetor: { asset: vetor.asset } }, 'contorno')).toEqual({})
    expect(escolhaExplicitaDaCor({ vetor: { asset: vetor.asset, papeis: { contorno: 'texto' } } }, 'preenchimento')).toEqual({})
  })

  it('não muda o estilo recebido', () => {
    const style = { vetor: { asset: { ...vetor.asset }, papeis: { ...vetor.papeis } } }
    const antes = JSON.stringify(style)
    escolhaExplicitaDaCor(style, 'preenchimento')
    expect(JSON.stringify(style)).toBe(antes)
  })

  // CP-V4: a escrita mora em `useCoresDaForma`, usado pelo painel E pela toolbar da forma
  it('no painel e na toolbar: campo, seletor nativo e swatch dos dois canais passam pelo helper; as transparências não', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const fonte = readFileSync(join(process.cwd(), 'src/components/templates/properties-panel.tsx'), 'utf8')
    const trecho = (de: string, ate: string) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de)))
    const sliders = (codigo: string) => codigo.split('type="range"').slice(1).map((t) => t.slice(0, t.indexOf('/>\n')))
    // o hook: o elo sai só na escrita EXPLÍCITA (escolher/digitar), nunca na transparência
    const hook = trecho('export function useCoresDaForma(', '\nfunction ShapeControls(')
    expect(hook.match(/escolhaExplicitaDaCor\(/g)).toHaveLength(1)
    expect(hook).toContain('const elo = explicita ? escolhaExplicitaDaCor(layer.style, canal) : {}')
    expect(hook).toMatch(/const escolher = [^\n]*, true\)\n/)
    expect(hook).toContain('if (cor) gravar(canal, cor, true)')
    expect(hook).toMatch(/const transparencia = [\s\S]*?, false\)\n/)
    // o painel: swatch + seletor por `escolher`, campo por `digitar`, nos dois canais; sliders só `transparencia`
    const controles = trecho('function ShapeControls(', '\nconst ehObjetoDeEstilo')
    for (const canal of ['preenchimento', 'contorno']) {
      expect(controles.split(`escolher('${canal}'`).length - 1).toBe(2)
      expect(controles.split(`digitar('${canal}'`).length - 1).toBe(1)
    }
    expect(controles).not.toContain('escolhaExplicitaDaCor')
    expect(sliders(controles)).toHaveLength(2)
    for (const s of sliders(controles)) expect(s).toMatch(/transparencia\('(preenchimento|contorno)'/)
    // a toolbar: nenhuma escrita de cor própria — só o hook
    const barra = readFileSync(join(process.cwd(), 'src/components/templates/shape-toolbar.tsx'), 'utf8')
    expect(barra).not.toMatch(/escolhaExplicitaDaCor|applyOpacityToEditableColor|corDigitadaParaGravar/)
    expect(barra).toContain('onSelect={(hex) => cores.escolher(c, hex)}')
    expect(barra).toContain('aoGravar={(texto) => cores.digitar(c, texto)}')
    expect(barra).toContain('onChange={(event) => cores.escolher(c, event.target.value)}')
    expect(sliders(barra)[0]).toContain('cores.transparencia(c,')
  })
})
