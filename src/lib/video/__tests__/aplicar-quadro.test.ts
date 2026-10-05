/**
 * Achados 1 e 8 da revisão do Codex sobre as Fases 2 e 3 (03/10/2026): o
 * efeito da foto em movimento fica suspenso SÓ durante o gesto (toque na
 * camada, alça do Transformer, arraste) — selecionada e parada ela mostra o
 * quadro do instante, como o export —, e os ouvintes de toque saem no descarte.
 *
 * Nós reais do Konva (Core, sem canvas) na estrutura que o KonvaLayerFactory
 * monta; o stage é um dublê com o que o aplicador usa dele.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Konva from 'konva/lib/Core'
import type KonvaTipos from 'konva'
import { Rect } from 'konva/lib/shapes/Rect'
import { Transformer } from 'konva/lib/shapes/Transformer'
import { aplicarQuadro, GRUPO_DE_EFEITO, GRUPO_DE_MOVIMENTO, restaurarIdentidade } from '../aplicar-quadro'
import { quadroDoMovimento } from '../movimento'

const musica = { source: 'library', musicId: 1, startTime: 0, endTime: 10 }
const camada = {
  id: 'foto',
  type: 'image',
  position: { x: 100, y: 200 },
  size: { width: 800, height: 600 },
  movimento: 'aproximar',
}
const design = { layers: [camada], audio: musica, canvas: { width: 1080 } }
// No meio da música (10 s) o aproximar está na metade do caminho
const ESCALA_NO_MEIO = quadroDoMovimento('aproximar', 0.5).escala

/** A estrutura do factory: efeito → nó editável → recorte → movimento → imagem. */
function fotoEmMovimento() {
  const efeito = new Konva.Group({ name: GRUPO_DE_EFEITO, camadaId: camada.id })
  const no = new Konva.Group({ id: camada.id, x: camada.position.x, y: camada.position.y })
  const recorte = new Konva.Group()
  const movimento = new Konva.Group({ name: GRUPO_DE_MOVIMENTO })
  const imagem = new Rect({ width: camada.size.width, height: camada.size.height })
  movimento.add(imagem)
  recorte.add(movimento)
  no.add(recorte)
  efeito.add(no)
  return { efeito, no, movimento, imagem }
}

function palco(grupos: KonvaTipos.Group[], transformers: Transformer[] = []) {
  const container = new EventTarget()
  let alvo: KonvaTipos.Node | null = null
  const stage = {
    find: (seletor: string) => (seletor === '.' + GRUPO_DE_EFEITO ? grupos : seletor === 'Transformer' ? transformers : []),
    container: () => container,
    setPointersPositions: () => undefined,
    getPointerPosition: () => ({ x: 1, y: 1 }),
    getIntersection: () => alvo,
  } as unknown as KonvaTipos.Stage
  const tocar = (no: KonvaTipos.Node) => {
    alvo = no
    container.dispatchEvent(new Event('pointerdown'))
  }
  return { stage, container, tocar }
}

const soltar = () => (globalThis as unknown as { window: EventTarget }).window.dispatchEvent(new Event('pointerup'))
const escala = (g: KonvaTipos.Node) => g.scaleX()

beforeEach(() => {
  ;(globalThis as unknown as { window: EventTarget }).window = new EventTarget()
})
afterEach(() => {
  delete (globalThis as unknown as { window?: EventTarget }).window
})

describe('aplicarQuadro — o efeito só fica suspenso durante o gesto', () => {
  it('selecionada (presa ao Transformer) e parada, a foto mostra o quadro do instante', () => {
    const f = fotoEmMovimento()
    const tr = new Transformer()
    tr.nodes([f.no])
    const { stage } = palco([f.efeito], [tr])
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    // No espaço da caixa: escala em torno do centro
    expect(f.movimento.x()).toBe(camada.size.width / 2)
    expect(f.movimento.offsetX()).toBe(camada.size.width / 2)
    // O nó editável continua na posição do design (é ele que os handlers gravam)
    expect(f.no.x()).toBe(camada.position.x)
    expect(f.no.scaleX()).toBe(1)
    restaurarIdentidade(stage)
  })

  it('rodada 2 — a imagem que carrega depois do primeiro quadro recebe o movimento no mesmo instante', () => {
    const f = fotoEmMovimento()
    // Antes de a imagem carregar, o nó só tem o placeholder: sem grupo de movimento
    f.movimento.remove()
    const { stage } = palco([f.efeito])
    aplicarQuadro(stage, design, 5)
    // A imagem carregou: o factory monta o grupo de movimento novo, em identidade
    const recorte = f.no.getChildren()[0] as KonvaTipos.Group
    const novo = new Konva.Group({ name: GRUPO_DE_MOVIMENTO })
    recorte.add(novo)
    aplicarQuadro(stage, design, 5) // mesmo instante, mesmo alvo
    expect(escala(novo)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })

  it('o toque na foto suspende antes do Konva tratar o pointerdown; soltar devolve o efeito', () => {
    const f = fotoEmMovimento()
    const { stage, tocar } = palco([f.efeito])
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    tocar(f.imagem)
    expect(escala(f.movimento)).toBe(1)
    aplicarQuadro(stage, design, 6)
    expect(escala(f.movimento)).toBe(1)
    soltar()
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })

  it('o toque numa alça do Transformer suspende os nós que ele segura', () => {
    const f = fotoEmMovimento()
    const tr = new Transformer()
    tr.nodes([f.no])
    const { stage, tocar } = palco([f.efeito], [tr])
    aplicarQuadro(stage, design, 5)
    tocar(tr.findOne('.bottom-right')!)
    expect(escala(f.movimento)).toBe(1)
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBe(1)
    soltar()
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })

  it('nó fora do design (arrastado, ou a alça mudou a escala) fica sem efeito até o React gravar', () => {
    const f = fotoEmMovimento()
    const { stage } = palco([f.efeito])
    f.no.x(160)
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBe(1)
    f.no.x(camada.position.x)
    f.no.scaleX(1.3)
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBe(1)
    f.no.scaleX(1)
    aplicarQuadro(stage, design, 5)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })

  it('gravando (export, miniatura): nem o toque nem o desalinho suspendem', () => {
    const f = fotoEmMovimento()
    const { stage, tocar } = palco([f.efeito])
    aplicarQuadro(stage, design, 5)
    tocar(f.imagem)
    aplicarQuadro(stage, design, 5, { gravando: true })
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })

  it('sem música a página não é vídeo: a foto não anda', () => {
    const f = fotoEmMovimento()
    const { stage } = palco([f.efeito])
    aplicarQuadro(stage, { ...design, audio: null }, 5)
    expect(escala(f.movimento)).toBe(1)
    restaurarIdentidade(stage)
  })
})

describe('aplicarQuadro — os ouvintes de toque', () => {
  it('são instalados uma vez por stage, saem no descarte e voltam no próximo quadro', () => {
    const f = fotoEmMovimento()
    const { stage, container, tocar } = palco([f.efeito])
    const janela = (globalThis as unknown as { window: EventTarget }).window
    const noContainer = vi.spyOn(container, 'addEventListener')
    const naJanela = vi.spyOn(janela, 'addEventListener')
    const saiDoContainer = vi.spyOn(container, 'removeEventListener')
    const saiDaJanela = vi.spyOn(janela, 'removeEventListener')

    for (let t = 0; t < 5; t++) aplicarQuadro(stage, design, t)
    expect(noContainer).toHaveBeenCalledTimes(1)
    expect(naJanela.mock.calls.map((c) => c[0]).sort()).toEqual(['pointercancel', 'pointerup'])

    tocar(f.imagem)
    restaurarIdentidade(stage)
    expect(saiDoContainer).toHaveBeenCalledTimes(1)
    expect(saiDaJanela.mock.calls.map((c) => c[0]).sort()).toEqual(['pointercancel', 'pointerup'])
    expect(escala(f.movimento)).toBe(1)

    // O toque de antes do descarte não sobra: sem ouvinte, tocar não suspende mais
    tocar(f.imagem)
    aplicarQuadro(stage, design, 5)
    expect(noContainer).toHaveBeenCalledTimes(2)
    expect(escala(f.movimento)).toBeCloseTo(ESCALA_NO_MEIO)
    restaurarIdentidade(stage)
  })
})
