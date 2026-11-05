/**
 * CP-V5 — vetor multicor no Node: contrato e validação central, opacidade (uma vez), desenho único servidor × editor no
 * MESMO canvas (@napi-rs/canvas + Konva real, `suporte/konva-no-node.ts`), hit da caixa, cache/blur do servidor,
 * catálogo e inserção, cores por slot e gate.
 *
 * Como no CP-V0, a paridade aqui prova a lógica e os dois adaptadores NESTE rasterizador; o Konva do navegador é o
 * harness `cp-v5/harness` (outro rasterizador, palco real).
 */
import { describe, expect, it } from 'vitest'
import { HitCanvas } from 'konva/lib/Canvas'
import { Shape } from 'konva/lib/Shape'
import { createDefaultLayer } from '@/contexts/template-editor-context'
import { SHAPES_LIBRARY, type ShapeDefinition } from '@/lib/assets/shapes-library'
import type { DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import { camadaDoElemento, escolhaExplicitaDaCor } from '@/lib/editor/camada-do-elemento'
import {
  chavesDaForma,
  coresNestaPagina,
  podeReaplicar,
  reaplicarNaCamada,
  rotuloDoCanal,
  estiloComCorDoSlot,
  valorDaChave,
} from '@/lib/editor/cores-da-forma'
import { canonicalizeShapeStyleForPersistence, estiloComOpacidadeDaForma, opacidadeDaForma } from '@/lib/shape-style'
import { mesclarCamadasDoDesktop } from '@/lib/templates/guarda-do-push-do-desktop'
import type { Layer, LayerStyle } from '@/types/template'
import { pinturaDoSvgPath, shapeKonvaDoSvgPath } from '../desenhar'
import { lerCor } from '../cor'
import { MAX_COMANDOS_DAS_PARTES, partesParaPintar } from '../partes'
import { exigirVetoresValidos } from '../guarda-de-porta'
import { problemasDoVetor } from '../validar-camada'
import { AMOSTRAS_MC, CAIXA_MC, CANVAS_MC, CORES_MC, D_ANEL, D_FAIXA, FUNDO_DA_TELA, VIEWBOX_MC, camadaMulticor, estiloMulticor, noCanvas } from './suporte/multicor'
import { comparar, pixelsDoKonva, pixelsDoNoKonva, pixelsDoServidor, type Pixels } from './suporte/konva-no-node'
import { applyStackBlur } from '@/lib/konva/filters/apply'
import { escalaDoBlur, folgaDoBlur } from '@/lib/creatives/halo/fundo-de-texto'
import { alvoDaChave } from '@/lib/editor/cores-da-forma'
import { FiltroBlurDoMulticor, borrarPreMultiplicado } from '../blur-do-multicor'

const codigos = (c: unknown) => problemasDoVetor(c).map((p) => p.codigo)
const comVetor = (vetor: Record<string, unknown>) => camadaMulticor({ vetor: vetor as never })
const vetorBase = () => estiloMulticor().vetor!

// ── pixels ────────────────────────────────────────────────────────────────

/** O editor como o ShapeNode monta: nó com a opacidade da camada, pintura do adaptador único. */
function editor(layer: Layer): Pixels {
  const s = layer.style!
  return pixelsDoKonva(CANVAS_MC.largura, CANVAS_MC.altura, FUNDO_DA_TELA, {
    x: layer.position.x,
    y: layer.position.y,
    width: layer.size.width,
    height: layer.size.height,
    opacity: s.opacity ?? 1,
    ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, stroke: s.strokeColor, strokeWidth: s.strokeWidth ?? 0 })),
  })
}
const servidor = (layer: Layer) => pixelsDoServidor(CANVAS_MC.largura, CANVAS_MC.altura, FUNDO_DA_TELA, [layer])

function rgba(p: Pixels, x: number, y: number): [number, number, number, number] {
  const i = (Math.round(y) * p.largura + Math.round(x)) * 4
  return [p.dados[i], p.dados[i + 1], p.dados[i + 2], p.dados[i + 3]]
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
/** Mistura `cor` (alfa a) sobre `base`. */
const sobre = (cor: number[], a: number, base: number[]) => cor.map((c, i) => c * a + base[i] * (1 - a))
const BRANCO = [255, 255, 255]
const NAVY = hex('#1e3a8a')
const LARANJA = hex('#f97316')
const VERDE = hex('#10b981')

function esperado(op: number) {
  const faixa = sobre(NAVY, op, BRANCO)
  return {
    faixa,
    // opacidade de GRUPO (rodada 1): o anel compõe sobre a faixa a alfa 1, e o grupo vai à página com `op` uma vez
    anelSobreFaixa: sobre(sobre(LARANJA, 0.6, NAVY), op, BRANCO),
    furoSobreFaixa: faixa,
    anelSobreBranco: sobre(LARANJA, 0.6 * op, BRANCO),
    traco: sobre(VERDE, op, BRANCO),
    vazioDoMeio: BRANCO,
  }
}

function conferirAmostras(p: Pixels, op: number, espelhoH = false) {
  const e = esperado(op)
  for (const [nome, [vx, vy]] of Object.entries(AMOSTRAS_MC)) {
    const { x, y } = noCanvas(vx, vy, espelhoH)
    const [r, g, b] = rgba(p, x, y)
    const alvo = e[nome as keyof typeof e]
    const delta = Math.max(Math.abs(r - alvo[0]), Math.abs(g - alvo[1]), Math.abs(b - alvo[2]))
    expect([nome, delta <= 2], `${nome}: [${r},${g},${b}] × [${alvo.map(Math.round)}]`).toEqual([nome, true])
  }
  // meet: a sobra lateral da caixa fica vazia (com "esticar" a faixa a pintaria)
  expect(rgba(p, CAIXA_MC.x + 20, CAIXA_MC.y + 90).slice(0, 3)).toEqual(BRANCO)
}

describe('CP-V5 — desenho único do multicor: servidor = editor, amostra por slot', () => {
  it('opacidade 1: cada slot na sua cor, ordem (frente por cima), evenodd, contorno e meet', async () => {
    const layer = camadaMulticor()
    const [s, e] = [await servidor(layer), editor(layer)]
    expect(comparar(s, e).diferentes).toBe(0)
    conferirAmostras(s, 1)
  })

  it('opacidade da camada 50%: aplicada UMA vez nos dois lados, o alfa próprio do anel continua 60%', async () => {
    const layer = camadaMulticor({ opacity: 0.5 })
    const [s, e] = [await servidor(layer), editor(layer)]
    expect(comparar(s, e).diferentes).toBe(0)
    conferirAmostras(s, 0.5)
  })

  it('espelho horizontal: reflete dentro da caixa, sem escala negativa do nó', async () => {
    const layer = camadaMulticor({ flipH: true })
    const [s, e] = [await servidor(layer), editor(layer)]
    expect(comparar(s, e).diferentes).toBe(0)
    conferirAmostras(s, 1, true)
  })

  it('nonzero no anel enche o furo (controle negativo do evenodd)', async () => {
    const v = vetorBase()
    const layer = comVetor({ ...v, partes: v.partes!.map((p) => (p.slot === 'anel' ? { ...p, fillRule: 'nonzero' } : p)) })
    const s = await servidor(layer)
    const { x, y } = noCanvas(...(AMOSTRAS_MC.furoSobreFaixa as unknown as [number, number]))
    const alvo = sobre(LARANJA, 0.6, sobre(NAVY, 1, BRANCO))
    expect(rgba(s, x, y).slice(0, 3).every((c, i) => Math.abs(c - alvo[i]) <= 2)).toBe(true)
  })

  it('fallback: partes inválidas ou slot sem cor → só a silhueta (pathData + fill), esticada como o leitor antigo', async () => {
    const v = vetorBase()
    for (const vetor of [{ ...v, cores: { fundo: v.cores!.fundo, anel: v.cores!.anel } }, { ...v, partes: [{ d: D_ANEL, slot: 'anel', alvo: 'xx' }] }]) {
      const layer = comVetor(vetor)
      expect(partesParaPintar(layer.style!.vetor)).toBeNull()
      const [s, e] = [await servidor(layer), editor(layer)]
      expect(comparar(s, e).diferentes).toBe(0)
      // esticado: a faixa cobre a caixa inteira, inclusive a sobra lateral; anel e traço não aparecem
      expect(rgba(s, CAIXA_MC.x + 20, CAIXA_MC.y + 90).slice(0, 3)).toEqual(NAVY)
      const { x, y } = noCanvas(...(AMOSTRAS_MC.traco as unknown as [number, number]))
      expect(rgba(s, x, y).slice(0, 3)).toEqual(BRANCO)
    }
  })

  it('monocolor intocado: sem partes o adaptador não ganha hitFunc nem meet', () => {
    const legado = pinturaDoSvgPath({}, { fill: '#000', strokeWidth: 0 })
    expect(legado.partes).toBeUndefined()
    const cfg = shapeKonvaDoSvgPath(D_FAIXA, VIEWBOX_MC, legado)
    expect('hitFunc' in cfg).toBe(false)
  })

  it('blur do servidor (offscreen → renderShape): recolorir um slot muda a arte borrada', async () => {
    const blur = { blur: { enabled: true, blurRadius: 4 } }
    const a = { ...camadaMulticor(), effects: blur } as Layer
    const v = vetorBase()
    const b = { ...comVetor({ ...v, cores: { ...v.cores, anel: '#000000' } }), effects: blur } as Layer
    const [pa, pb] = [await servidor(a), await servidor(b)]
    expect(comparar(pa, pb).diferentes).toBeGreaterThan(500)
  })
})

describe('CP-V5 — hit da caixa no editor', () => {
  it('hitFunc pinta SÓ o retângulo da caixa com o colorKey do nó (as cores das partes nunca vão ao hit)', () => {
    const s = estiloMulticor()
    const shape = new Shape({ width: 300, height: 100, ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, strokeWidth: 6 })) })
    const hit = new HitCanvas({ width: 300, height: 100, pixelRatio: 1 })
    shape.hitFunc()!(hit.getContext() as never, shape)
    const dados = hit.getContext().getImageData(0, 0, 300, 100).data
    const chave = hex(shape.colorKey)
    const cores = new Set<string>()
    for (let i = 0; i < dados.length; i += 4) cores.add(`${dados[i]},${dados[i + 1]},${dados[i + 2]},${dados[i + 3]}`)
    expect([...cores]).toEqual([`${chave.join(',')},255`])
  })
})

describe('CP-V5 — validação central do multicor (portas, compositor, reverter)', () => {
  it('a fixture e o legado sem partes passam; a guarda das portas aceita', () => {
    expect(codigos(camadaMulticor())).toEqual([])
    expect(codigos({ ...camadaMulticor(), style: { shapeType: 'svg-path', pathData: D_FAIXA, fill: '#000' } })).toEqual([])
    expect(() => exigirVetoresValidos([camadaMulticor()])).not.toThrow()
  })

  it.each([
    ['slot ausente', (v: ReturnType<typeof vetorBase>) => ({ ...v, partes: [{ d: D_FAIXA, alvo: 'fill' }] }), ['PARTE_SLOT_INVALIDO', 'COR_SEM_PARTE:fundo', 'COR_SEM_PARTE:anel', 'COR_SEM_PARTE:traco']],
    ['slot com espaço', (v: ReturnType<typeof vetorBase>) => ({ ...v, partes: [{ d: D_FAIXA, slot: 'a b', alvo: 'fill' }], cores: {} }), ['PARTE_SLOT_INVALIDO']],
    ['alvo inválido', (v: ReturnType<typeof vetorBase>) => ({ ...v, partes: [{ ...v.partes![0], alvo: 'contorno' }], cores: { fundo: '#000' } }), ['PARTE_ALVO_INVALIDO']],
    ['cores ausentes', (v: ReturnType<typeof vetorBase>) => ({ ...v, cores: undefined }), ['CORES_AUSENTES']],
    ['slot sem cor', (v: ReturnType<typeof vetorBase>) => ({ ...v, cores: { fundo: '#000', anel: '#000' } }), ['COR_DO_SLOT_AUSENTE:traco']],
    ['cor ilegível', (v: ReturnType<typeof vetorBase>) => ({ ...v, cores: { ...v.cores, anel: 'url(#x)' } }), ['COR_INVALIDA:vetor.cores.anel']],
    ['cor sem parte', (v: ReturnType<typeof vetorBase>) => ({ ...v, cores: { ...v.cores, sobra: '#000' } }), ['COR_SEM_PARTE:sobra']],
    ['cores sem partes', (v: ReturnType<typeof vetorBase>) => ({ asset: v.asset, cores: { a: '#000' } }), ['CORES_SEM_PARTES']],
    ['5 slots', (v: ReturnType<typeof vetorBase>) => ({ ...v, partes: ['a', 'b', 'c', 'd', 'e'].map((slot) => ({ d: D_FAIXA, slot, alvo: 'fill' })), cores: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((k) => [k, '#000'])) }), ['SLOTS_DEMAIS']],
  ])('%s → recusado', (_nome, mudar, esperados) => {
    expect(codigos(comVetor(mudar(vetorBase()) as Record<string, unknown>))).toEqual(esperados)
  })

  it('orçamento agregado: soma de comandos acima de 400 e soma de d acima de 16 KB', () => {
    const longo = (n: number) => `M0 0 ${Array.from({ length: n }, (_, i) => `L${i % 100} ${(i * 7) % 100}`).join(' ')} Z`
    const partes = Array.from({ length: 4 }, () => ({ d: longo(MAX_COMANDOS_DAS_PARTES / 4), slot: 'a', alvo: 'fill' }))
    expect(codigos(comVetor({ ...vetorBase(), partes, cores: { a: '#000' } }))).toEqual(['PARTES_COMPLEXAS_DEMAIS'])
    // 6 × 62 comandos = 372 (dentro do teto de comandos), mas ~2,8 KB cada: a soma passa de 16 KB
    const grande = `M0 0 ${Array.from({ length: 60 }, () => `L1.${'1'.repeat(40)} 1`).join(' ')} Z`
    const pesadas = Array.from({ length: 6 }, () => ({ d: grande, slot: 'a', alvo: 'fill' }))
    expect(codigos(comVetor({ ...vetorBase(), partes: pesadas, cores: { a: '#000' } }))).toEqual(['PARTES_GRANDES_DEMAIS'])
  })
})

describe('CP-V5 — opacidade: a canonização preserva a da camada no multicor, o legado continua igual', () => {
  it('multicor: opacity fica, fillOpacity dobra só na silhueta, vetor.cores intacto, idempotente', () => {
    const s = canonicalizeShapeStyleForPersistence(estiloMulticor({ opacity: 0.5, fillOpacity: 0.5 }))!
    expect(s.opacity).toBe(0.5)
    expect(s.fillOpacity).toBe(1)
    expect(s.fill).toBe('rgba(30, 58, 138, 0.5)')
    expect(s.vetor!.cores).toEqual(CORES_MC)
    expect(canonicalizeShapeStyleForPersistence(s)).toEqual(s)
  })

  it('legado: opacity continua dobrada no alfa e zerada para 1', () => {
    const s = canonicalizeShapeStyleForPersistence({ shapeType: 'svg-path', pathData: D_FAIXA, fill: '#1e3a8a', opacity: 0.5 })!
    expect([s.opacity, s.fill]).toEqual([1, 'rgba(30, 58, 138, 0.5)'])
  })

  it('helpers V4: o multicor lê e grava style.opacity (absoluta), sem tocar cor de slot nem "maior alfa"', () => {
    const s = estiloMulticor({ opacity: 0.4 })
    expect(opacidadeDaForma(s)).toBe(0.4)
    expect(estiloComOpacidadeDaForma(s, 0.7)).toEqual({ opacity: 0.7 })
    expect(opacidadeDaForma({ fill: 'rgba(0,0,0,0.4)', opacity: 1 })).toBe(0.4) // legado: o alfa embutido
  })
})

describe('CP-V5 — cores por slot (o hook único do painel e da toolbar escreve por aqui)', () => {
  const MARCA: DadosDaMarca = {
    paleta: [{ name: 'Preto', hexCode: '#1A1A1A' }, { name: 'Creme', hexCode: '#F5EBDC' }],
    assinaturaCrua: { fundo: '#0F2027', destaque: { fill: '#C0392B' } },
  }

  it('chaves na ordem das partes; legado com os dois canais', () => {
    expect(chavesDaForma(estiloMulticor())).toEqual(['fundo', 'anel', 'traco'])
    expect(chavesDaForma({ fill: '#000' })).toEqual(['preenchimento', 'contorno'])
    expect(valorDaChave(estiloMulticor(), 'anel')).toBe(CORES_MC.anel)
  })

  it('gravar um slot muda só ele; o slot da silhueta grava também style.fill', () => {
    const s = estiloMulticor()
    expect(estiloComCorDoSlot(s, 'anel', '#000000')).toEqual({ vetor: { ...s.vetor, cores: { ...CORES_MC, anel: '#000000' } } })
    expect(estiloComCorDoSlot(s, 'fundo', '#ff0000')).toEqual({ vetor: { ...s.vetor, cores: { ...CORES_MC, fundo: '#ff0000' } }, fill: '#ff0000' })
  })

  it('escolha manual rompe só o elo do slot escolhido', () => {
    const elo = escolhaExplicitaDaCor(estiloMulticor(), 'anel')
    expect(elo.vetor!.papeis).toEqual({ fundo: 'escuro', traco: 'texto' })
  })

  it('Reaplicar por slot: cor da marca com o alfa da cor; sem mudança devolve a própria camada', () => {
    const layer = camadaMulticor()
    expect(podeReaplicar(layer.style)).toBe(true)
    const r = reaplicarNaCamada(layer, MARCA)
    expect(r.style!.vetor!.cores).toEqual({ fundo: 'rgba(15, 32, 39, 1)', anel: 'rgba(192, 57, 43, 0.6)', traco: 'rgba(15, 32, 39, 1)' })
    expect(r.style!.fill).toBe('rgba(15, 32, 39, 1)')
    expect(r.style!.opacity).toBe(1)
    expect(reaplicarNaCamada(r, MARCA)).toBe(r)
  })

  it('"Nesta página" lê as cores dos slots', () => {
    const nesta = coresNestaPagina({ layers: [camadaMulticor()], canvas: { width: 1, height: 1, backgroundColor: '#ffffff' } } as never, [])
    expect(nesta).toEqual(expect.arrayContaining(['#1e3a8a', '#f97316', '#10b981']))
  })
})

describe('CP-V5 — catálogo e inserção da onda-base', () => {
  const onda = SHAPES_LIBRARY.find((s) => s.id === 'onda-base') as ShapeDefinition
  const MARCA: DadosDaMarca = {
    paleta: [{ name: 'Preto', hexCode: '#1A1A1A' }, { name: 'Creme', hexCode: '#F5EBDC' }, { name: 'Laranja', hexCode: '#E8590C' }],
    assinaturaCrua: { fundo: '#0F2027', destaque: { fill: '#C0392B' } },
  }

  it('todo item multicor do catálogo: ≤ 4 slots com id, ≤ 8 partes, partes e slots casam, silhueta = 1ª parte', () => {
    const multi = SHAPES_LIBRARY.filter((s) => s.partes?.length)
    expect(multi.map((s) => s.id)).toEqual(['onda-base'])
    for (const s of multi) {
      const ids = s.slots!.map((x) => x.id)
      expect(ids.every(Boolean) && ids.length <= 4 && s.partes!.length <= 8).toBe(true)
      expect(new Set(s.partes!.map((p) => p.slot))).toEqual(new Set(ids))
      expect(s.pathData).toBe(s.partes![0].d)
    }
  })

  it('a camada inserida copia partes, resolve cada slot pelo papel (nunca a vitrine) e passa nas portas', () => {
    const c = camadaDoElemento(onda, { base: createDefaultLayer('shape'), canvas: { width: 1080, height: 1920 }, marca: MARCA })
    const v = c.style!.vetor!
    expect(v.partes).toEqual(onda.partes)
    expect(v.partes).not.toBe(onda.partes)
    expect(v.papeis).toEqual({ fundo: 'escuro', meio: 'destaque', frente: 'claro' })
    expect(Object.values(v.cores!)).not.toContain(onda.fill)
    expect(v.cores!.meio).toBe('#C0392B'.toLowerCase())
    // a silhueta sai pela canonização (rgba) e o slot guarda o hex do resolvedor: a MESMA cor pelo leitor único
    expect(lerCor(c.style!.fill)).toEqual(lerCor(v.cores!.fundo))
    expect([c.style!.pathViewBox, c.style!.manterProporcao, c.size]).toEqual([[0, 0, 400, 100], true, { width: 356, height: 89 }])
    expect(problemasDoVetor(c)).toEqual([])
    expect(rotuloDoCanal(c, 'meio')).toBe('Onda do meio')
  })
})

describe('CP-V5 — gate e identidade', () => {
  it('gate-v4 sem mudança: multicor fora da medida pelo style.pathData, nunca pela proveniência', async () => {
    const { limitesDe } = await import('@/lib/creatives/revisao/gate')
    const r = limitesDe(JSON.parse(JSON.stringify(camadaMulticor())) as Layer)
    expect(r.contido).toBe(false)
    if ('motivo' in r) expect(/style\.pathData/.test(r.motivo) && !/vetor/.test(r.motivo)).toBe(true)
  })

  it('identidade do push do desktop protege partes e cores (vetor entra inteiro)', () => {
    const banco = camadaMulticor()
    const v = vetorBase()
    for (const vetor of [{ ...v, cores: { ...v.cores, anel: '#000000' } }, { ...v, partes: v.partes!.slice(0, 2), cores: { fundo: '#000', anel: '#000' } }]) {
      const desktop = { ...banco, style: { ...banco.style, vetor } as LayerStyle }
      // o desktop não desenha svg-path: o vetor (partes e cores inteiros) da camada protegida vem sempre da base
      const camadas = JSON.parse(mesclarCamadasDoDesktop(JSON.stringify([banco]), JSON.stringify([desktop]), { paginaId: 'p', casadaPorFallback: false })) as Layer[]
      expect(camadas[0].style!.vetor).toEqual(banco.style!.vetor)
    }
  })
})

// ── rodada 1 (revisão Codex): espessura no slot compartilhado, cor sob blur e opacidade de grupo ───────────────────

/** O editor COM blur, como o ShapeNode monta: cache com folga e pixelRatio 1/k, o filtro do multicor e o raio no buffer. */
function editorComBlur(layer: Layer, raio: number, fundo = FUNDO_DA_TELA): Pixels {
  const s = layer.style!
  const e = escalaDoBlur(raio)
  return pixelsDoNoKonva(CANVAS_MC.largura, CANVAS_MC.altura, fundo, () => {
    const no = new Shape({
      x: layer.position.x, y: layer.position.y, width: layer.size.width, height: layer.size.height, opacity: s.opacity ?? 1,
      filters: [FiltroBlurDoMulticor], blurRadius: e.raioNoBuffer,
      ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, stroke: s.strokeColor, strokeWidth: s.strokeWidth ?? 0 })),
    })
    no.cache({ offset: folgaDoBlur(raio), pixelRatio: 1 / e.k })
    return no
  })
}
const servidorEm = (layer: Layer, fundo: string) => pixelsDoServidor(CANVAS_MC.largura, CANVAS_MC.altura, fundo, [layer])
const comBlur = (layer: Layer, raio: number) => ({ ...layer, effects: { blur: { enabled: true, blurRadius: raio } } }) as Layer
const D_QUADRO = 'M0 0 L200 0 L200 100 L0 100 Z'
const D_QUADRO_MENOR = 'M50 20 L150 20 L150 80 L50 80 Z'
/** Duas partes OPACAS sobrepostas (navy atrás, verde na frente) e um quadro laranja a 60% inteiro. */
const sobrepostas = (extra: Partial<LayerStyle> = {}) => camadaMulticor({ ...extra, pathData: D_QUADRO, vetor: { asset: { id: 'sobrepostas', versao: 1 }, partes: [{ d: D_QUADRO, slot: 'tras', alvo: 'fill' }, { d: D_QUADRO_MENOR, slot: 'frente', alvo: 'fill' }], cores: { tras: '#1e3a8a', frente: '#10b981' } } })
const semitransparente = (extra: Partial<LayerStyle> = {}) => camadaMulticor({ ...extra, pathData: D_QUADRO, vetor: { asset: { id: 'semi', versao: 1 }, partes: [{ d: D_QUADRO, slot: 'a', alvo: 'fill' }], cores: { a: 'rgba(249, 115, 22, 0.6)' } } })
const delta = (a: number[], b: number[]) => Math.max(...a.map((c, i) => Math.abs(c - b[i])))

describe('CP-V5 rodada 1 — P2-1: slot que pinta preenchimento E contorno mostra Espessura', () => {
  const compartilhado = () => {
    const v = vetorBase()
    return comVetor({ ...v, partes: v.partes!.map((p) => (p.slot === 'traco' ? { ...p, slot: 'fundo' } : p)), cores: { fundo: v.cores!.fundo, anel: v.cores!.anel } })
  }
  it('camada válida; a chave conta como contorno por QUALQUER parte stroke (o 1º uso é fill)', () => {
    const c = compartilhado()
    expect(problemasDoVetor(c)).toEqual([])
    expect(c.style!.vetor!.partes![0]).toMatchObject({ slot: 'fundo', alvo: 'fill' })
    expect(alvoDaChave(c.style, 'fundo')).toBe('stroke')
    expect(alvoDaChave(c.style, 'anel')).toBe('fill')
  })
  it('a espessura muda a pintura do contorno do slot compartilhado', async () => {
    const fino = compartilhado()
    const grosso = { ...fino, style: { ...fino.style!, strokeWidth: 20 } } as Layer
    const { x, y } = noCanvas(100, 18) // 8 px abaixo do fio (y = 10): o de 6 px não alcança, o de 20 px sim
    expect(rgba(await servidor(fino), x, y).slice(0, 3)).toEqual(BRANCO)
    expect(rgba(await servidor(grosso), x, y).slice(0, 3)).toEqual(NAVY)
  })
})

describe('CP-V5 rodada 1 — P2-2: blur preserva a cor semitransparente', () => {
  it('primitiva: um patch uniforme rgba(249,115,22,0.6) continua laranja a 60% (o stack blur cru satura — controle)', () => {
    const w = 40, h = 40
    const patch = () => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) d.set([249, 115, 22, 153], i); return d }
    const certo = patch(), cru = patch()
    borrarPreMultiplicado(certo, w, h, 6)
    applyStackBlur(cru, w, h, 6)
    const meio = (20 * w + 20) * 4
    expect(delta([...certo.slice(meio, meio + 4)], [249, 115, 22, 153])).toBeLessThanOrEqual(2)
    expect(delta([...cru.slice(meio, meio + 3)], [249, 115, 22])).toBeGreaterThan(50)
  })

  it.each([['claro', '#ffffff', [255, 255, 255]], ['escuro', '#111111', [17, 17, 17]]] as const)(
    'fundo %s: interior ≈ laranja a 60% e borda na reta fundo→laranja (sem saturar), servidor e editor',
    async (_n, fundo, base) => {
      const layer = comBlur(semitransparente(), 6)
      for (const p of [await servidorEm(layer, fundo), editorComBlur(layer, 6, fundo)]) {
        const centro = noCanvas(100, 50)
        expect(delta(rgba(p, centro.x, centro.y).slice(0, 3), sobre(LARANJA, 0.6, [...base]))).toBeLessThanOrEqual(3)
        // na borda esquerda do quadro (x = 0 do viewBox) o alfa cai; a cor tem de estar na reta entre o fundo e o laranja
        const borda = noCanvas(0, 50)
        const px = rgba(p, borda.x, borda.y).slice(0, 3)
        const t = (px[1] - base[1]) / (LARANJA[1] - base[1])
        expect(t).toBeGreaterThan(0.05)
        expect(t).toBeLessThan(0.6)
        expect(delta(px, sobre(LARANJA, t, [...base]))).toBeLessThanOrEqual(4)
      }
    },
  )

  it('servidor × editor com blur, mesma camada: diferença pequena e medida (implementações de offscreen/cache diferentes)', async () => {
    const layer = comBlur(camadaMulticor(), 6)
    const c = comparar(await servidor(layer), editorComBlur(layer, 6))
    expect(c.maxDelta).toBeLessThanOrEqual(6)
  })
})

describe('CP-V5 rodada 1 — P2-3: opacidade da camada é de GRUPO, com e sem blur, nos dois lados', () => {
  const VERDE_A_50 = sobre(VERDE, 0.5, BRANCO)
  const PER_PINTURA = sobre(VERDE, 0.5, sobre(NAVY, 0.5, BRANCO))
  it('interior das duas partes opacas a 50%: a de trás não aparece — sem blur e com blur, servidor e editor', async () => {
    const semBlur = sobrepostas({ opacity: 0.5 })
    const blur = comBlur(semBlur, 2)
    const { x, y } = noCanvas(100, 50) // centro, a 30 px de qualquer borda
    const casos = {
      servidorSemBlur: await servidor(semBlur),
      editorSemBlur: editor(semBlur),
      servidorComBlur: await servidor(blur),
      editorComBlur: editorComBlur(blur, 2),
    }
    for (const [nome, p] of Object.entries(casos)) {
      const px = rgba(p, x, y).slice(0, 3)
      expect([nome, delta(px, VERDE_A_50) <= 2], `${nome}: [${px}] × grupo [${VERDE_A_50.map(Math.round)}], per-pintura seria [${PER_PINTURA.map(Math.round)}]`).toEqual([nome, true])
    }
    expect(comparar(casos.servidorSemBlur, casos.editorSemBlur).diferentes).toBe(0)
  })

  it('alfa próprio do slot preservado dentro do grupo, e opacidade 1 pinta direto (sem canvas auxiliar)', async () => {
    const v = sobrepostas().style!.vetor!
    const meio = comVetor({ ...v, cores: { ...v.cores, frente: 'rgba(16, 185, 129, 0.5)' } })
    const comOp = { ...meio, style: { ...meio.style!, opacity: 0.5 } } as Layer
    const { x, y } = noCanvas(100, 50)
    const grupo = sobre(VERDE, 0.5, NAVY) // a frente a 50% sobre a de trás, DENTRO do grupo
    expect(delta(rgba(await servidor(meio), x, y).slice(0, 3), grupo)).toBeLessThanOrEqual(2)
    expect(delta(rgba(await servidor(comOp), x, y).slice(0, 3), sobre(grupo, 0.5, BRANCO))).toBeLessThanOrEqual(2)
    expect(comparar(await servidor(comOp), editor(comOp)).diferentes).toBe(0)
  })
})

// ── rodada 2 (revisão Codex): o canvas auxiliar do grupo não pode cortar geometria válida fora do viewBox ───────────

describe('CP-V5 rodada 2 — opacidade/sombra não cortam path válido além da caixa', () => {
  const D_LARGO = 'M0 0 L200 0 L200 100 L0 100 Z' // viewBox 0 0 100 100: o path vai a 2× a largura (válido)
  const largo = (extra: Partial<LayerStyle> = {}, effects?: Layer['effects'], rotation = 0): Layer => ({
    id: 'largo', type: 'shape', name: 'largo', visible: true, locked: false, order: 0, rotation,
    position: { x: 100, y: 100 }, size: { width: 100, height: 100 },
    style: { shapeType: 'svg-path', pathData: D_LARGO, pathViewBox: [0, 0, 100, 100], fill: '#ff0000', strokeWidth: 0, opacity: 1,
      vetor: { asset: { id: 'largo', versao: 1 }, partes: [{ d: D_LARGO, slot: 'a', alvo: 'fill' }], cores: { a: '#ff0000' } }, ...extra },
    ...(effects && { effects }),
  }) as Layer
  const sombra = { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 0, shadowOpacity: 1 } }
  const editor500 = (l: Layer) => {
    const s = l.style!
    return pixelsDoKonva(500, 500, FUNDO_DA_TELA, {
      x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height, rotation: l.rotation ?? 0, opacity: s.opacity ?? 1,
      ...(l.effects?.shadow?.enabled && { shadowColor: '#000000', shadowBlur: 4, shadowOpacity: 1, shadowOffset: { x: 0, y: 0 } }),
      ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, strokeWidth: 0 })),
    })
  }
  const servidor500 = (l: Layer) => pixelsDoServidor(500, 500, FUNDO_DA_TELA, [l])
  const VERMELHO = [255, 0, 0]

  it('ponto além de 125% da caixa (250,150): pintado com opacidade 1 e 0,5 — só o alfa muda, nos dois lados', async () => {
    for (const [lado, render] of [['servidor', servidor500], ['editor', editor500]] as const) {
      const [um, meio] = [await render(largo()), await render(largo({ opacity: 0.5 }))]
      expect([lado, rgba(um, 250, 150).slice(0, 3)]).toEqual([lado, VERMELHO])
      expect([lado, delta(rgba(meio, 250, 150).slice(0, 3), sobre(VERMELHO, 0.5, BRANCO)) <= 2]).toEqual([lado, true])
      expect([lado, delta(rgba(meio, 295, 150).slice(0, 3), sobre(VERMELHO, 0.5, BRANCO)) <= 2]).toEqual([lado, true])
    }
  })

  it('sombra (também liga o grupo): o mesmo ponto continua pintado, servidor e editor', async () => {
    for (const [lado, render] of [['servidor', servidor500], ['editor', editor500]] as const) {
      const p = await render(largo({}, sombra))
      expect([lado, delta(rgba(p, 250, 150).slice(0, 3), VERMELHO) <= 2]).toEqual([lado, true])
    }
  })

  it('espelho e rotação: o overflow vai para o outro lado / gira junto, e a opacidade 0,5 não corta', async () => {
    for (const [lado, render] of [['servidor', servidor500], ['editor', editor500]] as const) {
      const espelhado = await render(largo({ opacity: 0.5, flipH: true })) // reflete dentro da caixa: vai de x 0 a 200
      expect([lado, delta(rgba(espelhado, 20, 150).slice(0, 3), sobre(VERMELHO, 0.5, BRANCO)) <= 2]).toEqual([lado, true])
      const girado = await render(largo({ opacity: 0.5 }, undefined, 90)) // 90° em torno de (100,100): o overflow desce para y 300
      expect([lado, delta(rgba(girado, 50, 280).slice(0, 3), sobre(VERMELHO, 0.5, BRANCO)) <= 2]).toEqual([lado, true])
    }
  })
})

// ── rodada 3 (revisão Codex): geometria FORA do canvas que projeta sombra PARA DENTRO não pode sumir ─────────────────

describe('CP-V5 rodada 3 — sombra de geometria externa entra no canvas', () => {
  const D_QUADRADO = 'M0 0 L100 0 L100 100 L0 100 Z'
  const externo = (opacity: number, comSombra: boolean): Layer => ({
    id: 'externo', type: 'shape', name: 'externo', visible: true, locked: false, order: 0, rotation: 0,
    position: { x: -150, y: 100 }, size: { width: 100, height: 100 }, // geometria em x -150…-50: fora do canvas
    style: { shapeType: 'svg-path', pathData: D_QUADRADO, pathViewBox: [0, 0, 100, 100], fill: '#ff0000', strokeWidth: 0, opacity,
      vetor: { asset: { id: 'externo', versao: 1 }, partes: [{ d: D_QUADRADO, slot: 'a', alvo: 'fill' }], cores: { a: '#ff0000' } } },
    ...(comSombra && { effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 0, shadowOffsetX: 100, shadowOffsetY: 0, shadowOpacity: 1 } } }),
  }) as Layer
  const editor300 = (l: Layer) => {
    const s = l.style!
    return pixelsDoKonva(300, 300, FUNDO_DA_TELA, {
      x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height, opacity: s.opacity ?? 1,
      ...(l.effects?.shadow?.enabled && { shadowColor: '#000000', shadowBlur: 0, shadowOpacity: 1, shadowOffset: { x: 100, y: 0 } }),
      ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, strokeWidth: 0 })),
    })
  }
  const servidor300 = (l: Layer) => pixelsDoServidor(300, 300, FUNDO_DA_TELA, [l])
  const PRETO = [0, 0, 0]

  it.each([[1], [0.5]])('opacidade %s: a sombra (offset 100, blur 0) aparece em x 0–50, servidor e editor; sem sombra, nada', async (op) => {
    for (const [lado, render] of [['servidor', servidor300], ['editor', editor300]] as const) {
      const [com, sem] = [await render(externo(op, true)), await render(externo(op, false))]
      for (const x of [5, 25, 45]) {
        expect([lado, op, x, delta(rgba(com, x, 150).slice(0, 3), sobre(PRETO, op, BRANCO)) <= 2]).toEqual([lado, op, x, true])
        expect([lado, op, x, rgba(sem, x, 150).slice(0, 3)]).toEqual([lado, op, x, BRANCO]) // controle sem sombra
      }
      expect([lado, op, rgba(com, 60, 150).slice(0, 3)]).toEqual([lado, op, BRANCO]) // além do fim da sombra (x 50)
    }
  })

  it('sombra com blur 8, geometria dentro: o grupo projeta a sombra (o napi não a aplica no drawImage) ≈ a sombra nativa do legado, servidor e editor', async () => {
    const comBlurDeSombra = (l: Layer) => ({ ...l, position: { x: 20, y: 100 }, effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 100, shadowOffsetY: 0, shadowOpacity: 1 } } }) as Layer
    const multi = comBlurDeSombra(externo(1, true))
    const legado = { ...multi, style: { ...multi.style!, vetor: undefined } } as Layer // svg-path monocolor: sombra nativa por fill
    const editorDe = (l: Layer) => { const s = l.style!; return pixelsDoKonva(300, 300, FUNDO_DA_TELA, { x: 20, y: 100, width: 100, height: 100, shadowColor: '#000000', shadowBlur: 8, shadowOpacity: 1, shadowOffset: { x: 100, y: 0 }, ...shapeKonvaDoSvgPath(s.pathData!, s.pathViewBox, pinturaDoSvgPath(s, { fill: s.fill!, strokeWidth: 0 })) }) }
    const ref = await servidor300(legado)
    for (const [lado, p] of [['servidor', await servidor300(multi)], ['editor', editorDe(multi)]] as const) {
      for (const x of [118, 125, 150, 215, 222, 228]) {
        expect([lado, x, delta(rgba(p, x, 150).slice(0, 3), rgba(ref, x, 150).slice(0, 3)) <= 4]).toEqual([lado, x, true])
      }
    }
  })
})
