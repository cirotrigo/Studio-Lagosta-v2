/**
 * #16 `minimal-tipografico-convite@2` (C2 + margens, 24/10/2026) no COMPOSITOR e no MEDIDOR reais, com FONTES REAIS
 * (Georgia e Montserrat, `createServerTextBoxMeasurer`), o mesmo cenário do #16 pedindo `versao: 2`. Dublados: banco,
 * Blob (a persistência só captura a entrada), registro de fontes, autofix. Marca sintética — não é aceite de marca real.
 *
 * Prova: as camadas pousam onde o preflight previu (±1 px); UMA camada de cantoneiras com o path DERIVADO (braço 130 px
 * nos dois eixos) e a `derivacao` no metadado e na receita gravada; nenhum texto ou logo toca os braços; compor = medir;
 * copy autoral inteira; as recusas herdadas e o CP3 no mesmo centro; três faixas, uma combinação, nenhuma avaliação; e o
 * PNG do renderizador com tinta a 129 px do canto e fundo a 140 px.
 */
import { describe, expect, it, vi } from 'vitest'

const cap = vi.hoisted(() => ({ entradas: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', async () => (await import('./suporte/compositor')).mockDoBanco())
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

import sharp from 'sharp'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { ocupacaoDoAcento } from '@/lib/compositor/arquetipos/acentos'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { blocosLidosDasCamadas } from '@/lib/copy-autoral/efetiva'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { CLARO, COPY_16, DOURADO, ID_CONVITE, cenario16, fontesNoDisco, medidorComFontesReais, paginaDoCenario16, spec16 } from './suporte/cenario-16'

const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
const V2 = verArquetipo(ID_CONVITE, 2)!
const DOURADO_NO_TRACO = 'rgba(176, 141, 87, 1)'
const PATH = {
  // Na margem da marca (29/10/2026) a caixa das cantoneiras segue o piso padrão: 896 × 1508 (topo 188, base 1696) e 896 × 1126 (120, 1246).
  story: 'M0 8.6207 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 8.6207 M100 91.3793 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 91.3793',
  feed: 'M0 11.5453 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 11.5453 M100 88.4547 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 88.4547',
}
/** A caixa da moldura (a do @1) e as posições y que o PREFLIGHT §3.3 previu para a marca sintética. */
const MOLDURA = { story: { x: 92, y: 188, width: 896, height: 1508 }, feed: { x: 92, y: 120, width: 896, height: 1126 } }
const PREVISTO = {
  story: { logo: 188, pre: 538, headline: 676, 'acento-fio': 1004, apoio: 1068, servico: 1275, cta: 1592 },
  feed: { logo: 128, pre: 383, headline: 472, 'acento-fio': 741, apoio: 772, servico: 926, cta: 1152 },
}
/** C2-09: borda → logo, chamada → borda (máximos); linha → logo, chamada → linha e o vão fio → apoio (±1). */
const MARGENS = {
  // 29/10/2026 (margem da marca): a logo e a moldura pousam no topo do piso (188): linhaLogo 0; a base da moldura é 1696: chamadaLinha +6.
  story: { bordaLogo: 220, chamadaBorda: 286, linhaLogo: 0, chamadaLinha: 61, vaoFio: 59.5, folgaManchete: 20 },
  // DESVIO MEDIDO da previsão do preflight (≥ 12 no Feed): com a referência .13 o corpo da manchete é 69 px (não o do
  // C1) e cada voz grava caixa física de 85 px (ceil da altura medida); a pilha é 170 e a folga real é 5,5 px — cabe em
  // 2 linhas, sem corte. (O texto antigo chamava de corpo 84 a caixa de 84 px de antes do ceil.) Fica a medida real.
  // No Feed a logo do @2 (156,6 no catálogo) guarda 8 px além do quadro (148,5): linhaLogo 8.
  feed: { bordaLogo: 158, chamadaBorda: 156, linhaLogo: 8, chamadaLinha: 51, vaoFio: 27, folgaManchete: 5.5 },
}

let real: { medir: MeasureTextBox; registradas: string[] } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real
}
async function montar(id: string, opcoes: { logo?: string; semCta?: boolean; assinatura?: Record<string, unknown>; variantes?: Array<{ fileUrl: string; isProjectLogo: true }> } = {}) {
  const { medir } = await medidorReal()
  cenario.atual = await cenario16(await paginaDoCenario16(id, opcoes), medir, opcoes.assinatura, opcoes.variantes)
}
/** A spec do #16 pedindo o @2 explícito. */
const spec2 = (variante: string, extra: Record<string, unknown> = {}) => spec16(variante, { arquetipo: { id: ID_CONVITE, versao: 2 }, ...extra })
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

const camada = (r: ResultadoDaComposicao, id: string) => r.layers.find((l) => l.id === id)!
const ret = (l: Layer) => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })
const toca = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const centroX = (l: Layer) => l.position.x + l.size.width / 2
const TEXTOS = ['pre', 'headline', 'headline2', 'apoio', 'servico', 'cta']
const cantoneiras = (r: ResultadoDaComposicao) => r.layers.filter((l) => (l.metadata as any)?.compositor?.acento?.elemento === 'cantoneiras')

describe.skipIf(!fontesNoDisco())('#16@2 · convite C2 no compositor e no medidor reais, fontes reais', () => {
  for (const formato of FORMATOS) {
    it(`I-1/I-2/I-3/I-5 ${formato}: posições previstas, cantoneiras derivadas, margens, compor = medir, copy autoral, 3 faixas`, async () => {
      await montar(`c16c2-${formato}`)
      const { width: W, height: H } = CANVAS[formato]
      const { r, entrada } = await compor(spec2(`c16c2-${formato}`, { formato }))
      expect(r.layers.some((l) => l.type === 'image')).toBe(false)
      expect([r.fundo, entrada!.background]).toEqual([CLARO, CLARO])
      expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_CONVITE, versao: 2, impressao: impressaoDoArquetipo(V2) })
      expect(impressaoDoArquetipo(V2)).toBe('arq1-01570f16b5b8cb')

      // I-1: cada camada pousa onde o preflight previu (±1 px); logo no eixo.
      for (const [id, y] of Object.entries(PREVISTO[formato])) expect(Math.abs(camada(r, id).position.y - y), `${id} y ${camada(r, id).position.y} ≠ ${y}`).toBeLessThanOrEqual(1)
      const logo = camada(r, 'logo')
      expect(Math.abs(centroX(logo) - 540)).toBeLessThanOrEqual(1)
      for (const id of TEXTOS) expect(Math.abs(centroX(camada(r, id)) - W / 2), id).toBeLessThanOrEqual(2)

      // UMA camada de cantoneiras, na moldura do @1, com o path DERIVADO, traço 2, a cor do destaque e a derivação.
      expect(cantoneiras(r)).toHaveLength(1)
      const [cant] = cantoneiras(r)
      expect(ret(cant)).toEqual(MOLDURA[formato])
      expect((cant.style as any).pathData).toBe(PATH[formato])
      expect([(cant.style as any).strokeWidth, (cant.style as any).strokeColor]).toEqual([2, DOURADO_NO_TRACO])
      expect((cant.style as any).vetor).toMatchObject({ asset: { id: 'cantoneiras', versao: 1 } })
      expect((cant.metadata as any).compositor.acento).toMatchObject({ elemento: 'cantoneiras', ancoradoA: 'peca', derivacao: { regra: 'bracos-iguais', bracoPx: 130 }, arquetipo: `${ID_CONVITE}@2` })
      const gravados = entrada!.fieldValues.composicao.arquetipo.acentos as Array<Record<string, any>>
      const receita = gravados.find((a) => a.elemento === 'cantoneiras')!
      expect([receita.desenho.pathData, receita.derivacao, receita.cor]).toEqual([PATH[formato], { regra: 'bracos-iguais', bracoPx: 130 }, DOURADO])
      expect(gravados.find((a) => a.elemento === 'fio')!.derivacao).toBeUndefined()

      // Nenhum texto nem a logo toca a ocupação (4 × 132 × 132).
      const bracos = ocupacaoDoAcento(receita as never, ret(cant))
      expect(bracos.map((b) => [Math.round(b.width), Math.round(b.height)])).toEqual(Array(4).fill([132, 132]))
      for (const id of [...TEXTOS, 'logo']) for (const b of bracos) expect(toca(ret(camada(r, id)), b), `${id} × braço`).toBe(false)

      // C2-09/C2-12: margens e o vão do fio.
      const M = MARGENS[formato]
      const ctaBase = camada(r, 'cta').position.y + camada(r, 'cta').size.height
      const moldura = MOLDURA[formato]
      expect(logo.position.y).toBeLessThanOrEqual(M.bordaLogo)
      expect(H - ctaBase).toBeLessThanOrEqual(M.chamadaBorda)
      expect(Math.abs(logo.position.y - moldura.y - M.linhaLogo)).toBeLessThanOrEqual(1)
      expect(Math.abs(moldura.y + moldura.height - ctaBase - M.chamadaLinha)).toBeLessThanOrEqual(1)
      const fio = camada(r, 'acento-fio')
      expect(Math.abs(camada(r, 'apoio').position.y - (fio.position.y + fio.size.height) - M.vaoFio)).toBeLessThanOrEqual(1)
      expect(r.layers.filter((l) => (l.metadata as any)?.compositor?.acento?.tipo === 'fio-fino')).toHaveLength(1)
      expect(r.layers.some((l) => (l.metadata as any)?.compositor?.acento?.tipo === 'spark-4')).toBe(false)

      // I-3: copy autoral — seis papéis na ordem, sem lacuna, segunda voz, manchete de 2 linhas com folga.
      expect([camada(r, 'headline').content, camada(r, 'headline2').content]).toEqual(['Noite de', 'vinhos'])
      expect(camada(r, 'headline2').style).toMatchObject({ fontFamily: 'Georgia Italica' })
      const lidos = blocosLidosDasCamadas(COPY_16 as never, r.layers)
      expect(lidos.lacunas).toEqual([])
      expect(lidos.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null])).toEqual(
        COPY_16.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, (b as any).estilo?.linhasNaVoz2 ?? null]),
      )
      const ordemY = ['logo', 'pre', 'headline', 'apoio', 'servico', 'cta'].map((id) => camada(r, id).position.y)
      expect(ordemY).toEqual([...ordemY].sort((a, b) => a - b))
      const refManchete = (V2.formatos[formato].papeis.headline as any).referencia.h * H
      const alturaManchete = camada(r, 'headline2').position.y + camada(r, 'headline2').size.height - camada(r, 'headline').position.y
      expect(refManchete - alturaManchete, `folga da manchete ${refManchete - alturaManchete}`).toBeGreaterThanOrEqual(M.folgaManchete)
      if (formato === 'feed') {
        // Caracterização técnica do Feed: corpo e posições intactos; caixas físicas ceil de 85 px por voz.
        expect([camada(r, 'headline').style?.fontSize, camada(r, 'headline2').style?.fontSize]).toEqual([69, 69])
        expect([camada(r, 'headline').size.height, camada(r, 'headline2').size.height]).toEqual([85, 85])
        expect([camada(r, 'headline').position.y, camada(r, 'headline2').position.y]).toEqual([472, 557])
        expect(alturaManchete).toBe(170)
        expect(refManchete - alturaManchete).toBeCloseTo(5.5, 6)
      }

      // I-5: três faixas, um candidato cada — UMA combinação, nenhuma avaliação; nenhum limite lançado (a peça saiu).
      const busca = (r.diagnostico as any).arquetipo.buscaEspacial
      expect(busca.faixas.map((x: any) => x.membros)).toEqual([['logo'], ['pre', 'headline', 'apoio', 'servico'], ['cta']])
      expect(busca.faixas.map((x: any) => x.candidatos.length)).toEqual([1, 1, 1])
      expect(busca.combinacoesAvaliadas).toBe(0)

      // I-2: o medir-copy diz o MESMO — cabe, mesmas caixas de cantoneiras, fio e logo, mesmo fundo, nenhuma recusa (o
      // path que ele usa passou pela mesma guarda do desenho).
      const m = await medirCopyDoProjeto({ projectId: 9002, formato, variante: `c16c2-${formato}`, copyAutoral: COPY_16, arquetipo: { id: ID_CONVITE, versao: 2 } } as never)
      expect([m.fundo, m.medicao.cabeTudo]).toEqual([CLARO, true])
      const acentos = (m.medicao.arquetipo as any).acentos
      expect([acentos.recusas, acentos.omitidos]).toEqual([[], []])
      expect(acentos.previstos.map((p: any) => [p.elemento, p.rect])).toEqual([
        ['cantoneiras', ret(cant)],
        ['fio', ret(fio)],
      ])
      expect((m.medicao.arquetipo as any).posicoes.logo.posicao).toEqual(ret(logo))
    }, 120_000)
  }

  it('I-3: cta com e sem o prefixo da assinatura desenham a mesma linha', async () => {
    await montar('c16c2-prefixo')
    const comPrefixo = { ...COPY_16, blocos: COPY_16.blocos.map((b) => (b.id === 'site' ? { ...b, linhas: ['→ www.casa.com.br'] } : b)) }
    const semAutor = await compor(spec2('c16c2-prefixo'))
    const doAutor = await compor(spec2('c16c2-prefixo', { copyAutoral: comPrefixo }))
    expect([camada(semAutor.r, 'cta').content, camada(doAutor.r, 'cta').content]).toEqual(['→ www.casa.com.br', '→ www.casa.com.br'])
    expect(ret(camada(semAutor.r, 'cta'))).toEqual(ret(camada(doAutor.r, 'cta')))
    expect(blocosLidosDasCamadas(COPY_16 as never, semAutor.r.layers).blocos.find((b) => b.id === 'site')!.linhas).toEqual(['www.casa.com.br'])
    expect(blocosLidosDasCamadas(comPrefixo as never, doAutor.r.layers).blocos.find((b) => b.id === 'site')!.linhas).toEqual(['→ www.casa.com.br'])
  }, 120_000)

  it('I-4: CP3 na logo fixa — variante trocada no MESMO centro, superior-centro em todas as avaliações; cantoneiras intactas', async () => {
    await montar('c16c2-cp3', { logo: '#F2F2F2' })
    const { r, entrada } = await compor(spec2('c16c2-cp3'))
    const logo = camada(r, 'logo')
    const leg = (r.diagnostico as any).logo.legibilidade
    expect([leg.escolha, leg.canto, leg.legivel, leg.variante.origem]).toEqual(['variante-trocada', 'superior-centro', true, 'projeto'])
    expect(leg.avaliacoes.length).toBeGreaterThan(1)
    expect(leg.avaliacoes.every((a: any) => a.canto === 'superior-centro')).toBe(true)
    expect(Math.abs(centroX(logo) - 540)).toBeLessThanOrEqual(1)
    const receita = entrada!.fieldValues.composicao.arquetipo.acentos[0]
    expect([receita.desenho.pathData, receita.derivacao]).toEqual([PATH.story, { regra: 'bracos-iguais', bracoPx: 130 }])
    for (const b of ocupacaoDoAcento(receita, ret(cantoneiras(r)[0]))) expect(toca(ret(logo), b)).toBe(false)
  }, 120_000)

  it('I-4: recusas herdadas no @2 — foto, pré ausente, 3 linhas, manchete longa, sem claro, sem cta, só logos claras — nada persistido', async () => {
    await montar('c16c2-recusas')
    const antes = cap.entradas.length
    const com = (blocos: Array<Record<string, unknown>>) => ({ ...COPY_16, blocos })
    const [pre, manchete, apoio, quando, site] = COPY_16.blocos
    expect((await recusa(compor(spec2('c16c2-recusas', { foto: { driveFileId: 'foto-sintetica' } })))).code).toBe('ARQUETIPO_FOTO_NAO_SUPORTADA')
    const semPre = await recusa(compor(spec2('c16c2-recusas', { copyAutoral: com([{ ...manchete, ordem: 0 }, { ...apoio, ordem: 1 }, { ...quando, ordem: 2 }, { ...site, ordem: 3 }]) })))
    expect([semPre.code, semPre.details?.faltam]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['pre']])
    const tres = await recusa(compor(spec2('c16c2-recusas', { copyAutoral: com([pre, { ...manchete, linhas: ['Noite', 'de', 'vinhos'], estilo: undefined }, apoio, quando, site]) })))
    expect([tres.code, tres.details?.excedidas]).toEqual(['ARQUETIPO_LINHAS_EXCEDIDAS', [{ papel: 'headline', linhas: 3, linhasMax: 2 }]])
    const longa = await recusa(compor(spec2('c16c2-recusas', { copyAutoral: com([pre, { ...manchete, linhas: ['Uma noite inteira de grandes vinhos', 'do mundo todo'] }, apoio, quando, site]) })))
    expect(longa.code).toMatch(/^ARQUETIPO_(TEXTO_NAO_CABE|FORA_DA_ZONA)$/)
    expect(cap.entradas.length).toBe(antes)
    await montar('c16c2-sem-claro', { assinatura: { destaque: { fill: DOURADO } } })
    expect((await recusa(compor(spec2('c16c2-sem-claro')))).code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
    await montar('c16c2-sem-cta', { semCta: true })
    const semCta = await recusa(compor(spec2('c16c2-sem-cta')))
    expect([semCta.code, semCta.status]).toEqual(['PAPEIS_INCOMPATIVEIS', 422])
    const clara = dataUrl(await logoSintetica('#F2F2F2'))
    await montar('c16c2-so-claras', { logo: '#F2F2F2', variantes: [{ fileUrl: clara, isProjectLogo: true }] })
    expect((await recusa(compor(spec2('c16c2-so-claras')))).code).toBe('LOGO_SEM_VARIANTE_LEGIVEL')
    expect(cap.entradas.length).toBe(antes)
  }, 120_000)

  it('I-4: projeto com área segura maior (safeTopo 200): na margem da marca (29/10/2026) a moldura e a logo SEGUEM o piso — compõe, sem empurrão', async () => {
    // Até 29/10 a moldura ficava na caixa do catálogo (topo 192) e o piso 200 recusava o @2 inteiro (ARQUETIPO_ELEMENTO_NAO_CABE).
    await montar('c16c2-hard', { assinatura: { fundoClaro: CLARO, destaque: { fill: DOURADO }, geometria: { story: { safeTopo: 200 } } } })
    const { r } = await compor(spec2('c16c2-hard'))
    const cant = cantoneiras(r)[0]
    expect(ret(cant)).toEqual({ x: 92, y: 200, width: 896, height: 1496 })
    expect(camada(r, 'logo').position.y).toBeGreaterThanOrEqual(200)
    expect((r.diagnostico as any).arquetipo.acentos?.recusas ?? []).toEqual([])
  }, 120_000)

  for (const formato of FORMATOS) {
    it(`PNG ${formato} pelo renderizador: tinta a 129 px do canto nos dois braços, fundo a 140 px e no meio de cada borda`, async () => {
      await montar(`c16c2-png-${formato}`)
      const { r } = await compor(spec2(`c16c2-png-${formato}`, { formato }), { provar: true })
      const { width: W, height: H } = CANVAS[formato]
      const px = async (x: number, y: number) => {
        const { data } = await sharp(r.prova!).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
        return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
      }
      const c = MOLDURA[formato]
      // A linha de 2 px centrada na borda: o pixel de dentro da borda (o de x/y menor na borda da direita/de baixo).
      const xs = [c.x, c.x + c.width - 1]
      const ys = [c.y, c.y + c.height - 1]
      for (const [i, x] of xs.entries()) {
        for (const [j, y] of ys.entries()) {
          const dx = i === 0 ? 1 : -1
          const dy = j === 0 ? 1 : -1
          const onde = `${formato} canto ${i},${j}`
          expect(await px(x + dx * 129, y), `${onde}: braço H a 129`).not.toBe(CLARO)
          expect(await px(x, y + dy * 129), `${onde}: braço V a 129`).not.toBe(CLARO)
          expect(await px(x + dx * 140, y), `${onde}: fundo H a 140`).toBe(CLARO)
          expect(await px(x, y + dy * 140), `${onde}: fundo V a 140`).toBe(CLARO)
        }
      }
      expect(await px(W / 2, ys[0])).toBe(CLARO)
      expect(await px(W / 2, ys[1])).toBe(CLARO)
      expect(await px(xs[0], H / 2)).toBe(CLARO)
      expect(await px(xs[1], H / 2)).toBe(CLARO)
      // Limite HERDADO e declarado (não corrigido aqui): o meio traço da vertical pinta 1 px fora do margemH — as colunas
      // de pixel 91 (x 91–92) e 988 (x 988–989); a 90 e a 989 já é fundo.
      for (const x of [91, 988]) expect(await px(x, c.y + 60), `tinta herdada na coluna ${x}`).not.toBe(CLARO)
      for (const x of [90, 989]) expect(await px(x, c.y + 60), `coluna ${x}`).toBe(CLARO)
    }, 120_000)
  }
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): o #16@2 × Story e Feed, fontes reais, renderizador do Studio,
 * marca sintética. Não é aceite visual do owner (G-H1) nem das marcas.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t4e16c2-convite.test.ts -t "provas visuais"
 */
describe.skipIf(!process.env.PROVAS_DIR || !fontesNoDisco())('#16@2 · provas visuais locais', () => {
  for (const formato of FORMATOS) {
    it(`convite C2 ${formato}`, async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const dir = process.env.PROVAS_DIR!
      mkdirSync(dir, { recursive: true })
      await montar(`c16c2-prova-${formato}`)
      const { r } = await compor(spec2(`c16c2-prova-${formato}`, { formato }), { provar: true })
      writeFileSync(join(dir, `t4e16c2-convite-${formato}.png`), r.prova!)
      const { medir } = await medidorReal()
      // Com `provar` nada é persistido: a receita desenhada vem do diagnóstico (a mesma que seria gravada).
      const receita = ((r.diagnostico as any).arquetipo.acentos as Array<Record<string, any>>).find((a) => a.elemento === 'cantoneiras')!
      const cant = cantoneiras(r)[0]
      writeFileSync(
        join(dir, `t4e16c2-convite-${formato}.json`),
        JSON.stringify(
          {
            formato,
            arquetipo: `${ID_CONVITE}@2`,
            impressao: impressaoDoArquetipo(V2),
            fundo: r.fundo,
            medidor: 'createServerTextBoxMeasurer (real) · Georgia + Montserrat registradas',
            faixas: (r.diagnostico as any).arquetipo.buscaEspacial.faixas.map((x: any) => ({ membros: x.membros, candidatos: x.candidatos.length })),
            combinacoesAvaliadas: (r.diagnostico as any).arquetipo.buscaEspacial.combinacoesAvaliadas,
            logo: (r.diagnostico as any).logo.legibilidade,
            cantoneiras: { rect: ret(cant), pathData: (cant.style as any).pathData, derivacao: receita.derivacao, metadado: (cant.metadata as any).compositor.acento },
            ocupacaoDasCantoneiras: ocupacaoDoAcento(receita as never, ret(cant)),
            camadas: r.layers.map((l) => ({ id: l.id, type: l.type, position: l.position, size: l.size, content: l.content, fontFamily: (l.style as any)?.fontFamily, linhasVisuais: l.type === 'text' ? medir(l).lineCount : undefined })),
          },
          null,
          2,
        ),
      )
    }, 120_000)
  }
})
