/**
 * F2b (02/11/2026) — a JANELA ASSISTIDA no compositor REAL (dublês de banco, persistência, fontes, medidor e acervo; foto
 * sintética; a referência do Brunch injetada pela resolução, com o `assunto` no quadro): a foto nova com caixa ganha a
 * janela que leva o assunto ao alvo; sem caixa, fixo ou pedida, nada muda; a recomposição reproduz; a recusa é dita.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'

const resolucao = vi.hoisted(() => ({ definicoes: [] as unknown[], chamadas: [] as Array<Record<string, unknown>> }))
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
vi.mock('@/lib/compositor/referencias', () => ({
  resolucaoParaASpec: async (_spec: unknown, opcoes: Record<string, unknown>) => {
    resolucao.chamadas.push(opcoes)
    return { definicoes: resolucao.definicoes }
  },
}))

import { comporPeca, type AssistenciaDoAssunto } from '@/lib/compositor/compor'
import { compilarReferencia } from '@/lib/compositor/arquetipos/referencia'
import type { ArquetipoDeLayout, Caixa } from '@/lib/compositor/arquetipos/tipos'
import { fracaoVisivelDoAssunto } from '@/lib/compositor/assunto-da-foto'
import { lerJanela } from '@/lib/compositor/corte-da-foto'
import { assuntoEfetivoDaFoto } from '@/lib/creatives/assunto-da-foto-efetivo'
import { CreativeError } from '@/lib/creatives/errors'
import brunch from '@/lib/compositor/arquetipos/__tests__/suporte/emporio-ref02-brunch.json'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { cenarioSintetico, fotoSintetica, logoSintetica, paginaSintetica, specSintetica, variantesClaraEEscura, VEU_CLARO, VEU_ESCURO } from './suporte/sinteticos'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const PAGINA = brunch as unknown as Pagina
/** Como no F2c: a manchete da Brunch mais alta, para o medidor sintético caber. */
const ALTA: Pagina = { ...PAGINA, layers: PAGINA.layers.map((l) => (l.id === 'titulo' ? ({ ...l, content: 'Brunch\nEmpório\nFonseca', position: { ...l.position, y: 1440 }, size: { ...l.size, height: 260 } } as Layer) : l)) }
const BLOCOS = [
  { papel: 'headline', linhas: ['Café da manhã'] },
  { papel: 'apoio', linhas: ['Sabores da manhã'] },
]
const ALTO_A_DIREITA: Caixa = { x: 0.45, y: 0.12, w: 0.4, h: 0.25 }
const EMBAIXO_A_ESQUERDA = { x0: 0.1, y0: 0.7, x1: 0.3, y1: 0.85 }
const ID = 'foto-sintetica'
const FOTO_GRANDE = { width: 2160, height: 3840 }

const comAlvo = (caixa: Caixa | null, visivel = 1): ArquetipoDeLayout => {
  const c = compilarReferencia(ALTA, { pageVersion: 'v', versao: 1 })
  if (!c.ok) throw new Error('a Brunch deveria compilar')
  if (!caixa) return c.definicao
  return { ...c.definicao, formatos: { ...c.definicao.formatos, story: { ...c.definicao.formatos.story, assunto: { caixa, visivel } } } }
}

async function montar(assunto: { x0: number; y0: number; x1: number; y1: number } | null, dimensoes = FOTO_GRANDE, def = comAlvo(ALTO_A_DIREITA)) {
  const foto = await fotoSintetica(() => 150, dimensoes)
  const pagina = paginaSintetica({ id: 'f2b', headline: { cor: '#F5F5F5' }, apoio: { cor: '#F5F5F5' }, logoUrl: dataUrl(await logoSintetica('#808080')), fundoUrl: dataUrl(foto) })
  const base = await cenarioSintetico({ pagina, foto, candidatasDoVeu: [], logosDoProjeto: await variantesClaraEEscura() })
  cenario.atual = { ...base, catalogo: assunto ? { driveFileId: ID, assunto } : null, projeto: { ...base.projeto, assinatura: { mancha: VEU_ESCURO, gradiente: { cor: VEU_CLARO } } } }
  resolucao.definicoes = [def]
  return def
}
const specDe = (def: ArquetipoDeLayout, foto: Record<string, unknown> = { driveFileId: ID }, preferencias?: Record<string, unknown>) => ({ ...specSintetica({ pagina: 'f2b', blocos: BLOCOS, preferencias }), foto, arquetipo: { id: def.id } })
const assistencia = (r: Awaited<ReturnType<typeof comporPeca>>) => r.diagnostico.posicao.assistencia as AssistenciaDoAssunto
const fundo = (r: Awaited<ReturnType<typeof comporPeca>>) => r.layers.find((l) => l.id === 'bg-foto')!
const escolha = (r: Awaited<ReturnType<typeof comporPeca>>) => r.diagnostico.arquetipo!.buscaEspacial!.escolha
const erro = async (p: Promise<unknown>) => p.then(() => null, (e) => e as CreativeError)

beforeEach(() => {
  resolucao.chamadas.length = 0
})

describe('F2b · a janela assistida no compositor', () => {
  it('foto nova com a caixa embaixo à esquerda e o alvo no alto à direita: a janela da candidata vencedora desenha, o assunto fica ≥ 75 % visível', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    const r = await comporPeca(specDe(def), { somenteAvaliar: true })
    const a = assistencia(r)
    expect(a.estado).toBe('janela-do-assunto')
    expect(a.alvo).toEqual(ALTO_A_DIREITA)
    // A 0,85 cai no teto do zoom, a mesma janela da ideal: não se repete.
    expect(a.candidatas!.map((c) => c.fator)).toEqual([1, 1.15])
    const vencedora = a.candidatas!.find((c) => c.chave === a.vencedora)!
    expect(lerJanela(fundo(r).style?.crop)).toEqual(vencedora.janela)
    expect(fundo(r).style?.cropPosition).toBeUndefined()
    expect(r.diagnostico.assuntoOrigem).toBe('catalogo')
    expect(fracaoVisivelDoAssunto(r.diagnostico.assunto!, { width: 1080, height: 1920 })).toBeGreaterThanOrEqual(0.75)
    expect(vencedora.ajustes).toContain('deslizada')
  }, 60_000)

  it('sem caixa na foto: os cortes de sempre', async () => {
    const def = await montar(null)
    const r = await comporPeca(specDe(def), { somenteAvaliar: true })
    expect(assistencia(r)).toMatchObject({ estado: 'sem-caixa-na-foto', alvo: ALTO_A_DIREITA })
    expect(assistencia(r).candidatas).toBeUndefined()
    expect(r.diagnostico.posicao.crop).not.toBe('janela')
  }, 60_000)

  it('referência sem assunto: sem-assunto-na-referencia', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA, FOTO_GRANDE, comAlvo(null))
    expect(assistencia(await comporPeca(specDe(def), { somenteAvaliar: true })).estado).toBe('sem-assunto-na-referencia')
  }, 60_000)

  it('enquadramento fixo: não há assistência', async () => {
    const def = await montar({ x0: 0.35, y0: 0.4, x1: 0.65, y1: 0.6 })
    const r = await comporPeca(specDe(def, { driveFileId: ID }, { enquadramento: 'fixo' }), { somenteAvaliar: true })
    expect(assistencia(r).estado).toBe('enquadramento-fixo')
    expect(r.diagnostico.posicao.crop).toBe('center-middle')
  }, 60_000)

  it('janela ou âncora pedidas vencem a assistência', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    const janela = { x: 0, y: 0.4, width: 0.6, height: 0.6 }
    const r = await comporPeca(specDe(def, { driveFileId: ID, janela }), { somenteAvaliar: true })
    expect(assistencia(r).estado).toBe('janela-pedida')
    expect(fundo(r).style?.crop).toEqual(janela)
  }, 60_000)

  it('a referência que já cortava o assunto é dita', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA, FOTO_GRANDE, comAlvo(ALTO_A_DIREITA, 0.8))
    expect(assistencia(await comporPeca(specDe(def), { somenteAvaliar: true })).referenciaCortaOAssunto).toBe(true)
  }, 60_000)

  it('geometria inviável nas três: inviavel + motivo, e a peça segue pelos cortes de sempre', async () => {
    const def = await montar({ x0: 0.05, y0: 0.4, x1: 0.95, y1: 0.6 }, { width: 3840, height: 1920 })
    const e = await erro(comporPeca(specDe(def), { somenteAvaliar: true }))
    // Nenhum corte de hoje mostra 75 % desse assunto: a queda para os cortes de sempre acaba na recusa de sempre, com a assistência dita.
    expect(e?.code).toBe('SEM_COMBINACAO')
    expect(e?.details).toMatchObject({ motivo: 'CORTE_PERDE_O_ASSUNTO', assistencia: { estado: 'inviavel', motivo: 'assunto-nao-cabe-no-cover' } })
    const coube = await montar({ x0: 0.35, y0: 0.15, x1: 0.65, y1: 0.3 }, { width: 3840, height: 1920 })
    const r = await comporPeca(specDe(coube), { somenteAvaliar: true })
    expect(assistencia(r)).toMatchObject({ estado: 'inviavel', motivo: 'assunto-nao-cabe-no-cover' })
    expect(r.diagnostico.posicao.crop).not.toBe('janela')
  }, 60_000)

  it('texto que cobriria a caixa em TODOS os candidatos: SEM_COMBINACAO por INVADE_REGIAO_PROTEGIDA, e a referência não muda de faixa', async () => {
    const def = await montar({ x0: 0.1, y0: 0.85, x1: 0.9, y1: 0.95 }, FOTO_GRANDE, comAlvo({ x: 0.05, y: 0.72, w: 0.9, h: 0.2 }))
    const e = await erro(comporPeca(specDe(def), { somenteAvaliar: true }))
    expect([e?.code, (e?.details as { motivo?: string })?.motivo]).toEqual(['SEM_COMBINACAO', 'INVADE_REGIAO_PROTEGIDA'])
    expect((e?.details as { assistencia?: AssistenciaDoAssunto }).assistencia?.estado).toBe('janela-do-assunto')
  }, 60_000)

  it('recomposição: reproduz o mesmo style.crop, por JSON; crop editado adota; crop removido volta à âncora; sem assistência', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    const r1 = await comporPeca(specDe(def), { somenteAvaliar: true })
    const gravada = JSON.parse(JSON.stringify(escolha(r1)))
    const r2 = await comporPeca(specDe(def), { somenteAvaliar: true, reproducao: true, escolhaEspacial: gravada })
    expect(fundo(r2).style?.crop).toEqual(fundo(r1).style?.crop)
    expect(assistencia(r2).estado).toBe('escolha-reproduzida')

    const editada = { ...(fundo(r1).style!.crop as { x: number; y: number; width: number; height: number }), x: 0.01 }
    const r3 = await comporPeca(specDe(def), { somenteAvaliar: true, reproducao: true, escolhaEspacial: { ...gravada, corte: 'janela', janela: editada } })
    expect(fundo(r3).style?.crop).toEqual(editada)

    const r4 = await comporPeca(specDe(def), { somenteAvaliar: true, reproducao: true, escolhaEspacial: { ...gravada, corte: 'center-middle', janela: undefined } })
    expect(r4.diagnostico.posicao.crop).toBe('center-middle')
    expect(fundo(r4).style?.crop).toBeUndefined()
  }, 60_000)

  it('foto trocada na recomposição: busca nova, COM assistência', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    const r1 = await comporPeca(specDe(def), { somenteAvaliar: true })
    const r2 = await comporPeca(specDe(def), { somenteAvaliar: true, reproducao: true, escolhaEspacial: { ...escolha(r1), foto: 'outra-foto' } })
    expect(assistencia(r2).estado).toBe('janela-do-assunto')
    expect(r2.diagnostico.avisos.join(' ')).toMatch(/A foto da peça mudou/)
  }, 60_000)

  it('recomposição com a caixa anotada DEPOIS da peça, no corte que a perde: recusa dita', async () => {
    const QUADRADA = { width: 1920, height: 1920 }
    const def = await montar(null, QUADRADA)
    const r1 = await comporPeca(specDe(def), { somenteAvaliar: true })
    expect(escolha(r1).corte).toBe('center-middle')
    await montar({ x0: 0, y0: 0.4, x1: 0.3, y1: 0.5 }, QUADRADA)
    const e = await erro(comporPeca(specDe(def), { somenteAvaliar: true, reproducao: true, escolhaEspacial: escolha(r1) }))
    expect(e?.code).toBe('ARQUETIPO_CORTE_CONGELADO_PERDE_O_ASSUNTO')
    expect(e?.message).toMatch(/anotada depois desta peça/)
  }, 60_000)

  it('aviso de nitidez só quando a janela amplia a foto no canvas', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA, { width: 1080, height: 1920 })
    const r = await comporPeca(specDe(def), { somenteAvaliar: true })
    expect(r.diagnostico.avisos.join(' ')).toMatch(/A janela amplia a foto \(1080×1920\) 1,\d+× no canvas: confira a nitidez\./)
    const grande = await montar(EMBAIXO_A_ESQUERDA)
    expect((await comporPeca(specDe(grande), { somenteAvaliar: true })).diagnostico.avisos.join(' ')).not.toMatch(/confira a nitidez/)
  }, 60_000)

  it('o mapa injetado (a seleção) vale como o catálogo: a mesma política', async () => {
    const def = await montar(null)
    const mapa = new Map([[ID, assuntoEfetivoDaFoto({ caixaDoAssunto: EMBAIXO_A_ESQUERDA, caixaAnalisadaEm: 'x' }, null)]])
    expect(assistencia(await comporPeca(specDe(def), { somenteAvaliar: true, assuntosDoCatalogo: mapa })).estado).toBe('janela-do-assunto')
  }, 60_000)
})

describe('F2b · a fonte da foto com arquétipo e sem ele', () => {
  const LH3 = (id: string) => `https://lh3.googleusercontent.com/d/${id}=s1920`
  const PROXY = `https://studio.test/api/google-drive/image/${ID}`

  it('com arquétipo, driveFileId + url → ARQUETIPO_FOTO_AMBIGUA (a guarda de sempre)', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    expect((await erro(comporPeca(specDe(def, { driveFileId: ID, url: LH3(ID) }), { somenteAvaliar: true })))?.code).toBe('ARQUETIPO_FOTO_AMBIGUA')
  }, 60_000)

  it('a URL única do proxy com arquétipo: fonte-nao-coerente, nenhuma caixa aplicada, dito', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    const r = await comporPeca(specDe(def, { url: PROXY }), { somenteAvaliar: true })
    expect(r.diagnostico.foto?.assuntoDoCatalogo).toMatchObject({ estado: 'fonte-nao-coerente' })
    expect(assistencia(r).estado).toBe('sem-caixa-na-foto')
    expect(r.diagnostico.assuntoOrigem).not.toBe('catalogo')
  }, 60_000)

  it('sem arquétipo: id diverge da URL, ou proxy → fonte-nao-coerente, e a peça segue pelo estimado', async () => {
    await montar(EMBAIXO_A_ESQUERDA)
    const semArquetipo = (foto: Record<string, unknown>) => ({ ...specSintetica({ pagina: 'f2b', blocos: BLOCOS }), foto })
    const diverge = await comporPeca(semArquetipo({ driveFileId: ID, url: LH3('outra') }), { somenteAvaliar: true })
    expect(diverge.diagnostico.foto?.assuntoDoCatalogo).toMatchObject({ estado: 'fonte-nao-coerente', motivo: 'id-diverge-da-url' })
    expect(diverge.diagnostico.assuntoOrigem).not.toBe('catalogo')
    expect(diverge.diagnostico.posicao.assistencia).toBeUndefined()
    const proxy = await comporPeca(semArquetipo({ driveFileId: ID, url: PROXY }), { somenteAvaliar: true })
    expect(proxy.diagnostico.foto?.assuntoDoCatalogo).toMatchObject({ estado: 'fonte-nao-coerente', motivo: 'url-nao-renderizada-pelo-drive' })
  }, 60_000)
})

describe('F2b · o gancho de prova', () => {
  const leitor = { referenciaDeLayout: { findMany: vi.fn() } } as never

  it('fora de provar e somenteAvaliar recusa antes de qualquer efeito', async () => {
    const e = await erro(comporPeca({ nada: true }, { leitorDeReferencias: leitor }))
    expect([e?.code, e?.status]).toEqual(['OPCAO_SO_DE_PROVA', 400])
    expect(resolucao.chamadas).toEqual([])
  })

  it('com o modo de prova, o leitor vai à resolução', async () => {
    const def = await montar(EMBAIXO_A_ESQUERDA)
    await comporPeca(specDe(def), { somenteAvaliar: true, leitorDeReferencias: leitor })
    expect(resolucao.chamadas[0]).toMatchObject({ cliente: leitor })
  }, 60_000)
})
