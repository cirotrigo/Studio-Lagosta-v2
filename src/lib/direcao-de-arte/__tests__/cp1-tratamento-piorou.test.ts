/**
 * CP1 (13/10/2026) — TRATAMENTO_PIOROU_LEITURA: achado puro e determinístico,
 * medido COM e SEM o tratamento na régua de produção, nas duas polaridades.
 *
 *   A  texto CLARO + véu que CLAREIA o fundo   → p98 sobe  → piora
 *   B  texto ESCURO + véu que ESCURECE o fundo → p02 desce → piora
 *
 * Casos inspirados no relatório REA (clean room, out/2026). Foto gerada,
 * nenhum asset externo; as cores são fixture, nunca regra de produção.
 */
import { describe, expect, it } from 'vitest'

import type { Layer } from '@/types/template'
import { camadaDeGradiente, CURVA_DE_LEITURA } from '@/lib/compositor/gradiente-de-leitura'
import { medirContrasteDaPeca, pioraDaLeitura, textosForaDaPiora, TOLERANCIA_DE_PIORA, TRATAMENTO_PIOROU_LEITURA, tratamentosQuePioraramALeitura, type ContrasteMedido } from '@/lib/compositor/regua'
import { dataUrl } from './suporte/fixture'
import { fotoSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const W = 1080
const H = 1920
const CLARO = '#F5F5F5'
const ESCURO = '#1E1E1E'

async function medir(args: { luz: number | ((x: number, y: number) => number); corDoTexto: string; corDoVeu: string; caixa?: string }) {
  const luz = args.luz
  const foto: Layer = { id: 'fundo', name: 'foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: W, height: H }, fileUrl: dataUrl(await fotoSintetica(typeof luz === 'number' ? () => luz : luz)), style: { objectFit: 'cover' } }
  const veu: Layer = { ...camadaDeGradiente({ borda: 'rodape', W, H, altura: 600, cor: args.corDoVeu, curva: CURVA_DE_LEITURA, forca: 0.6 }), order: 1 }
  const texto: Layer = {
    id: 'servico',
    name: 'servico',
    type: 'text',
    visible: true,
    locked: false,
    order: 2,
    content: 'Seg a sex · 12h às 22h',
    position: { x: 200, y: 1680 },
    size: { width: 680, height: 60 },
    style: { fontSize: 40, lineHeight: 1.2, color: args.corDoTexto, textAlign: 'center' },
    ...(args.caixa ? { effects: { background: { enabled: true, backgroundColor: args.caixa } } } : {}),
  } as Layer
  return medirContrasteDaPeca({ layers: [foto, veu, texto], canvas: { width: W, height: H }, background: '#808080', faixa: [0.45, 0.9], corrigir: false })
}

describe('pioraDaLeitura — pura, nas duas polaridades', () => {
  const fundo = { p02: 90, p98: 160 }

  it('a tolerância é a que o CP0 fixou (2 níveis): afrouxá-la afrouxaria também as propriedades do CP0', () => {
    expect(TOLERANCIA_DE_PIORA).toBe(2)
  })

  it('texto claro: o p98 subir além da tolerância é piora; dentro dela, não', () => {
    expect(pioraDaLeitura({ cor: CLARO, sem: fundo, com: { p02: 120, p98: 190 } })).toMatchObject({ polaridade: 'clara', percentil: 'p98', antes: 160, depois: 190 })
    expect(pioraDaLeitura({ cor: CLARO, sem: fundo, com: { p02: 92, p98: 160 + TOLERANCIA_DE_PIORA } })).toBeNull()
    expect(pioraDaLeitura({ cor: CLARO, sem: fundo, com: { p02: 40, p98: 100 } })).toBeNull()
  })

  it('texto escuro: o p02 descer além da tolerância é piora; subir, não', () => {
    expect(pioraDaLeitura({ cor: ESCURO, sem: fundo, com: { p02: 50, p98: 120 } })).toMatchObject({ polaridade: 'escura', percentil: 'p02', antes: 90, depois: 50 })
    expect(pioraDaLeitura({ cor: ESCURO, sem: fundo, com: { p02: 90 - TOLERANCIA_DE_PIORA, p98: 160 } })).toBeNull()
    expect(pioraDaLeitura({ cor: ESCURO, sem: fundo, com: { p02: 150, p98: 220 } })).toBeNull()
  })

  it('a polaridade sai do texto contra o FUNDO: vermelho de luz média sobre foto escura é texto claro ali, e véu escuro não o piora', () => {
    expect(pioraDaLeitura({ cor: '#C8102E', sem: { p02: 10, p98: 60 }, com: { p02: 5, p98: 30 } })).toBeNull()
  })

  it('fundo que ATRAVESSA a luz do texto: vale a classe WCAG da cor — vermelho saturado é claro, e o véu escuro não é piora', () => {
    // Revisão adversarial B do CP1: pelo meio do fundo, o vermelho (luz 104) sobre listras 56/225 virava "escuro", e o véu escuro, "piora".
    expect(pioraDaLeitura({ cor: '#F4301A', sem: { p02: 56, p98: 225 }, com: { p02: 42, p98: 120 } })).toBeNull()
    expect(pioraDaLeitura({ cor: '#F5F5F5', sem: { p02: 120, p98: 250 }, com: { p02: 160, p98: 254 } })).toMatchObject({ polaridade: 'clara', polaridadePor: 'cor-do-texto' })
    expect(pioraDaLeitura({ cor: CLARO, sem: fundo, com: { p02: 120, p98: 190 } })).toMatchObject({ polaridadePor: 'fundo' })
  })

  it('CP2A: o lado tem de LER — escuro demais para ler como claro é escuro mesmo sobre fundo mais escuro, e o espelho', () => {
    // Antes: #1E1E1E acima do p98 era "claro" e a queda do p02 não era piora; agora é escura e é.
    expect(pioraDaLeitura({ cor: ESCURO, sem: { p02: 5, p98: 20 }, com: { p02: 2, p98: 12 } })).toMatchObject({ polaridade: 'escura', percentil: 'p02', antes: 5, depois: 2 })
    // Antes: #F5F5F5 abaixo do p02 era "escuro"; claro demais para ler como escuro, é clara — e o p98 subir é piora.
    expect(pioraDaLeitura({ cor: CLARO, sem: { p02: 248, p98: 250 }, com: { p02: 252, p98: 254 } })).toMatchObject({ polaridade: 'clara', percentil: 'p98', antes: 250, depois: 254 })
  })

  it('cor que não é #hex (rgba, nome) não é julgada — daria luz falsa', () => {
    expect(pioraDaLeitura({ cor: 'rgba(255,255,255,1)', sem: { p02: 60, p98: 200 }, com: { p02: 30, p98: 110 } })).toBeNull()
  })
})

describe('o que conta como tratamento: só o GRADIENTE de leitura', () => {
  const medida = (parcial: Partial<ContrasteMedido>, texto: Record<string, unknown> = {}): ContrasteMedido => ({
    grupo: 'g',
    camadas: ['t'],
    sentido: 'claro',
    alvo: 139,
    p98SemHalo: 43,
    p98ComHalo: 98,
    tinta: 0.6,
    tintaCorrigida: null,
    gradiente: 'gradiente-leitura-rodape',
    ok: true,
    textos: [{ camada: 't', sentido: 'claro', alvo: 139, p98SemHalo: 43, p98ComHalo: 98, ok: true, cor: '#FFFFFF', percentis: { sem: { p02: 30, p98: 43 }, com: { p02: 90, p98: 98 } }, ...texto }],
    ...parcial,
  })

  it('texto com caixa de fundo própria (a pílula da marca) lê contra ela: a caixa não é piora', () => {
    expect(tratamentosQuePioraramALeitura([medida({}, { caixaDeFundo: true })])).toEqual([])
    expect(tratamentosQuePioraramALeitura([medida({ gradiente: null })])).toEqual([])
    expect(tratamentosQuePioraramALeitura([medida({})])).toHaveLength(1)
  })

  it('topo e rodapé sobrepostos sob o texto: a piora é do conjunto (gradiente null, os dois em `gradientes`)', () => {
    const [piora] = tratamentosQuePioraramALeitura([medida({}, { gradientesSob: ['gradiente-leitura-topo', 'gradiente-leitura-rodape'] })])
    expect(piora).toMatchObject({ gradiente: null, gradientes: ['gradiente-leitura-topo', 'gradiente-leitura-rodape'] })
    // O gradiente do grupo que NÃO cobre o texto não leva a culpa: vale o que está sob ele.
    expect(tratamentosQuePioraramALeitura([medida({}, { gradientesSob: ['gradiente-leitura-topo'] })])[0]).toMatchObject({ gradiente: 'gradiente-leitura-topo' })
    expect(tratamentosQuePioraramALeitura([medida({}, { gradientesSob: [] })])).toEqual([])
  })

  it('textosForaDaPiora: medida anterior ao CP1 e cor que não é #hex ficam ditas (a cobertura vira parcial)', () => {
    expect(textosForaDaPiora([medida({ textos: undefined })])).toEqual(['t'])
    expect(textosForaDaPiora([medida({}, { cor: 'rgba(0,0,0,1)' })])).toEqual(['t'])
    expect(textosForaDaPiora([medida({}, { caixaDeFundo: true }), medida({ gradiente: null })])).toEqual([])
  })
})

describe('TRATAMENTO_PIOROU_LEITURA na régua de produção (render com e sem o véu)', () => {
  it('A — texto claro sob véu claro: o p98 sobe e a régua acusa a piora clara', async () => {
    const r = await medir({ luz: 140, corDoTexto: CLARO, corDoVeu: VEU_CLARO })
    expect(r.pioras).toEqual([expect.objectContaining({ codigo: TRATAMENTO_PIOROU_LEITURA, camada: 'servico', gradiente: 'gradiente-leitura-rodape', polaridade: 'clara', percentil: 'p98' })])
    expect(r.pioras[0].depois - r.pioras[0].antes).toBeGreaterThan(TOLERANCIA_DE_PIORA)
    expect(r.medidas[0].textos?.[0].gradientesSob).toEqual(['gradiente-leitura-rodape'])
  }, 30_000)

  it('B — texto escuro sob véu escuro: o p02 desce e a régua acusa a piora escura', async () => {
    const r = await medir({ luz: 110, corDoTexto: ESCURO, corDoVeu: VEU_ESCURO })
    expect(r.pioras).toEqual([expect.objectContaining({ codigo: TRATAMENTO_PIOROU_LEITURA, camada: 'servico', polaridade: 'escura', percentil: 'p02' })])
    expect(r.pioras[0].antes - r.pioras[0].depois).toBeGreaterThan(TOLERANCIA_DE_PIORA)
  }, 30_000)

  it('vermelho saturado sobre foto listrada sob véu escuro: a régua de produção não acusa piora (revisão B do CP1)', async () => {
    const listras = (x: number) => (Math.floor(x / 40) % 2 ? 225 : 60)
    expect((await medir({ luz: listras, corDoTexto: '#F4301A', corDoVeu: '#111111' })).pioras).toEqual([])
  }, 30_000)

  it('texto com caixa de fundo própria sob o véu: a régua não acusa a caixa como piora', async () => {
    const r = await medir({ luz: 40, corDoTexto: '#FFFFFF', corDoVeu: VEU_ESCURO, caixa: '#C8102E' })
    expect(r.medidas[0].textos?.[0]).toMatchObject({ caixaDeFundo: true })
    expect(r.pioras).toEqual([])
  }, 30_000)

  it('controles: véu da polaridade certa não é piora (claro sob escuro, escuro sob claro)', async () => {
    expect((await medir({ luz: 140, corDoTexto: CLARO, corDoVeu: VEU_ESCURO })).pioras).toEqual([])
    expect((await medir({ luz: 110, corDoTexto: ESCURO, corDoVeu: VEU_CLARO })).pioras).toEqual([])
  }, 30_000)
})
