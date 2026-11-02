/**
 * F2a — o CORTE EXPLÍCITO da foto (`foto.janela`) no compositor real (dublês de banco, persistência, fontes, medidor e
 * acervo; foto sintética): a janela atravessa o raster, a escolha espacial e a camada gravada (`style.crop`, sem
 * `cropPosition`), com e sem arquétipo; a proporção é conferida em px (ajuste mínimo dito; fora da foto, recusa).
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

import { comporPeca } from '@/lib/compositor/compor'
import { chaveDoCorte } from '@/lib/compositor/corte-da-foto'
import { CreativeError } from '@/lib/creatives/errors'
import { lerFotoComoCover } from '@/lib/creatives/halo/halo-medicao'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const BLOCOS = [
  { papel: 'headline', linhas: ['Almoço', 'de domingo'] },
  { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
]
/** Topo escuro (o texto pousa), base clara: a janela da metade de baixo é clara; a de cima, escura. */
const LUZ = (_x: number, y: number) => (y < 960 ? 40 : 210)
// Na proporção do story (1080×1920): 0,5 × 1080 = 540 de largura → 960 de altura = 0,5 × 1920.
const JANELA = { x: 0.1, y: 0.05, width: 0.5, height: 0.5 }

async function montar(luz = LUZ, dimensoes?: { width: number; height: number }) {
  const foto = await fotoSintetica(luz, dimensoes)
  const pagina = paginaSintetica({ id: 'f2a', headline: { cor: '#F5F5F5' }, servico: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
  return foto
}
const erro = async (p: Promise<unknown>) => p.then(() => null, (e) => e as CreativeError)

describe('F2a · a janela no raster', () => {
  it('lerFotoComoCover com a janela lê SÓ a janela (a metade clara de baixo), não o cover central', async () => {
    const foto = await fotoSintetica(LUZ)
    const canvas = { width: 1080, height: 1920 }
    const media = (f: { data: Buffer }) => f.data.reduce((s, v) => s + v, 0) / f.data.length
    const baixo = await lerFotoComoCover(foto, canvas, { janela: { x: 0, y: 0.5, width: 1, height: 0.5 } })
    const cima = await lerFotoComoCover(foto, canvas, { janela: { x: 0, y: 0, width: 1, height: 0.5 } })
    const central = await lerFotoComoCover(foto, canvas, { cropPosition: 'center-middle' })
    expect(media(baixo)).toBeGreaterThan(190)
    expect(media(cima)).toBeLessThan(60)
    expect(media(central)).toBeGreaterThan(100)
    expect(media(central)).toBeLessThan(150)
  })
})

describe('F2a · a janela na composição', () => {
  it('sem arquétipo: a camada da foto nasce com style.crop = a janela (sem cropPosition) e o diagnóstico diz o corte "janela"', async () => {
    await montar()
    const r = await comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: JANELA } }, { somenteAvaliar: true })
    const fundo = r.layers.find((l) => l.id === 'bg-foto')!
    expect(fundo.style?.crop).toEqual(JANELA)
    expect(fundo.style?.cropPosition).toBeUndefined()
    expect(fundo.style?.objectFit).toBe('cover')
    expect(r.diagnostico.posicao.crop).toBe('janela')
    expect(r.diagnostico.posicao.janela).toEqual(JANELA)
    expect(r.diagnostico.posicao.janelaPedida).toBeUndefined()
  }, 60_000)

  it('com arquétipo: a busca roda só na janela, a escolha grava corte "janela" + a janela, e a camada idem', async () => {
    await montar()
    const r = await comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: JANELA }, arquetipo: { id: 'minimal-fb-topo-esquerda' } }, { somenteAvaliar: true })
    const fundo = r.layers.find((l) => l.id === 'bg-foto')!
    expect(fundo.style?.crop).toEqual(JANELA)
    expect(fundo.style?.cropPosition).toBeUndefined()
    const arq = r.diagnostico.arquetipo!
    expect(arq.buscaEspacial?.cortesAvaliados).toEqual(['janela'])
    expect(arq.buscaEspacial?.escolha).toMatchObject({ corte: 'janela', janela: JANELA })
    expect(chaveDoCorte({ janela: arq.buscaEspacial!.escolha.janela! })).toBe(chaveDoCorte({ janela: JANELA }))
    expect(r.diagnostico.posicao).toMatchObject({ crop: 'janela', janela: JANELA })
  }, 60_000)

  it('janela fora da proporção da caixa: expandida ao mínimo, centrada, e DITA (janelaPedida fica no diagnóstico)', async () => {
    await montar()
    const quadrada = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 * (1080 / 1920) } // quadrada em px numa foto 1080×1920
    const r = await comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: quadrada } }, { somenteAvaliar: true })
    const efetiva = r.diagnostico.posicao.janela!
    expect(r.diagnostico.posicao.janelaPedida).toEqual(quadrada)
    expect((efetiva.width * 1080) / (efetiva.height * 1920)).toBeCloseTo(1080 / 1920, 6)
    expect(efetiva.width).toBe(quadrada.width)
    // A expansão centrada sairia do topo da foto (y −0,009): a janela desliza para dentro (y 0), com a altura certa.
    expect(efetiva.height).toBeCloseTo(0.5, 9)
    expect(efetiva.y).toBe(0)
    expect(r.diagnostico.avisos.join(' ')).toMatch(/não estava na proporção da caixa/)
    expect(r.layers.find((l) => l.id === 'bg-foto')!.style?.crop).toEqual(efetiva)
  }, 60_000)

  it('janela que não cabe na foto depois do ajuste: JANELA_NAO_CABE, nada composto', async () => {
    await montar((_x, y) => (y < 960 ? 40 : 210), { width: 1920, height: 1920 })
    const e = await erro(comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: { x: 0, y: 0, width: 1, height: 0.2 } } }, { somenteAvaliar: true }))
    expect(e).toBeInstanceOf(CreativeError)
    expect(e!.code).toBe('JANELA_NAO_CABE')
  }, 60_000)

  it('janela com seleção experimental ou sem foto é recusada na spec, antes de qualquer leitura', async () => {
    await montar()
    const comSelecao = await erro(comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: JANELA }, selecaoExperimental: true, fotosCandidatas: ['foto-sintetica'] }, { somenteAvaliar: true }))
    expect(comSelecao!.code).toBe('SPEC_INVALIDA')
    expect(comSelecao!.message).toMatch(/janela/)
    const semFoto = await erro(comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { janela: JANELA } }, { somenteAvaliar: true }))
    expect(semFoto!.code).toBe('SPEC_INVALIDA')
    const asDuas = await erro(comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', janela: JANELA, corte: 'center-top' } }, { somenteAvaliar: true }))
    expect(asDuas!.code).toBe('SPEC_INVALIDA')
  }, 60_000)

  it('a âncora efetiva da página (`foto.corte`) vale como o corte único, gravando cropPosition como sempre', async () => {
    await montar()
    const r = await comporPeca({ ...specSintetica({ pagina: 'f2a', blocos: BLOCOS }), foto: { driveFileId: 'foto-sintetica', corte: 'center-top' }, arquetipo: { id: 'minimal-fb-topo-esquerda' } }, { somenteAvaliar: true })
    const fundo = r.layers.find((l) => l.id === 'bg-foto')!
    expect(fundo.style?.cropPosition).toBe('center-top')
    expect(fundo.style?.crop).toBeUndefined()
    expect(r.diagnostico.arquetipo!.buscaEspacial?.cortesAvaliados).toEqual(['center-top'])
  }, 60_000)
})
