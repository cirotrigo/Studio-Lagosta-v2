/**
 * CP2A (14/10/2026) — a polaridade do tratamento de leitura no COMPOSITOR
 * REAL, com foto, página e logo geradas. A biblioteca legada por projeto
 * (`GRADIENTES_POR_PROJETO`) fica VAZIA: as cores aprovadas vêm só da
 * assinatura (a mancha escura e a cor do gradiente clara) — prova de que a
 * lógica nova não depende do legado. As cores são fixture.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
vi.mock('@/lib/creatives/persist', async () => (await import('./suporte/compositor')).mockDaPersistencia())
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))

import type { Layer } from '@/types/template'
import { comporPeca, type OpcoesDeComposicao, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { camadaDeGradiente, CURVA_DE_LEITURA } from '@/lib/compositor/gradiente-de-leitura'
import { medirContrasteDaPeca } from '@/lib/compositor/regua'
import { CreativeError } from '@/lib/creatives/errors'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { leituraDaLogo, leituraDentroDoAlvo, leiturasDosTextos, resumoDaLogo, tratamentosQuePioram } from './suporte/propriedades'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const CANVAS = { width: 1080, height: 1920 }
const ESCURO = '#1E1E1E'
const CLARO = '#F5F5F5'
const HEADLINE = { papel: 'headline', linhas: ['Sintético'] }
const SERVICO = { papel: 'servico', linhas: ['Seg a sex · 12h às 22h'] }
const APOIO = { papel: 'apoio', linhas: ['Apoio claro'] }
/** As cores aprovadas vêm da ASSINATURA: a mancha (escura) e a cor do gradiente (clara). */
const ASSINATURA = { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } }

interface Caso {
  headline: string
  apoio?: string
  servico?: string
  luz: (x: number, y: number) => number
  blocos: Array<{ papel: string; linhas: string[] }>
  preferencias?: Record<string, unknown>
  /** Camadas a mais na página de assinatura (gradientes da página). */
  extrasDaPagina?: Layer[]
  /** As candidatas da biblioteca LEGADA (vazia por padrão). */
  legado?: string[]
  assinatura?: Record<string, unknown>
  logo?: string
}

async function compor(id: string, c: Caso, opcoes: OpcoesDeComposicao = { somenteAvaliar: true }): Promise<ResultadoDaComposicao> {
  const foto = await fotoSintetica(c.luz)
  const pagina = paginaSintetica({
    id,
    headline: { cor: c.headline },
    ...(c.apoio ? { apoio: { cor: c.apoio } } : {}),
    ...(c.servico ? { servico: { cor: c.servico } } : {}),
    logoUrl: dataUrl(await logoSintetica(c.logo ?? '#808080')),
    fundoUrl: dataUrl(foto),
  })
  pagina.layers.push(...(c.extrasDaPagina ?? []))
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: c.legado ?? [] })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: c.assinatura ?? ASSINATURA } }
  return comporPeca(specSintetica({ pagina: id, blocos: c.blocos, preferencias: c.preferencias }), opcoes)
}

const veu = (r: ResultadoDaComposicao, borda: 'topo' | 'rodape') => {
  const l = r.layers.find((x) => x.id === `gradiente-leitura-${borda}`)
  return l ? (l.style as { gradientStops: Array<{ color: string }> }).gradientStops[0].color : null
}
const plano = (r: ResultadoDaComposicao, borda: 'topo' | 'rodape') => r.diagnostico.tratamentoDeLeitura?.find((t) => t.borda === borda)
const uniforme = (v: number) => () => v
/** Topo e rodapé de luz diferente (o corte no meio da peça). */
const metades = (topo: number, rodape: number) => (_x: number, y: number) => (y < 960 ? topo : rodape)

describe('os casos do CP2A no compositor real (biblioteca legada vazia)', () => {
  it('A — texto claro sobre foto clara: véu ESCURO (a mancha da assinatura) no rodapé, que melhora e leva ao alvo', async () => {
    const r = await compor('cp2a-a', { headline: CLARO, servico: CLARO, luz: uniforme(205), blocos: [HEADLINE, SERVICO] })
    expect([veu(r, 'topo'), veu(r, 'rodape')]).toEqual([VEU_ESCURO, VEU_ESCURO])
    expect(plano(r, 'rodape')).toMatchObject({ estado: 'tratado', origemDaCor: 'mancha' })
    const leituras = await leiturasDosTextos(r.layers, CANVAS)
    expect(tratamentosQuePioram(leituras)).toEqual([])
    expect(leituras.every(leituraDentroDoAlvo), JSON.stringify(leituras)).toBe(true)
  }, 60_000)

  it('B — texto escuro sobre foto escura: véu CLARO (a cor do gradiente da assinatura), que melhora e leva ao alvo', async () => {
    const r = await compor('cp2a-b', { headline: ESCURO, servico: '#222222', luz: uniforme(55), blocos: [HEADLINE, SERVICO] })
    expect([veu(r, 'topo'), veu(r, 'rodape')]).toEqual([VEU_CLARO, VEU_CLARO])
    expect(plano(r, 'topo')).toMatchObject({ estado: 'tratado', origemDaCor: 'numeros-da-assinatura' })
    const leituras = await leiturasDosTextos(r.layers, CANVAS)
    expect(tratamentosQuePioram(leituras)).toEqual([])
    expect(leituras.every(leituraDentroDoAlvo), JSON.stringify(leituras)).toBe(true)
  }, 60_000)

  it('C — texto claro sobre foto já escura o bastante: NENHUM gradiente de leitura (o piso de 0.45 não nasce sem necessidade)', async () => {
    const r = await compor('cp2a-c', { headline: CLARO, servico: CLARO, luz: uniforme(45), blocos: [HEADLINE, SERVICO] })
    expect(r.layers.filter((l) => l.type === 'gradient')).toEqual([])
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => [t.borda, t.estado])).toEqual([['topo', 'sem-necessidade'], ['rodape', 'sem-necessidade']])
    expect(r.diagnostico.contraste?.every((m) => m.ok)).toBe(true)
  }, 60_000)

  it('D — texto escuro sobre foto já clara o bastante: nenhum véu de TEXTO (só o da logo, regra antiga), e a régua o mede como ESCURO (sem aviso falso de "alvo 0")', async () => {
    const r = await compor('cp2a-d', { headline: ESCURO, servico: '#222222', luz: uniforme(215), blocos: [HEADLINE, SERVICO] })
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => [t.borda, t.estado])).toEqual([['topo', 'sem-necessidade'], ['rodape', 'sem-necessidade']])
    // A logo (cinza, no canto do topo, sobre a foto clara) mantém o véu que a borda de texto lhe dava antes do CP2A.
    expect(r.diagnostico.tratamentoDeLeitura?.filter((t) => t.cor).map((t) => [t.borda, t.veuDaLogo])).toEqual([['topo', true]])
    expect(r.diagnostico.contraste?.flatMap((m) => m.textos ?? []).map((t) => [t.camada, t.sentido, t.ok])).toEqual([
      ['headline', 'escuro', true],
      ['servico', 'escuro', true],
    ])
    expect(r.diagnostico.avisos.some((a) => /alvo 0/.test(a))).toBe(false)
  }, 60_000)

  it('E — topo e rodapé independentes: texto escuro em cima (foto escura) e claro embaixo (foto clara) — véu claro no topo, escuro no rodapé', async () => {
    const r = await compor('cp2a-e', { headline: ESCURO, servico: CLARO, luz: metades(55, 205), blocos: [HEADLINE, SERVICO] })
    expect([veu(r, 'topo'), veu(r, 'rodape')]).toEqual([VEU_CLARO, VEU_ESCURO])
    const leituras = await leiturasDosTextos(r.layers, CANVAS)
    expect(tratamentosQuePioram(leituras)).toEqual([])
    expect(leituras.every(leituraDentroDoAlvo), JSON.stringify(leituras)).toBe(true)
  }, 60_000)

  it('F — tratamento que piora nunca vence: com texto escuro e claro no rodapé, nenhum véu é desenhado ali e nada piora', async () => {
    const r = await compor('cp2a-f', { headline: ESCURO, servico: CLARO, luz: uniforme(175), blocos: [HEADLINE, SERVICO], preferencias: { ancora: 'rodape' } })
    expect(veu(r, 'rodape')).toBeNull()
    expect(plano(r, 'rodape')?.recusadas).toEqual(expect.arrayContaining([expect.objectContaining({ cor: VEU_ESCURO, motivo: 'TRATAMENTO_PIOROU_LEITURA' })]))
    expect(r.diagnostico.tratamentoPiorou ?? []).toEqual([])
    expect(tratamentosQuePioram(await leiturasDosTextos(r.layers, CANVAS))).toEqual([])
  }, 60_000)

  it('G — polaridades incompatíveis na MESMA borda: a estratégia de tratamento é inviável (motivo estruturado, aviso), SEM concluir SEM_COMBINACAO', async () => {
    let r: ResultadoDaComposicao | null = null
    let recusa: unknown = null
    try {
      r = await compor('cp2a-g', { headline: ESCURO, apoio: CLARO, luz: uniforme(175), blocos: [HEADLINE, APOIO] })
    } catch (e) {
      recusa = e
    }
    expect(recusa instanceof CreativeError ? recusa.code : recusa).toBeNull()
    expect(plano(r!, 'topo')).toMatchObject({ estado: 'inviavel', motivo: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA' })
    expect(veu(r!, 'topo')).toBeNull()
    expect(r!.diagnostico.avisos.some((a) => /POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA/.test(a) && /posição/.test(a))).toBe(true)
    expect(JSON.stringify(r!.diagnostico)).not.toContain('SEM_COMBINACAO')
  }, 60_000)
})

describe('cores aprovadas: assinatura primeiro, legado só como último recurso', () => {
  it('com a cor na assinatura, a biblioteca legada (mesmo presente) não é escolhida', async () => {
    const r = await compor('cp2a-legado-presente', { headline: ESCURO, servico: '#222222', luz: uniforme(55), blocos: [HEADLINE, SERVICO], legado: ['#000000', '#FFFFFF'] })
    expect(r.diagnostico.gradientes?.map((g) => [g.cor, g.origemDaCor])).toEqual([
      [VEU_CLARO, 'numeros-da-assinatura'],
      [VEU_CLARO, 'numeros-da-assinatura'],
    ])
    // O plano: a mancha e o preto legado ficam do lado errado do alvo; o branco legado serviria, mas perde na ordem.
    expect(plano(r, 'topo')?.recusadas).toEqual(
      expect.arrayContaining([
        { cor: VEU_ESCURO, origem: 'mancha', motivo: 'SENTIDO_ERRADO' },
        { cor: '#000000', origem: 'biblioteca-legada', motivo: 'SENTIDO_ERRADO' },
      ]),
    )
  }, 60_000)

  it('sem cor clara na assinatura, o claro sai da biblioteca legada — marcado como tal', async () => {
    const r = await compor('cp2a-so-legado', { headline: ESCURO, servico: '#222222', luz: uniforme(55), blocos: [HEADLINE, SERVICO], legado: ['#FFFFFF'], assinatura: { mancha: VEU_ESCURO } })
    expect(r.diagnostico.gradientes?.map((g) => g.origemDaCor)).toEqual(['biblioteca-legada', 'biblioteca-legada'])
  }, 60_000)

  it('sem cor aprovada da polaridade pedida, nenhum véu — e nada é inventado (SEM_COR_APROVADA_PARA_A_POLARIDADE)', async () => {
    const r = await compor('cp2a-sem-cor', { headline: ESCURO, servico: '#222222', luz: uniforme(55), blocos: [HEADLINE, SERVICO], assinatura: { mancha: VEU_ESCURO } })
    expect(r.layers.filter((l) => l.type === 'gradient')).toEqual([])
    expect(plano(r, 'topo')).toMatchObject({ estado: 'inviavel', motivo: 'SEM_COR_APROVADA_PARA_A_POLARIDADE' })
  }, 60_000)
})

describe('gradiente de leitura × decorativo', () => {
  const radialCreme = {
    id: 'decorativo',
    name: 'decorativo',
    type: 'gradient',
    visible: true,
    locked: false,
    order: 1,
    position: { x: 0, y: 0 },
    size: { width: 1080, height: 1920 },
    style: { gradientType: 'radial', gradientStops: [{ id: 'a', position: 0, color: '#F2E6C8', opacity: 0.9 }, { id: 'b', position: 1, color: '#F2E6C8', opacity: 0 }] },
  } as Layer

  it('o gradiente DECORATIVO da página (radial) não vira tratamento: não manda na cor de borda nenhuma', async () => {
    const r = await compor('cp2a-decorativo', { headline: CLARO, servico: CLARO, luz: uniforme(205), blocos: [HEADLINE, SERVICO], extrasDaPagina: [radialCreme] })
    expect([veu(r, 'topo'), veu(r, 'rodape')]).toEqual([VEU_ESCURO, VEU_ESCURO])
    expect(r.diagnostico.gradientes?.some((g) => g.origemDaCor === 'pagina' || g.origemDaCor === 'pagina-na-borda')).toBe(false)
  }, 60_000)

  it('(caracterização — já valia antes do CP2A) a régua nunca mexe num gradiente decorativo da peça: só o de leitura é corrigido', async () => {
    const foto: Layer = { id: 'fundo', name: 'foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: CANVAS, fileUrl: dataUrl(await fotoSintetica(uniforme(205))), style: { objectFit: 'cover' } }
    const decorativo = { ...radialCreme, order: 1 } as Layer
    const leitura = { ...camadaDeGradiente({ borda: 'rodape', W: 1080, H: 1920, altura: 600, cor: VEU_ESCURO, curva: CURVA_DE_LEITURA, forca: 0.45 }), order: 2 }
    const texto = { id: 'servico', name: 'servico', type: 'text', visible: true, locked: false, order: 3, content: 'Serviço', position: { x: 200, y: 1680 }, size: { width: 680, height: 60 }, style: { fontSize: 40, color: CLARO } } as Layer
    const r = await medirContrasteDaPeca({ layers: [foto, decorativo, leitura, texto], canvas: CANVAS, background: '#808080', faixa: [0.45, 0.9], corrigir: true })
    expect(r.layers.find((l) => l.id === 'decorativo')).toEqual(decorativo)
  }, 60_000)
})

describe('o que a revisão adversarial do CP2A pediu', () => {
  const rodapeCreme = {
    id: 'gradiente-da-pagina',
    name: 'gradiente',
    type: 'gradient',
    visible: true,
    locked: false,
    order: 1,
    position: { x: 0, y: 1000 },
    size: { width: 1080, height: 920 },
    style: { gradientType: 'linear', gradientAngle: 0, gradientStops: [{ id: 'a', position: 0, color: '#F3EADC', opacity: 0.8 }, { id: 'b', position: 1, color: '#F3EADC', opacity: 0 }] },
  } as Layer

  it('o tratamento EXPLÍCITO do template (creme no rodapé da página) é reproduzido como sempre, mesmo piorando o serviço claro — e a piora é acusada', async () => {
    const r = await compor('cp2a-explicito', { headline: CLARO, servico: CLARO, luz: uniforme(205), blocos: [HEADLINE, SERVICO], extrasDaPagina: [rodapeCreme] })
    expect(veu(r, 'rodape')).toBe('#F3EADC')
    expect(plano(r, 'rodape')).toMatchObject({ estado: 'explicito-do-template', origemDaCor: 'pagina-na-borda' })
    expect(r.diagnostico.tratamentoPiorou).toEqual([expect.objectContaining({ camada: 'servico', polaridade: 'clara', gradiente: 'gradiente-leitura-rodape' })])
  }, 60_000)

  it('a logo numa borda de texto que não pede véu mantém o véu que a borda lhe dava (a regra da logo de antes; a logo é do CP3)', async () => {
    const cantoClaro = (x: number, y: number) => (x > 760 && y < 420 ? 235 : 45)
    const r = await compor('cp2a-logo', { headline: CLARO, servico: CLARO, luz: cantoClaro, blocos: [HEADLINE, SERVICO], logo: '#F5F5F5', assinatura: { mancha: VEU_ESCURO } })
    expect(plano(r, 'topo')).toMatchObject({ estado: 'sem-necessidade', veuDaLogo: true, cor: VEU_ESCURO })
    const logo = await leituraDaLogo(r.layers, CANVAS)
    expect(logo?.legivel, logo ? resumoDaLogo(logo) : 'sem logo').toBe(true)
  }, 60_000)

  it('G na SELEÇÃO: a estratégia inviável não vira SEM_COMBINACAO — o contraste fica pendente de posição', async () => {
    const selecao = { combinacoes: [], limite: 6, janelaMs: 1, interrompida: false }
    const r = await compor('cp2a-g-selecao', { headline: ESCURO, apoio: CLARO, luz: uniforme(175), blocos: [HEADLINE, APOIO] }, { somenteAvaliar: true, selecao })
    expect(plano(r, 'topo')).toMatchObject({ estado: 'inviavel', motivo: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA' })
    expect(r.diagnostico.selecao).toEqual(selecao)
  }, 60_000)

  it('vermelho do By Rock (#DC0909) sobre foto clara: o plano não pede véu e a régua concorda (texto escuro, no alvo, sem aviso falso)', async () => {
    const r = await compor('cp2a-by-rock-claro', { headline: '#DC0909', servico: '#DC0909', luz: uniforme(212), blocos: [HEADLINE, SERVICO] })
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => t.estado)).toEqual(['sem-necessidade', 'sem-necessidade'])
    expect(r.diagnostico.contraste?.flatMap((m) => m.textos ?? []).map((t) => [t.camada, t.sentido, t.ok])).toEqual([
      ['headline', 'escuro', true],
      ['servico', 'escuro', true],
    ])
    expect(r.diagnostico.avisos.some((a) => /clara demais/.test(a))).toBe(false)
  }, 60_000)

  it('vermelho puro (#FF0000) sobre foto média (luz 100) é texto CLARO no espaço da medida: véu escuro, nunca o claro', async () => {
    const r = await compor('cp2a-vermelho', { headline: '#FF0000', servico: '#FF0000', luz: uniforme(100), blocos: [HEADLINE, SERVICO] })
    expect([veu(r, 'topo'), veu(r, 'rodape')]).toEqual([VEU_ESCURO, VEU_ESCURO])
    expect(r.diagnostico.tratamentoPiorou ?? []).toEqual([])
  }, 60_000)

  it('a MESMA cor de luz intermediária (#dc0909) lê pelo lado claro sobre foto escura (véu escuro, nada piora) e pelo escuro sobre foto clara (nenhum véu, no alvo) — no compositor e no oráculo do CP0', async () => {
    const sobreEscura = await compor('cp2a-luz-media-escura', { headline: '#DC0909', servico: '#DC0909', luz: uniforme(60), blocos: [HEADLINE, SERVICO] })
    expect([veu(sobreEscura, 'topo'), veu(sobreEscura, 'rodape')]).toEqual([VEU_ESCURO, VEU_ESCURO])
    expect(sobreEscura.diagnostico.tratamentoPiorou ?? []).toEqual([])
    const leiturasSobreEscura = await leiturasDosTextos(sobreEscura.layers, CANVAS)
    expect(leiturasSobreEscura.map((l) => l.polaridade)).toEqual(['clara', 'clara'])
    expect(tratamentosQuePioram(leiturasSobreEscura)).toEqual([])

    const sobreClara = await compor('cp2a-luz-media-clara', { headline: '#DC0909', servico: '#DC0909', luz: uniforme(212), blocos: [HEADLINE, SERVICO] })
    expect(sobreClara.diagnostico.tratamentoDeLeitura?.filter((t) => t.cor && !t.veuDaLogo)).toEqual([])
    const leiturasSobreClara = await leiturasDosTextos(sobreClara.layers, CANVAS)
    expect(leiturasSobreClara.map((l) => l.polaridade)).toEqual(['escura', 'escura'])
    expect(leiturasSobreClara.every(leituraDentroDoAlvo), JSON.stringify(leiturasSobreClara)).toBe(true)
  }, 60_000)
})

describe('a régua não escurece o véu sob texto escuro (o sentido certo)', () => {
  it('texto escuro sob véu ESCURO: medido como escuro e a força NÃO sobe (antes, alvo 0 → véu a 0.9)', async () => {
    const foto: Layer = { id: 'fundo', name: 'foto', type: 'image', visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: CANVAS, fileUrl: dataUrl(await fotoSintetica(uniforme(110))), style: { objectFit: 'cover' } }
    const leitura = { ...camadaDeGradiente({ borda: 'rodape', W: 1080, H: 1920, altura: 600, cor: VEU_ESCURO, curva: CURVA_DE_LEITURA, forca: 0.45 }), order: 1 }
    const texto = { id: 'servico', name: 'servico', type: 'text', visible: true, locked: false, order: 2, content: 'Serviço', position: { x: 200, y: 1680 }, size: { width: 680, height: 60 }, style: { fontSize: 40, color: ESCURO } } as Layer
    const r = await medirContrasteDaPeca({ layers: [foto, leitura, texto], canvas: CANVAS, background: '#808080', faixa: [0.45, 0.9], corrigir: true })
    expect(r.medidas[0]).toMatchObject({ sentido: 'escuro', tintaCorrigida: null })
    expect(r.layers.find((l) => l.id === 'gradiente-leitura-rodape')?.metadata?.forca).toBe(0.45)
  }, 60_000)
})
