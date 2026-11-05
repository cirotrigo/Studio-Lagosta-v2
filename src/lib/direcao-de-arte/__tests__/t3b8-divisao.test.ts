/**
 * #8 `minimal-divisao-foto-topo@1` (T3-B, 24/10/2026) no COMPOSITOR e no MEDIDOR reais, com FONTES REAIS (Georgia e
 * Montserrat, `createServerTextBoxMeasurer`). Dublados: banco (o cenário em memória, mais as combinações salvas), Blob (a
 * persistência só captura a entrada), registro de fontes, autofix, acervo (o catálogo do cenário). A foto vem por URL de
 * identidade fixa e os bytes pelo dublê do fetch: nada de Drive, Blob ou rede. Marca sintética — não é aceite de marca real.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>>, combinacoes: [] as Array<Record<string, unknown>>, preparos: 0 }))

vi.mock('@/lib/db', async () => {
  const { cenario: c, mockDoBanco } = await import('./suporte/compositor')
  const base = mockDoBanco().db as Record<string, any>
  return {
    db: {
      ...base,
      project: { findUnique: async (args: unknown) => ({ ...(await base.project.findUnique(args)), titleFontFamily: 'Georgia', bodyFontFamily: 'Montserrat', subtitleFontFamily: null }) },
      // As páginas de assinatura do cenário, respeitando o filtro por id (o medir-copy pede "as outras").
      page: {
        ...base.page,
        findMany: async (args?: { where?: { id?: { in?: string[]; not?: string } } }) =>
          c.atual!.paginasDeAssinatura.filter((p) => (!args?.where?.id?.in || args.where.id.in.includes(p.id)) && (!args?.where?.id?.not || p.id !== args.where.id.not)),
      },
      fontCombination: { findMany: async () => cap.combinacoes },
    },
  }
})
vi.mock('@/lib/creatives/persist', async () => ({
  ...(await import('./suporte/compositor')).mockDaPersistencia(),
  persistAndRenderCreative: async (e: Record<string, any>) => {
    cap.entradas.push(e)
    return { generationId: `g-${cap.entradas.length}`, pageId: `p-${cap.entradas.length}`, url: 'https://blob.test/arte.png' }
  },
}))
vi.mock('@/lib/compositor/pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/brand/voz-service', () => ({ carimboDaVozAgora: async () => null }))
vi.mock('@/lib/posts/register-project-fonts', async () => (await import('./suporte/compositor')).mockDasFontes())
vi.mock('@/lib/creatives/server-text-measurer', async () => (await import('./suporte/compositor')).mockDoMedidor())
vi.mock('@/lib/creatives/text-autofix', async () => (await import('./suporte/compositor')).mockDoAutofix())
vi.mock('@/lib/creatives/uso-de-foto', async () => (await import('./suporte/compositor')).mockDoUsoDeFoto())
vi.mock('@/lib/creatives/acervo', async () => (await import('./suporte/compositor')).mockDoAcervo())
vi.mock('@/lib/assets/gradients-library', async (original) => ({
  ...(await original<typeof import('@/lib/assets/gradients-library')>()),
  gradientesDoProjeto: (await import('./suporte/compositor')).gradientesDoCenario,
}))
// Espião da preparação: conta as chamadas sem trocar o comportamento (G-F10).
vi.mock('@/lib/compositor/preparar-blocos', async (original) => {
  const real = await original<typeof import('@/lib/compositor/preparar-blocos')>()
  return { ...real, prepararBlocos: (...a: Parameters<typeof real.prepararBlocos>) => (cap.preparos++, real.prepararBlocos(...a)) }
})

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarAssinatura, comporPeca, luzMediaDaFoto, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { LUZ_DE_FOTO_CLARA } from '@/lib/compositor/assinatura'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { gateDaMedida } from '@/lib/creatives/revisao/gate'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { medida as medidaDoGate } from '@/lib/creatives/revisao/__tests__/suporte/corpus-do-gate'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { BRANCO, CLARO_8, ESCURO_8, ID_DIVISAO, PROJETO_8, TINTA_8, cenario8, copy8, fontesNoDisco, fotoDoCenario8, medidorComFontesReais, paginaDoCenario8, spec8 } from './suporte/cenario-8'

let real: { medir: MeasureTextBox } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real.medir
}
type OpcoesDaPagina = Parameters<typeof paginaDoCenario8>[1]
async function montar(id: string, opcoes: { pagina?: OpcoesDaPagina; cenario?: Parameters<typeof cenario8>[2]; outras?: Array<[string, OpcoesDaPagina & { tags?: string[] }]>; tags?: string[] } = {}) {
  const pagina = { ...(await paginaDoCenario8(id, opcoes.pagina)), tags: opcoes.tags ?? [] }
  const outras = await Promise.all((opcoes.outras ?? []).map(async ([oid, o]) => ({ ...(await paginaDoCenario8(oid, o)), tags: o?.tags ?? [] })))
  cenario.atual = await cenario8(pagina, await medidorReal(), opcoes.cenario)
  cenario.atual.paginasDeAssinatura = [pagina, ...outras]
}
async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}) {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture', ...opcoes })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}
async function recusa(promessa: Promise<unknown>): Promise<{ code: string; message: string; status?: number; details?: Record<string, any> }> {
  try {
    await promessa
  } catch (e) {
    return e as { code: string; message: string; details?: Record<string, any> }
  }
  throw new Error('esperava recusa')
}
/** A recusa ANTES de gravar: a persistência (dublê) não foi chamada. */
async function recusaSemGravar(promessa: Promise<unknown>) {
  const antes = cap.entradas.length
  const e = await recusa(promessa)
  expect(cap.entradas.length, 'nada pode ser gravado numa recusa').toBe(antes)
  return e
}
const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const TEXTOS = ['headline', 'headline2', 'apoio', 'servico']
const textosDa = (r: ResultadoDaComposicao) => r.layers.filter((l) => TEXTOS.includes(l.id))
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const HARD = { story: { x0: 92, x1: 988, y1: 1696 }, feed: { x0: 92, x1: 988, y1: 1246 } } as const
const CAIXA = { story: 1152, feed: 783 } as const
const def8 = verArquetipo(ID_DIVISAO, 1)!
const medir8 = (s: Record<string, any>, extra: Record<string, unknown> = {}) =>
  medirCopyDoProjeto({ projectId: PROJETO_8, formato: s.formato, copyAutoral: s.copyAutoral, ...(s.foto?.url ? { fotoUrl: s.foto.url } : {}), ...(s.foto?.driveFileId ? { fotoDriveId: s.foto.driveFileId } : {}), ...(s.preferencias?.variante ? { variante: s.preferencias.variante } : {}), arquetipo: s.arquetipo, ...extra })

describe.skipIf(!fontesNoDisco())('#8 · divisão com foto no alto, compositor e medidor reais, fontes reais', () => {
  for (const formato of ['story', 'feed'] as const) {
    for (const papel of ['escuro', 'claro'] as const) {
      it(`G-C1/G-G3/G-C3/G-F1/G-M1/G-M2 ${formato} · papel ${papel}: foto na caixa, texto no liso dentro do HARD, régua ok, compor = medir`, async () => {
        const tinta = papel === 'escuro' ? BRANCO : TINTA_8
        const esperado = papel === 'escuro' ? ESCURO_8 : CLARO_8
        await montar(`d8-${formato}-${papel}`, { pagina: { tinta } })
        const s = spec8(`d8-${formato}-${papel}`, { formato, copyAutoral: copy8({ manchete: ['Noite de', 'vinhos'], voz2: [1], apoio: ['Harmonização com o chef da casa'], servico: ['Sexta, 14/11 · 20h'] }) })
        const { r, entrada } = await compor(s)
        // G-F1 / G-M2: o mesmo fundo no resultado, na Page gravada e no diagnóstico.
        expect([r.fundo, entrada!.background, r.diagnostico.papelDoFundo!.cor, r.diagnostico.papelDoFundo!.papel]).toEqual([esperado, esperado, esperado, papel])
        expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_DIVISAO, versao: 1, impressao: impressaoDoArquetipo(def8) })
        // G-C1: a foto na caixa, mesmo id, cover, o corte escolhido.
        const bg = camada(r, 'bg-foto')
        expect([bg.position, bg.size, (bg.style as any).objectFit, (bg.style as any).cropPosition]).toEqual([{ x: 0, y: 0 }, { width: 1080, height: CAIXA[formato] }, 'cover', r.diagnostico.foto!.corte])
        expect(r.diagnostico.foto).toMatchObject({ caixa: { x: 0, y: 0, width: 1080, height: CAIXA[formato] }, corte: 'center-middle' })
        // G-C2 (sem gradiente na página): nenhuma camada de gradiente; nenhuma leitura de tratamento.
        expect(r.layers.filter((l) => l.type === 'gradient' || l.type === 'gradient2')).toEqual([])
        expect(r.diagnostico.tratamentoDeLeitura).toBeUndefined()
        // G-G3: todo texto e a logo dentro do HARD e abaixo da caixa da foto (nenhum pixel de caixa de texto sobre ela).
        const pecas = [...textosDa(r), camada(r, 'logo')]
        expect(pecas.map((l) => l.id).sort()).toEqual(['apoio', 'headline', 'headline2', 'logo', 'servico'])
        for (const l of pecas) {
          expect(l.position.y, `${l.id} y`).toBeGreaterThanOrEqual(CAIXA[formato])
          expect(l.position.x, `${l.id} x0`).toBeGreaterThanOrEqual(HARD[formato].x0 - 1)
          expect(l.position.x + l.size.width, `${l.id} x1`).toBeLessThanOrEqual(HARD[formato].x1 + 1)
          expect(l.position.y + l.size.height, `${l.id} y1`).toBeLessThanOrEqual(HARD[formato].y1 + 1)
        }
        // G-C3: a régua com todos os textos ok no papel escolhido; a logo legível (CP3).
        const textosMedidos = (r.diagnostico.contraste ?? []).flatMap((m) => m.textos ?? [])
        expect(textosMedidos.map((t) => t.camada).sort()).toEqual(['apoio', 'headline', 'headline2', 'servico'])
        expect(textosMedidos.filter((t) => !t.ok), JSON.stringify(textosMedidos)).toEqual([])
        expect((r.diagnostico.logo as any).legibilidade).toMatchObject({ estado: 'medida', legivel: true })
        // Só a partida: uma faixa, posição na referência (sem busca pela foto).
        expect(r.diagnostico.arquetipo!.buscaEspacial!.escolha).toMatchObject({ corte: 'center-middle' })
        // G-M1 / G-M2: o medir-copy, no MESMO contexto (a mesma identidade de foto), dá as mesmas caixas, o mesmo papel e nenhuma recusa.
        const m = await medir8(s)
        expect([m.fundo, m.medicao.fundo, m.medicao.cabeTudo, m.escolhaProvisoria]).toEqual([esperado, esperado, true, false])
        expect(m.fixacao.arquetipo).toEqual(entrada!.fieldValues.spec.arquetipo)
        for (const id of ['headline', 'apoio', 'servico', 'logo'] as const) {
          const pos = m.medicao.arquetipo!.posicoes![id]!.posicao
          const l = camada(r, id)
          expect([Math.round(pos.x), Math.round(pos.y)], id).toEqual([Math.round(l.position.x), Math.round(l.position.y)])
        }
      }, 120_000)
    }
  }

  it('G-C2: a página de assinatura com gradiente de leitura → nenhum véu na peça, e o aviso dito', async () => {
    await montar('d8-grad', { pagina: { gradiente: true } })
    const { r } = await compor(spec8('d8-grad'))
    expect(r.layers.filter((l) => l.type === 'gradient' || l.type === 'gradient2')).toEqual([])
    expect(r.diagnostico.gradientes).toEqual([])
    expect(r.diagnostico.avisos.join(' ')).toMatch(/não pousa na foto: o gradiente de leitura da página de assinatura não entra/)
  }, 120_000)

  it('G-F2: texto escuro e marca SEM fundoClaro → ARQUETIPO_FUNDO_INDISPONIVEL origem contraste, no compor e no medir, nada gravado', async () => {
    await montar('d8-semclaro', { pagina: { tinta: TINTA_8 }, cenario: { assinatura: { fundo: ESCURO_8 } } })
    const e = await recusaSemGravar(comporPeca(spec8('d8-semclaro'), { autor: 'u' }))
    expect([e.code, e.status, e.details!.origem, e.details!.fundoClaro]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 422, 'contraste', null])
    const em = await recusa(medir8(spec8('d8-semclaro')))
    expect([em.code, em.details!.origem]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', 'contraste'])
  }, 120_000)

  it('G-F5/G-F6: a voz 2 ATIVA preta entra (recusa que nomeia headline2); a voz 2 configurada e não usada não entra', async () => {
    await montar('d8-voz2', { pagina: { cores: { headline: BRANCO, headline2: '#000000', apoio: BRANCO, servico: BRANCO } } })
    const ativa = spec8('d8-voz2', { copyAutoral: copy8({ manchete: ['Noite de', 'vinhos'], voz2: [1] }) })
    const e = await recusaSemGravar(comporPeca(ativa, { autor: 'u' }))
    expect(e.code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
    expect(e.details!.tintas.filter((t: any) => t.cor === '#000000').map((t: any) => t.camada)).toEqual(['headline2'])
    expect(e.details!.folgas.find((f: any) => f.papel === 'escuro').reprovadas.map((x: any) => x.camada)).toEqual(['headline2'])
    const { r } = await compor(spec8('d8-voz2', { copyAutoral: copy8({ manchete: ['Noite de vinhos'] }) }))
    expect(r.layers.some((l) => l.id === 'headline2')).toBe(false)
    expect([r.fundo, r.diagnostico.papelDoFundo!.tintas.some((t) => t.cor === '#000000')]).toEqual([ESCURO_8, false])
  }, 120_000)

  it('G-F7: o ARRANJO salvo com tinta diferente da assinatura vence — e é a tinta dele que decide o papel', async () => {
    // Controle: sem a combinação salva, o serviço sai na tinta da assinatura (branco) e o papel é o escuro.
    cap.combinacoes = []
    await montar('d8-arranjo')
    const { r: controle } = await compor(spec8('d8-arranjo'))
    expect(controle.fundo).toBe(ESCURO_8)
    const grupoDoServico = controle.diagnostico.arranjos.find((a) => a.id.includes('servico') || a.grupo.includes('servico'))!.grupo
    cap.combinacoes = [
      {
        id: 'serv-preto',
        name: 'Serviço preto',
        elements: [{ id: 'serv', label: 'Serviço', role: 'body', papel: 'servico', text: 'Sexta · 20h', fontSize: 28, fontWeight: '600', lineHeight: 1.2, color: '#000000', x: 0.085, y: 0.84, width: 0.6, height: 0.04, alturaDeBase: 1920 }],
      },
    ]
    try {
      const fixado = spec8('d8-arranjo', { preferencias: { variante: 'd8-arranjo', arranjos: [{ grupo: grupoDoServico, arranjo: 'combinacao:serv-preto' }] } })
      const e = await recusaSemGravar(comporPeca(fixado, { autor: 'u' }))
      expect(e.code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
      expect(e.details!.tintas.filter((t: any) => t.cor === '#000000').map((t: any) => t.camada)).toEqual(['servico'])
    } finally {
      cap.combinacoes = []
    }
  }, 120_000)

  it('G-F8/G-F9: destaque EFETIVO (a alternativa, quando o fill colide) entra; destaque configurado sem [colchetes] não cria trecho', async () => {
    await montar('d8-destaque', { cenario: { assinatura: { fundo: ESCURO_8, fundoClaro: CLARO_8, destaque: { fill: '#FFFFFF', alternativa: '#E8C547' } } } })
    const { r } = await compor(spec8('d8-destaque', { copyAutoral: copy8({ manchete: ['Noite de [vinhos]'] }) }))
    const tintas = r.diagnostico.papelDoFundo!.tintas
    expect(tintas.filter((t) => t.origem === 'trecho').map((t) => [t.camada, t.cor])).toEqual([['headline', '#E8C547']])
    expect(tintas.some((t) => t.origem === 'trecho' && t.cor === '#FFFFFF')).toBe(false)
    expect(r.fundo).toBe(ESCURO_8)
    const { r: sem } = await compor(spec8('d8-destaque', { copyAutoral: copy8({ manchete: ['Noite de vinhos'] }) }))
    expect(sem.diagnostico.papelDoFundo!.tintas.every((t) => t.origem === 'base')).toBe(true)
    expect(sem.fundo).toBe(ESCURO_8)
  }, 120_000)

  it('G-F11 (peça real): destaque cobre 100% da manchete → a base branca não entra e o papel é o CLARO; sem o destaque, a base entra e recusa', async () => {
    const pagina = { cores: { headline: BRANCO, headline2: BRANCO, apoio: TINTA_8, servico: TINTA_8 } }
    await montar('d8-integral', { pagina, cenario: { assinatura: { fundo: ESCURO_8, fundoClaro: CLARO_8, destaque: { fill: '#000000' } } } })
    const { r } = await compor(spec8('d8-integral', { copyAutoral: copy8({ manchete: ['[Noite de vinhos]'] }) }))
    expect(r.diagnostico.papelDoFundo!.tintas.filter((t) => t.camada === 'headline').map((t) => [t.cor, t.origem])).toEqual([['#000000', 'trecho']])
    expect(r.fundo).toBe(CLARO_8)
    const e = await recusaSemGravar(comporPeca(spec8('d8-integral', { copyAutoral: copy8({ manchete: ['Noite de vinhos'] }) }), { autor: 'u' }))
    expect([e.code, e.details!.tintas.find((t: any) => t.camada === 'headline').cor]).toEqual(['ARQUETIPO_FUNDO_INDISPONIVEL', BRANCO])
  }, 120_000)

  it('G-F10: UMA preparação — avaliar dois papéis (ou um) não prepara de novo nem troca a variante', async () => {
    const preparos = async (assinatura: Record<string, unknown>, tinta: string) => {
      await montar('d8-prep', { pagina: { tinta }, cenario: { assinatura } })
      const antes = cap.preparos
      const { r } = await compor(spec8('d8-prep'))
      return { n: cap.preparos - antes, variante: r.diagnostico.assinatura.pageId, candidatos: r.diagnostico.papelDoFundo!.folgas.length, fundo: r.fundo }
    }
    const doisEscuro = await preparos({ fundo: ESCURO_8, fundoClaro: CLARO_8 }, BRANCO)
    const doisClaro = await preparos({ fundo: ESCURO_8, fundoClaro: CLARO_8 }, TINTA_8)
    const umSo = await preparos({ fundo: ESCURO_8 }, BRANCO)
    expect([doisEscuro.candidatos, doisClaro.candidatos, umSo.candidatos]).toEqual([2, 2, 1])
    expect([doisEscuro.fundo, doisClaro.fundo, umSo.fundo]).toEqual([ESCURO_8, CLARO_8, ESCURO_8])
    expect(doisEscuro.n).toBeGreaterThan(0)
    expect(new Set([doisEscuro.n, doisClaro.n, umSo.n]).size).toBe(1)
    expect([doisEscuro.variante, doisClaro.variante, umSo.variante]).toEqual(['d8-prep', 'd8-prep', 'd8-prep'])
  }, 120_000)

  it('G-C4: a LUZ da foto não muda a variante — a mesma identidade com bytes claros e escuros (controle: num modelo de foto, a luz decide)', async () => {
    const outras: Array<[string, OpcoesDaPagina & { tags?: string[] }]> = [['d8-luz-escura', { tags: ['escura'] }]]
    // Controle: a escolha de variante com luz decide entre a página `clara` e a `escura` (a regra de hoje).
    await montar('d8-luz-clara', { tags: ['clara'], outras })
    const chave = 'controle'
    const comLuz = async (luz: number) => (await carregarAssinatura(PROJETO_8, 'story', { luzDaFoto: luz, chave, papeis: ['headline', 'apoio', 'servico'] })).origem.pageId
    expect([await comLuz(230), await comLuz(20)]).toEqual(['d8-luz-clara', 'd8-luz-escura'])
    // E as duas fotos do teste caem em lados OPOSTOS do limiar (sem o #8 neutralizar a luz, a escolha mudaria).
    const luzes = [await luzMediaDaFoto(await fotoDoCenario8({ width: 1080, height: 1350 }), CANVAS.story), await luzMediaDaFoto(await fotoDoCenario8({ width: 1080, height: 1350 }, { escura: true }), CANVAS.story)]
    expect([luzes[0]! > LUZ_DE_FOTO_CLARA, luzes[1]! > LUZ_DE_FOTO_CLARA]).toEqual([true, false])
    // #8, MESMA identidade (FOTO_URL), sem preferencias.variante: bytes claros e escuros → a mesma variante, arranjos e papel.
    const semVariante = (extra: Record<string, unknown> = {}) => ({ ...spec8('x'), preferencias: {}, ...extra })
    const rodar = async (escura: boolean, extra: Record<string, unknown> = {}) => {
      await montar('d8-luz-clara', { tags: ['clara'], outras, cenario: { foto: await fotoDoCenario8({ width: 1080, height: 1350 }, { escura }) } })
      const { r } = await compor(semVariante(extra))
      return { variante: r.diagnostico.assinatura.pageId, arranjos: r.diagnostico.arranjos.map((a) => a.id), fundo: r.fundo, pos: textosDa(r).map((l) => [l.id, l.position.x, l.position.y]) }
    }
    const [clara, escura] = [await rodar(false), await rodar(true)]
    expect(escura).toEqual(clara)
    // Identidades DIFERENTES com variante e arranjos fixados → idem.
    const fixados = { preferencias: { variante: clara.variante, arranjos: [] } }
    const a = await rodar(false, { ...fixados, foto: { url: 'https://fotos.test/outra-a.png' } })
    const b = await rodar(true, { ...fixados, foto: { url: 'https://fotos.test/outra-b.png' } })
    expect([a.variante, a.fundo, a.pos]).toEqual([b.variante, b.fundo, b.pos])
  }, 180_000)

  it('G-C5/G-N2: manchete de 2 linhas com voz 2, apoio de 2 linhas na largura toda e [destaque] cabem; 3 linhas, serviço de 2 e texto longo recusam', async () => {
    await montar('d8-cabe', { cenario: { assinatura: { fundo: ESCURO_8, fundoClaro: CLARO_8, destaque: { fill: '#E8C547' } } } })
    for (const formato of ['story', 'feed'] as const) {
      const cheia = copy8({ manchete: ['Noite de', '[vinhos]'], voz2: [1], apoio: ['Harmonização com o chef da', 'casa e música ao vivo'], servico: ['Sexta, 14/11 · 20h'] })
      const { r } = await compor(spec8('d8-cabe', { formato, copyAutoral: cheia }))
      expect(r.diagnostico.avisos.filter((a) => /AJUSTE_FINAL/.test(a))).toEqual([])
      expect(textosDa(r).map((l) => l.id).sort()).toEqual(['apoio', 'headline', 'headline2', 'servico'])
    }
    expect((await recusaSemGravar(comporPeca(spec8('d8-cabe', { copyAutoral: copy8({ manchete: ['Noite', 'de', 'vinhos'] }) }), { autor: 'u' }))).code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
    expect((await recusaSemGravar(comporPeca(spec8('d8-cabe', { copyAutoral: copy8({ manchete: ['Noite'], servico: ['Sexta', '20h'] }) }), { autor: 'u' }))).code).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
    const longa = await recusaSemGravar(comporPeca(spec8('d8-cabe', { copyAutoral: copy8({ manchete: ['Uma noite inteira de vinhos raros e queijos'] }) }), { autor: 'u' }))
    expect(longa.code).toBe('ARQUETIPO_TEXTO_NAO_CABE')
    expect(longa.details!.orcamento.length).toBeGreaterThan(0)
  }, 180_000)

  it('G-P1/G-P2/G-P3: o corte é escolhido pela CAIXA — assunto embaixo → center-bottom (pela tela do Feed só haveria o central); assunto que não cabe → SEM_COMBINACAO; sem catálogo ou fixo → central', async () => {
    const foto = await fotoDoCenario8({ width: 1080, height: 1350 }, { assunto: [0.75, 0.95] })
    const comCatalogo = (assunto: { x0: number; y0: number; x1: number; y1: number }) => ({ foto, catalogo: { driveFileId: 'drive-8', assunto } })
    const specDrive = (extra: Record<string, unknown> = {}) => spec8('d8-corte', { formato: 'feed', foto: { driveFileId: 'drive-8' }, ...extra })
    await montar('d8-corte', { cenario: comCatalogo({ x0: 0.34, y0: 0.75, x1: 0.66, y1: 0.95 }) })
    const { r } = await compor(specDrive())
    expect(r.diagnostico.foto).toMatchObject({ corte: 'center-bottom', escala: 1 })
    expect(r.diagnostico.foto!.assuntoVisivel!).toBeGreaterThanOrEqual(0.75)
    expect([(camada(r, 'bg-foto').style as any).cropPosition, r.diagnostico.arquetipo!.buscaEspacial!.escolha.corte]).toEqual(['center-bottom', 'center-bottom'])
    // Assunto mais alto que a caixa (0,05–0,95 de 1350 = 1215 px contra 783): nenhum corte mostra 75%.
    await montar('d8-corte', { cenario: comCatalogo({ x0: 0.34, y0: 0.05, x1: 0.66, y1: 0.95 }) })
    const e = await recusaSemGravar(comporPeca(specDrive(), { autor: 'u' }))
    expect([e.code, e.details!.motivo]).toEqual(['SEM_COMBINACAO', 'CORTE_PERDE_O_ASSUNTO'])
    // Enquadramento fixo com o assunto embaixo: o central perde, o de baixo resolveria → PREFERENCIA_INVIAVEL.
    await montar('d8-corte', { cenario: comCatalogo({ x0: 0.34, y0: 0.75, x1: 0.66, y1: 0.95 }) })
    const fixo = await recusaSemGravar(comporPeca(specDrive({ preferencias: { variante: 'd8-corte', enquadramento: 'fixo' } }), { autor: 'u' }))
    expect([fixo.code, fixo.details!.alternativa.corte]).toEqual(['PREFERENCIA_INVIAVEL', 'center-bottom'])
    // Fixo com o assunto no meio, e sem catálogo: o central.
    await montar('d8-corte', { cenario: comCatalogo({ x0: 0.34, y0: 0.4, x1: 0.66, y1: 0.6 }) })
    expect((await compor(specDrive({ preferencias: { variante: 'd8-corte', enquadramento: 'fixo' } }))).r.diagnostico.foto!.corte).toBe('center-middle')
    await montar('d8-corte', { cenario: { foto } })
    expect((await compor(spec8('d8-corte', { formato: 'feed' }))).r.diagnostico.foto).toMatchObject({ corte: 'center-middle', assuntoVisivel: null })
  }, 180_000)

  it('G-P4: foto 682×1024 entra ampliada 1,58× (aviso e diagnóstico, sem veto); 1080×1350 no Story, sem aviso', async () => {
    await montar('d8-amplia', { cenario: { foto: await fotoDoCenario8({ width: 682, height: 1024 }) } })
    for (const formato of ['story', 'feed'] as const) {
      const { r } = await compor(spec8('d8-amplia', { formato }))
      expect(r.diagnostico.foto!.escala).toBeCloseTo(1.5836, 3)
      expect(r.diagnostico.avisos.join(' ')).toMatch(/AMPLIADA 1,58×/)
    }
    await montar('d8-amplia', { cenario: { foto: await fotoDoCenario8({ width: 1080, height: 1350 }) } })
    const { r } = await compor(spec8('d8-amplia'))
    expect(r.diagnostico.foto!.escala).toBe(1)
    expect(r.diagnostico.avisos.join(' ')).not.toMatch(/AMPLIADA/)
  }, 120_000)

  it('G-P5/G-M5: sem foto, o compor recusa antes de medir; o medir mede PROVISÓRIO só nas condições de hoje; identidade com bytes ilegíveis não é provisória e o aviso diz', async () => {
    const outras: Array<[string, OpcoesDaPagina & { tags?: string[] }]> = [['d8-prov-b', {}]]
    await montar('d8-prov-a', { outras })
    const semFoto = { ...spec8('d8-prov-a'), foto: undefined }
    expect((await recusaSemGravar(comporPeca(semFoto, { autor: 'u' }))).code).toBe('ARQUETIPO_FOTO_AUSENTE')
    // Sem identidade, sem variante pedida e com outra variante: provisória, com o motivo e a fixação completa.
    const m = await medirCopyDoProjeto({ projectId: PROJETO_8, formato: 'story', copyAutoral: copy8(), arquetipo: { id: ID_DIVISAO } })
    expect(m.escolhaProvisoria).toBe(true)
    expect(m.motivosDaProvisoriedade[0]).toMatch(/sem a foto na spec, a chave do rodízio de variantes/)
    expect(m.fixacao).toMatchObject({ variante: m.variante.id, arquetipo: { id: ID_DIVISAO, versao: 1, impressao: impressaoDoArquetipo(def8) } })
    expect(Array.isArray(m.fixacao.arranjos)).toBe(true)
    // Variante e arranjos fixados, sem foto: NÃO provisória.
    const fixada = await medirCopyDoProjeto({ projectId: PROJETO_8, formato: 'story', copyAutoral: copy8(), arquetipo: { id: ID_DIVISAO }, variante: m.fixacao.variante, preferencias: { arranjos: m.fixacao.arranjos } })
    expect([fixada.escolhaProvisoria, fixada.motivosDaProvisoriedade]).toEqual([false, []])
    // Identidade presente (driveFileId) e bytes ilegíveis (Drive desligado neste ambiente): não provisória; o aviso não diz PROVISÓRIA.
    const ilegivel = await medirCopyDoProjeto({ projectId: PROJETO_8, formato: 'story', copyAutoral: copy8(), arquetipo: { id: ID_DIVISAO }, fotoDriveId: 'drive-8' })
    expect(ilegivel.escolhaProvisoria).toBe(false)
    const aviso = ilegivel.medicao.avisos.find((a) => /a foto não pôde ser lida\/medida/.test(a))!
    expect(aviso).toMatch(/a escolha não muda por isso; o compor precisa da foto/)
    expect(aviso).not.toMatch(/PROVIS/)
    // Controle (arquétipo de FOTO, a mesma identidade ilegível): o aviso e o booleano de hoje, byte a byte.
    const deFoto = await medirCopyDoProjeto({ projectId: PROJETO_8, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Noite de vinhos'] }, { papel: 'servico', linhas: ['Sexta · 20h'] }], arquetipo: { id: 'minimal-fb-topo-esquerda' }, fotoDriveId: 'drive-8' })
    expect(deFoto.escolhaProvisoria).toBe(true)
    expect(deFoto.medicao.avisos).toContain('a foto não pôde ser lida/medida: a escolha da variante e dos arranjos ficou PROVISÓRIA — repita a medição quando ela carregar, ou fixe `preferencias.variante` e `preferencias.arranjos` ao compor')
  }, 180_000)

  it('G-M4: cada variante do medir-copy é medida com as TINTAS DELA (e o inverso)', async () => {
    // Marca SEM claro: a variante branca mede no escuro; a escura (outra) não cabe, pelo papel.
    await montar('d8-var-branca', { outras: [['d8-var-escura', { tinta: TINTA_8 }]], cenario: { assinatura: { fundo: ESCURO_8 } } })
    const m = await medir8(spec8('d8-var-branca'))
    expect([m.variante.id, m.fundo, m.medicao.fundo]).toEqual(['d8-var-branca', ESCURO_8, ESCURO_8])
    expect(m.outrasVariantes.map((v) => [v.id, v.cabeTudo, v.motivo?.codigo])).toEqual([['d8-var-escura', false, 'ARQUETIPO_FUNDO_INDISPONIVEL']])
    // O inverso: o "escuro" da marca é um cinza médio — a escura mede nele; a branca (outra) não cabe.
    await montar('d8-var-escura', { pagina: { tinta: TINTA_8 }, outras: [['d8-var-branca', { tinta: BRANCO }]], cenario: { assinatura: { fundo: '#9A9A9A' } } })
    const inv = await medir8(spec8('d8-var-escura'))
    expect([inv.variante.id, inv.fundo]).toEqual(['d8-var-escura', '#9A9A9A'])
    expect(inv.outrasVariantes.map((v) => [v.id, v.cabeTudo, v.motivo?.codigo])).toEqual([['d8-var-branca', false, 'ARQUETIPO_FUNDO_INDISPONIVEL']])
  }, 180_000)

  it('G-N1: pré, cta e herdaDe recusados no compor e no medir; nada some', async () => {
    await montar('d8-papeis')
    for (const extra of [{ id: 'convite', funcao: 'pre', linhas: ['Você é convidado'] }, { id: 'site', funcao: 'cta', linhas: ['Reserve'] }]) {
      const s = spec8('d8-papeis', { copyAutoral: copy8({ manchete: ['Noite de vinhos'], extras: [extra] }) })
      const e = await recusaSemGravar(comporPeca(s, { autor: 'u' }))
      expect([e.code, e.details!.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', [extra.funcao]])
      expect((await recusa(medir8(s))).code).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    }
  }, 120_000)

  it('G-N3/G-N4: marca sem logo e logo sem variante legível no papel recusam; quadrado recusa', async () => {
    await montar('d8-semlogo', { cenario: { variantes: [] } })
    cenario.atual!.paginasDeAssinatura[0].layers = cenario.atual!.paginasDeAssinatura[0].layers.filter((l) => l.type !== 'logo')
    const e = await recusaSemGravar(comporPeca(spec8('d8-semlogo'), { autor: 'u' }))
    expect([e.code, e.details!.faltam]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['logo']])
    await montar('d8-logo-escura', { cenario: { variantes: [{ fileUrl: dataUrl(await logoSintetica('#151515')), isProjectLogo: true }] } })
    // A logo da página também é a escura: nenhuma variante autorizada lê no papel escuro.
    const escura = cenario.atual!.projeto.logosDoProjeto![0].fileUrl
    cenario.atual!.paginasDeAssinatura[0].layers = cenario.atual!.paginasDeAssinatura[0].layers.map((l) => (l.type === 'logo' ? { ...l, fileUrl: escura } : l))
    expect((await recusaSemGravar(comporPeca(spec8('d8-logo-escura'), { autor: 'u' }))).code).toBe('LOGO_SEM_VARIANTE_LEGIVEL')
    await montar('d8-quadrado')
    expect((await recusaSemGravar(comporPeca(spec8('d8-quadrado', { formato: 'quadrado' }), { autor: 'u' }))).code).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
  }, 120_000)

  it('G-N5: o gate de autonomia numa peça #8 sai "texto-sobre-assunto" NÃO comprovada → revisão humana (fail-closed), sem problema falso', async () => {
    await montar('d8-gate')
    const { r } = await compor(spec8('d8-gate'))
    const { gate } = gateDaMedida({ medida: medidaDoGate({ camadas: r.layers, formato: 'story' }), identidade: { pageVersion: 'v1:teste', copyVersion: 'c1' }, copy: { estado: 'sem-mudanca', lacunas: [] }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE })
    expect(gate.cobertura['texto-sobre-assunto']).toMatchObject({ estado: 'nao-comprovada' })
    expect(JSON.stringify(gate.cobertura['texto-sobre-assunto'])).toMatch(/caixa diferente do canvas/)
    expect(gate.resultado).toBe('REVISAO_HUMANA_NECESSARIA')
    expect(gate.achados.filter((a) => a.regra === 'texto-sobre-assunto')).toEqual([])
  }, 120_000)

  // G-E1: as provas visuais do servidor (evidência para o owner, não aceite). Só com PROVAS_DIR.
  it.skipIf(!process.env.PROVAS_DIR)('provas visuais: PNG + JSON Story/Feed × papel escuro/claro', async () => {
    const dir = process.env.PROVAS_DIR!
    mkdirSync(dir, { recursive: true })
    for (const formato of ['story', 'feed'] as const) {
      for (const papel of ['escuro', 'claro'] as const) {
        await montar(`prova-${formato}-${papel}`, { pagina: { tinta: papel === 'escuro' ? BRANCO : TINTA_8 }, cenario: { assinatura: { fundo: ESCURO_8, fundoClaro: CLARO_8, destaque: { fill: papel === 'escuro' ? '#E8C547' : '#9C4A1A' } } } })
        const s = spec8(`prova-${formato}-${papel}`, { formato, copyAutoral: copy8({ manchete: ['Noite de', '[vinhos]'], voz2: [1], apoio: ['Harmonização com o chef da', 'casa e música ao vivo'], servico: ['Sexta, 14/11 · 20h'] }) })
        const r = await comporPeca(s, { provar: true })
        writeFileSync(join(dir, `t3b8-divisao-${formato}-${papel}.png`), r.prova!)
        writeFileSync(
          join(dir, `t3b8-divisao-${formato}-${papel}.json`),
          JSON.stringify(
            {
              marca: 'sintética (#8, cenario-8.ts) — não é marca real',
              arquetipo: `${ID_DIVISAO}@1`,
              impressao: impressaoDoArquetipo(def8),
              formato,
              fundo: r.fundo,
              papelDoFundo: r.diagnostico.papelDoFundo,
              foto: r.diagnostico.foto,
              logo: (r.diagnostico.logo as any)?.legibilidade ? { legivel: (r.diagnostico.logo as any).legibilidade.legivel, escolha: (r.diagnostico.logo as any).legibilidade.escolha } : null,
              contraste: (r.diagnostico.contraste ?? []).flatMap((m) => m.textos ?? []).map((t) => ({ camada: t.camada, ok: t.ok, alvo: t.alvo, p98: t.p98ComHalo, sentido: t.sentido })),
              camadas: r.layers.map((l: Layer) => ({ id: l.id, type: l.type, x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height, ...(l.content ? { content: l.content } : {}), ...((l.style as any)?.color ? { cor: (l.style as any).color } : {}), ...((l.style as any)?.cropPosition ? { corte: (l.style as any).cropPosition } : {}) })),
              avisos: r.diagnostico.avisos,
            },
            null,
            1,
          ),
        )
        expect(r.prova!.length).toBeGreaterThan(1000)
      }
    }
  }, 240_000)
})
