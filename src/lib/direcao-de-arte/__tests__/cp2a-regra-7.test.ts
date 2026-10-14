/**
 * CP2A (14/10/2026) — o que acontece DEPOIS da régua, no compositor real: o
 * véu automático que ela prova pior sai (regra 7), a correção de força que cria
 * piora volta só nos véus envolvidos, e a medida que falha cai na regra
 * anterior, dita. A régua é a de verdade; cada teste só injeta o resultado que
 * precisa provocar. As cores são fixture.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('@/lib/compositor/regua', async (original) => {
  const real = await original<typeof import('@/lib/compositor/regua')>()
  return { ...real, medirContrasteDaPeca: vi.fn(real.medirContrasteDaPeca), medirFundoDosTextos: vi.fn(real.medirFundoDosTextos) }
})

import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { comForca, forcaDaCamada } from '@/lib/compositor/gradiente-de-leitura'
import { medirContrasteDaPeca, medirFundoDosTextos, TRATAMENTO_PIOROU_LEITURA, type PioraDeTratamento } from '@/lib/compositor/regua'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

const CLARO = '#F5F5F5'
const real = await vi.importActual<typeof import('@/lib/compositor/regua')>('@/lib/compositor/regua')

beforeEach(() => {
  vi.mocked(medirContrasteDaPeca).mockReset().mockImplementation(real.medirContrasteDaPeca)
  vi.mocked(medirFundoDosTextos).mockReset().mockImplementation(real.medirFundoDosTextos)
})

const HEADLINE = { papel: 'headline', linhas: ['Sintético'] }
const SERVICO = { papel: 'servico', linhas: ['Seg a sex · 12h às 22h'] }

/** Por padrão, textos claros sobre foto clara: as duas bordas ganham o véu escuro da mancha. */
async function compor(
  id: string,
  c: { luz?: (x: number, y: number) => number; logo?: string; blocos?: Array<{ papel: string; linhas: string[] }>; assinatura?: Record<string, unknown> } = {},
): Promise<ResultadoDaComposicao> {
  const foto = await fotoSintetica(c.luz ?? (() => 205))
  const pagina = paginaSintetica({ id, headline: { cor: CLARO }, servico: { cor: CLARO }, logoUrl: dataUrl(await logoSintetica(c.logo ?? '#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [] })
  cenario.atual = { ...base, projeto: { ...base.projeto, assinatura: c.assinatura ?? { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
  return comporPeca(specSintetica({ pagina: id, blocos: c.blocos ?? [HEADLINE, SERVICO] }), { somenteAvaliar: true })
}

const pioraNoServico = (depois: number): PioraDeTratamento => ({
  codigo: TRATAMENTO_PIOROU_LEITURA,
  grupo: 'solo:servico',
  camada: 'servico',
  camadas: ['servico'],
  gradiente: 'gradiente-leitura-rodape',
  gradientes: ['gradiente-leitura-rodape'],
  polaridade: 'clara',
  polaridadePor: 'fundo',
  percentil: 'p98',
  antes: 205,
  depois,
  tolerancia: 2,
  luzDoTexto: 245,
})
const plano = (r: ResultadoDaComposicao, borda: 'topo' | 'rodape') => r.diagnostico.tratamentoDeLeitura?.find((t) => t.borda === borda)

describe('regra 7: o véu automático que a régua prova pior sai da peça', () => {
  it('a régua acusa TRATAMENTO_PIOROU_LEITURA no serviço sob o véu do rodapé: o véu sai, a borda fica "recusado", com a cor, a força e o aviso', async () => {
    vi.mocked(medirContrasteDaPeca).mockImplementationOnce(async (args) => ({ ...(await real.medirContrasteDaPeca(args)), pioras: [pioraNoServico(215)], piorasDepoisDaCorrecao: undefined }))
    const r = await compor('cp2a-r7-recusa')
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-rodape')).toBe(false)
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-topo')).toBe(true)
    expect(plano(r, 'rodape')).toMatchObject({ estado: 'recusado', motivo: TRATAMENTO_PIOROU_LEITURA })
    expect(plano(r, 'rodape')?.recusadas).toEqual(expect.arrayContaining([expect.objectContaining({ cor: VEU_ESCURO, motivo: TRATAMENTO_PIOROU_LEITURA, forca: expect.any(Number) })]))
    expect(r.diagnostico.gradientes?.map((g) => g.borda)).toEqual(['topo'])
    expect(r.diagnostico.avisos.some((a) => /Rodapé: o véu #1A1A1A piorou a leitura medida/.test(a))).toBe(true)
    // A última medida é da peça SEM o véu recusado e sem correção.
    expect(vi.mocked(medirContrasteDaPeca).mock.calls.at(-1)?.[0]).toMatchObject({ corrigir: false })
  }, 60_000)

  it('a correção de força que cria piora volta SÓ no véu envolvido (o outro mantém a sua), e a peça é medida de novo sem correção', async () => {
    vi.mocked(medirContrasteDaPeca).mockImplementationOnce(async (args) => {
      const r = await real.medirContrasteDaPeca({ ...args, corrigir: false })
      const corrigidas = r.layers.map((l) => (l.id === 'gradiente-leitura-rodape' || l.id === 'gradiente-leitura-topo' ? comForca(l, 0.9) : l))
      return { ...r, layers: corrigidas, pioras: [], piorasDepoisDaCorrecao: [pioraNoServico(215)] }
    })
    const r = await compor('cp2a-r7-correcao')
    const forca = (borda: string) => forcaDaCamada(r.layers.find((l) => l.id === `gradiente-leitura-${borda}`)!)
    expect(forca('rodape')).toBe(plano(r, 'rodape')!.forca)
    expect(forca('rodape')).toBeLessThan(0.9)
    expect(forca('topo')).toBe(0.9)
    expect(r.diagnostico.avisos.some((a) => /piorava a leitura de servico: gradiente-leitura-rodape ficou na força de antes/.test(a))).toBe(true)
  }, 60_000)
})

describe('a regra 7 não tem porta dos fundos', () => {
  it('a peça sem o véu recusado é conferida de NOVO: se a régua ainda acusa o outro véu automático, ele também sai', async () => {
    const pioraNoTopo: PioraDeTratamento = { ...pioraNoServico(215), camada: 'headline', grupo: 'g-topo', camadas: ['headline'], gradiente: 'gradiente-leitura-topo', gradientes: ['gradiente-leitura-topo'] }
    vi.mocked(medirContrasteDaPeca)
      .mockImplementationOnce(async (args) => ({ ...(await real.medirContrasteDaPeca(args)), pioras: [pioraNoServico(215)], piorasDepoisDaCorrecao: undefined }))
      .mockImplementationOnce(async (args) => ({ ...(await real.medirContrasteDaPeca(args)), pioras: [pioraNoTopo], piorasDepoisDaCorrecao: undefined }))
    const r = await compor('cp2a-r7-de-novo')
    expect(r.layers.filter((l) => l.id.startsWith('gradiente-leitura-'))).toEqual([])
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => [t.borda, t.estado])).toEqual([['topo', 'recusado'], ['rodape', 'recusado']])
  }, 60_000)

  it('o véu da borda que só tem a LOGO também é automático: a régua prova pior, ele sai', async () => {
    const cantoClaro = (x: number, y: number) => (x > 760 && y < 420 ? 235 : 45)
    const pioraSobALogo: PioraDeTratamento = { ...pioraNoServico(60), gradiente: 'gradiente-leitura-topo', gradientes: ['gradiente-leitura-topo'], antes: 50 }
    vi.mocked(medirContrasteDaPeca).mockImplementationOnce(async (args) => ({ ...(await real.medirContrasteDaPeca(args)), pioras: [pioraSobALogo], piorasDepoisDaCorrecao: undefined }))
    const r = await compor('cp2a-r7-logo', { luz: cantoClaro, logo: CLARO, blocos: [SERVICO], assinatura: { mancha: VEU_ESCURO } })
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-topo')).toBe(false)
    expect(r.diagnostico.avisos.some((a) => /Topo: o véu da logo .* piorou a leitura medida/.test(a))).toBe(true)
  }, 60_000)

  it('se a régua não roda, nenhum véu automático fica sem conferência: saem, as bordas ficam "nao-medido" e o aviso diz', async () => {
    vi.mocked(medirContrasteDaPeca).mockRejectedValueOnce(new Error('render indisponível'))
    const r = await compor('cp2a-r7-sem-regua')
    expect(r.layers.filter((l) => l.id.startsWith('gradiente-leitura-'))).toEqual([])
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => t.estado)).toEqual(['nao-medido', 'nao-medido'])
    expect(r.diagnostico.avisos.some((a) => /A régua de contraste não rodou: render indisponível — os véus automáticos .* saíram, sem conferência/.test(a))).toBe(true)
  }, 60_000)
})

describe('medida indisponível', () => {
  it('quando o fundo não pode ser medido, NENHUM véu automático de texto (a regra antiga de uma cor não volta): "nao-medido" e aviso', async () => {
    vi.mocked(medirFundoDosTextos).mockRejectedValueOnce(new Error('render indisponível'))
    const r = await compor('cp2a-nao-medido')
    expect(r.diagnostico.tratamentoDeLeitura?.map((t) => [t.borda, t.estado])).toEqual([['topo', 'nao-medido'], ['rodape', 'nao-medido']])
    expect(r.diagnostico.tratamentoDeLeitura?.filter((t) => t.cor && !t.veuDaLogo)).toEqual([])
    expect(r.layers.some((l) => l.id === 'gradiente-leitura-rodape')).toBe(false)
    expect(r.diagnostico.avisos.some((a) => /não mediu o fundo \(render indisponível\): nenhum véu automático de texto/.test(a))).toBe(true)
  }, 60_000)
})
