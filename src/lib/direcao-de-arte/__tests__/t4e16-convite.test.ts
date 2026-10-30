/**
 * #16 `minimal-tipografico-convite` (24/10/2026) no COMPOSITOR REAL com FONTES REAIS: Georgia e Montserrat registradas
 * no canvas e o medidor REAL do servidor (`createServerTextBoxMeasurer`), o mesmo motor do renderizador da prova PNG.
 * Dublados: o banco (em memória, não Postgres), o Blob (a persistência só captura a entrada), o registro de fontes do
 * projeto e o autofix. A marca é sintética (destaque dourado, `fundoClaro` de teste, cta com prefixo "→ ").
 *
 * Prova: logo FIXA no topo-centro (materialização e CP3, inclusive com variante trocada), cantoneiras presas à PEÇA que
 * ocupam só os quatro braços (texto e logo no miolo), cor = destaque da manchete congelada, um fio acima do apoio pela
 * caixa real dele, a linha final no papel cta com o prefixo da assinatura (com e sem o autor escrevê-lo), três faixas sem
 * busca, Story e Feed próprios, sem foto/fundo claro, contrato autoral e segunda voz inteiros, medir-copy = compor, replay
 * pela receita CONGELADA com o catálogo vivo e a paleta alterados, e as recusas.
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
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { comporPeca, type ResultadoDaComposicao } from '@/lib/compositor/compor'
import { medirCopyDoProjeto } from '@/lib/compositor/medir-copy-service'
import { acentosCongelados, escolhaEspacialOriginal } from '@/lib/compositor/defasagem'
import { ocupacaoDoAcento } from '@/lib/compositor/arquetipos/acentos'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { blocosLidosDasCamadas, vinculoDaCamada } from '@/lib/copy-autoral/efetiva'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { dataUrl } from './suporte/fixture'
import { logoSintetica } from './suporte/sinteticos'
import { CLARO, COPY_16, DOURADO, ID_CONVITE, cenario16, fontesNoDisco, medidorComFontesReais, paginaDoCenario16, spec16 } from './suporte/cenario-16'

const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
const CONVITE = verArquetipo(ID_CONVITE, 1)!
/** O dourado da marca como o construtor da camada o grava no traço (o mesmo #B08D57). */
const DOURADO_NO_TRACO = 'rgba(176, 141, 87, 1)'
const PATH_DO_ASSET = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!.pathData!

let real: { medir: MeasureTextBox; registradas: string[] } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real
}

async function montar(id: string, opcoes: { logo?: string; semCta?: boolean; assinatura?: Record<string, unknown>; variantes?: Array<{ fileUrl: string; isProjectLogo: true }> } = {}) {
  const { medir } = await medidorReal()
  cenario.atual = await cenario16(await paginaDoCenario16(id, opcoes), medir, opcoes.assinatura, opcoes.variantes)
}

async function compor(s: Record<string, unknown>, opcoes: Parameters<typeof comporPeca>[1] = {}) {
  const antes = cap.entradas.length
  const r = await comporPeca(s, { autor: 'u-fixture', ...opcoes })
  return { r, entrada: cap.entradas.length > antes ? cap.entradas.at(-1) : undefined }
}

async function recusa(promessa: Promise<unknown>): Promise<{ code: string; message: string; details?: Record<string, any> }> {
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
const dentroDe = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height
const centroX = (l: Layer) => l.position.x + l.size.width / 2
const TEXTOS = ['pre', 'headline', 'headline2', 'apoio', 'servico', 'cta']
const cantoneiras = (r: ResultadoDaComposicao) => r.layers.filter((l) => (l.metadata as any)?.compositor?.acento?.elemento === 'cantoneiras')

describe.skipIf(!fontesNoDisco())('#16 · minimal-tipografico-convite no compositor real, fontes reais', () => {
  for (const formato of FORMATOS) {
    it(`${formato}: logo fixa no topo-centro, cantoneiras da peça, fio acima do apoio, cta na base, três faixas, sem foto`, async () => {
      await montar(`c16-${formato}`)
      const { width: W, height: H } = CANVAS[formato]
      const geo = CONVITE.formatos[formato]
      const { r, entrada } = await compor(spec16(`c16-${formato}`, { formato }))
      expect(r.layers.some((l) => l.type === 'image')).toBe(false)
      expect([r.fundo, entrada!.background]).toEqual([CLARO, CLARO])
      expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_CONVITE, versao: 1, impressao: impressaoDoArquetipo(CONVITE) })

      // LOGO: fixa, centrada no eixo da peça, em contain dentro da referência; o CP3 mediu ali e manteve.
      const logo = camada(r, 'logo')
      const refLogo = (geo.papeis.logo as any).referencia
      expect(Math.abs(centroX(logo) - W / 2)).toBeLessThanOrEqual(1)
      // Na margem da marca (29/10/2026) a referência da logo (249,6/168,8 no catálogo, na faixa da margem) pousa no topo do piso padrão.
      // O recuo além do quadro do catálogo (230,4 / 148,5) a logo guarda: 188 + 19,2 no Story, 120 + 20,3 no Feed.
      const topoDaMarca = formato === 'story' ? 188 : 120
      const quadro = formato === 'story' ? 0.12 : 0.11
      const topoEsperado = topoDaMarca + Math.max(0, (refLogo.y - quadro) * H)
      expect(logo.position.y).toBeGreaterThanOrEqual(Math.floor(topoEsperado))
      expect(logo.position.y + logo.size.height).toBeLessThanOrEqual(Math.ceil(topoEsperado + refLogo.h * H))
      const diagLogo = (r.diagnostico as any).logo
      expect([diagLogo.canto, diagLogo.legibilidade.escolha, diagLogo.legibilidade.legivel]).toEqual(['superior-centro', 'mantida', true])
      expect((r.diagnostico as any).arquetipo.logo).toMatchObject({ modo: 'referencia', canto: 'superior-centro' })

      // CANTONEIRAS: uma camada, na caixa DECLARADA (não segue texto), o path do asset, a cor do destaque da manchete.
      const [cant] = cantoneiras(r)
      expect(cantoneiras(r)).toHaveLength(1)
      // Na margem da marca (29/10/2026) a caixa das cantoneiras segue o piso padrão borda a borda: topo 188/120, base 1696/1246.
      const c = geo.elementos!.cantoneiras
      const topo = formato === 'story' ? 188 : 120
      const base = formato === 'story' ? 1696 : 1246
      expect(ret(cant)).toEqual({ x: Math.round(c.x * W), y: topo, width: Math.round(c.w * W), height: base - topo })
      expect((cant.style as any).pathData ?? (cant.style as any).vetor?.pathData ?? JSON.stringify(cant.style)).toContain(PATH_DO_ASSET)
      expect((cant.style as any).strokeColor).toBe(DOURADO_NO_TRACO)
      const meta = (cant.metadata as any).compositor.acento
      expect(meta).toMatchObject({ elemento: 'cantoneiras', tipo: 'cantoneiras', ancoradoA: 'peca', corPorPapel: 'destaque', fonteDaCor: 'destaque-da-manchete (cantoneiras)' })
      expect('presoA' in meta).toBe(false)
      // Entra ABAIXO dos textos (o acento nunca cobre a leitura).
      expect(r.layers.indexOf(cant)).toBeLessThan(Math.min(...TEXTOS.map((id) => r.layers.indexOf(camada(r, id)))))

      // OCUPAÇÃO: os quatro braços; textos e logo moram no MIOLO da moldura e não tocam braço nenhum.
      const gravados = entrada!.fieldValues.composicao.arquetipo.acentos as Array<Record<string, any>>
      const receita = gravados.find((a) => a.elemento === 'cantoneiras')!
      const bracos = ocupacaoDoAcento(receita as never, ret(cant))
      expect(bracos).toHaveLength(4)
      for (const id of [...TEXTOS, 'logo']) {
        expect(dentroDe(ret(camada(r, id)), ret(cant)), `${id} no miolo`).toBe(true)
        for (const b of bracos) expect(toca(ret(camada(r, id)), b), `${id} × braço`).toBe(false)
      }

      // FIO: um, obrigatório, acima do apoio pela caixa REAL dele, centrado nele, com a largura declarada.
      const fio = camada(r, 'acento-fio')
      const apoio = camada(r, 'apoio')
      const vao = Math.round(((geo.papeis.apoio as any).referencia.y - (geo.elementos!.fio.y + geo.elementos!.fio.h)) * H)
      expect(fio.position.y + fio.size.height).toBeLessThanOrEqual(apoio.position.y)
      expect(Math.abs(apoio.position.y - (fio.position.y + fio.size.height) - vao)).toBeLessThanOrEqual(1)
      expect(Math.abs(centroX(fio) - centroX(apoio))).toBeLessThanOrEqual(1)
      expect(fio.size.width).toBe(Math.round(geo.elementos!.fio.w * W))
      expect(fio.position.y).toBeGreaterThanOrEqual(camada(r, 'headline2').position.y + camada(r, 'headline2').size.height)
      expect(r.layers.filter((l) => (l.metadata as any)?.compositor?.acento?.tipo === 'fio-fino')).toHaveLength(1)
      expect(r.layers.some((l) => (l.metadata as any)?.compositor?.acento?.tipo === 'spark-4')).toBe(false)

      // TUDO CENTRADO; a linha final é o cta, com o prefixo da assinatura; o serviço é outro bloco, acima dele.
      for (const id of TEXTOS) expect(Math.abs(centroX(camada(r, id)) - W / 2), id).toBeLessThanOrEqual(2)
      const cta = camada(r, 'cta')
      const servico = camada(r, 'servico')
      expect([cta.content, servico.content]).toEqual(['→ www.casa.com.br', 'Sexta, 14 de novembro · 20h'])
      expect([vinculoDaCamada(cta), vinculoDaCamada(servico)]).toEqual([{ bloco: 'site', linhas: [0] }, { bloco: 'quando', linhas: [0] }])
      expect(cta.position.y).toBe(Math.max(...TEXTOS.map((id) => camada(r, id).position.y)))
      expect(servico.position.y + servico.size.height).toBeLessThan(cta.position.y)

      // Manchete em duas linhas, a segunda na SEGUNDA VOZ declarada pelo autor.
      expect([camada(r, 'headline').content, camada(r, 'headline2').content]).toEqual(['Noite de', 'vinhos'])
      expect(camada(r, 'headline2').style).toMatchObject({ fontFamily: 'Georgia Italica' })

      // TRÊS faixas, sem busca: {logo} · {conjunto central} · {cta}; um candidato cada, 0 avaliações.
      const busca = (r.diagnostico as any).arquetipo.buscaEspacial
      expect(busca.faixas.map((x: any) => x.membros)).toEqual([['logo'], ['pre', 'headline', 'apoio', 'servico'], ['cta']])
      expect(busca.faixas.map((x: any) => x.candidatos.length)).toEqual([1, 1, 1])
      expect(busca.avaliadas ?? busca.combinacoesAvaliadas ?? 0).toBe(0)

      // A copy efetiva lida das camadas = o contrato (ids, ordem, linhas, segunda voz).
      const lidos = blocosLidosDasCamadas(COPY_16 as never, r.layers)
      expect(lidos.lacunas).toEqual([])
      expect(lidos.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null])).toEqual(
        COPY_16.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, (b as any).estilo?.linhasNaVoz2 ?? null]),
      )
      expect((entrada!.copyAutoral as any).blocos.map((b: any) => [b.id, b.ordem, b.linhas])).toEqual(COPY_16.blocos.map((b) => [b.id, b.ordem, b.linhas]))

      // A RECEITA gravada: cantoneiras sem presoA, o path do asset, a cor e a fonte; o fio preso ao apoio.
      expect(gravados.map((a) => [a.elemento, a.presoA ?? null, a.cor, a.fonteDaCor])).toEqual([
        ['cantoneiras', null, DOURADO, 'destaque-da-manchete (cantoneiras)'],
        ['fio', 'apoio', camada(r, 'headline').style?.color ?? '#1F1F1F', 'texto-do-papel'],
      ])
      expect(receita.desenho.pathData).toBe(PATH_DO_ASSET)

      // O medir-copy diz o MESMO: cabe, as mesmas caixas de cantoneiras, fio e logo, o mesmo fundo.
      const m = await medirCopyDoProjeto({ projectId: 9002, formato, variante: `c16-${formato}`, copyAutoral: COPY_16, arquetipo: { id: ID_CONVITE, versao: 1 } } as never)
      expect([m.fundo, m.medicao.cabeTudo]).toEqual([CLARO, true])
      const previstos = (m.medicao.arquetipo as any).acentos.previstos as Array<{ elemento: string; rect: Record<string, number> }>
      expect(previstos.map((p) => [p.elemento, p.rect])).toEqual([
        ['cantoneiras', ret(cant)],
        ['fio', ret(fio)],
      ])
      expect((m.medicao.arquetipo as any).posicoes.logo.posicao).toEqual(ret(logo))
    }, 120_000)
  }

  it('cta com e sem o prefixo da assinatura: a linha EFETIVA é medida e registrada; o autor não ganha prefixo dobrado', async () => {
    await montar('c16-prefixo')
    const comPrefixo = { ...COPY_16, blocos: COPY_16.blocos.map((b) => (b.id === 'site' ? { ...b, linhas: ['→ www.casa.com.br'] } : b)) }
    const medidaDoCta = async (copy: typeof COPY_16) => {
      const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', variante: 'c16-prefixo', copyAutoral: copy, arquetipo: { id: ID_CONVITE, versao: 1 } } as never)
      return m.medicao.blocos.find((b) => b.papel === 'cta')!.linhasMedidas[0]
    }
    const semAutor = await compor(spec16('c16-prefixo'))
    const doAutor = await compor(spec16('c16-prefixo', { copyAutoral: comPrefixo }))
    expect(camada(semAutor.r, 'cta').content).toBe('→ www.casa.com.br')
    expect(camada(doAutor.r, 'cta').content).toBe('→ www.casa.com.br')
    // A leitura de volta devolve a linha DO AUTOR (com ou sem o prefixo que ele escreveu) — nenhuma lacuna.
    expect(blocosLidosDasCamadas(COPY_16 as never, semAutor.r.layers).blocos.find((b) => b.id === 'site')!.linhas).toEqual(['www.casa.com.br'])
    expect(blocosLidosDasCamadas(comPrefixo as never, doAutor.r.layers).blocos.find((b) => b.id === 'site')!.linhas).toEqual(['→ www.casa.com.br'])
    const [a, b] = [await medidaDoCta(COPY_16), await medidaDoCta(comPrefixo)]
    expect([a.linha, b.linha]).toEqual(['www.casa.com.br', '→ www.casa.com.br'])
    // A mesma linha efetiva ("→ www…") nas duas medidas — e a caixa desenhada é a dessa linha.
    expect(a.largura).toBe(b.largura)
    expect(a.cabe).toBe(true)
    // Controle: a marca SEM prefixo no cta desenha e mede a linha crua, mais estreita.
    const { medir } = await medidorReal()
    const pagina = await paginaDoCenario16('c16-sem-prefixo')
    pagina.layers = pagina.layers.map((l) => (l.id === 'cta-pagina' ? ({ ...l, content: 'Reserve pelo site' } as Layer) : l))
    cenario.atual = await cenario16(pagina, medir)
    const cru = await compor(spec16('c16-sem-prefixo'))
    expect(camada(cru.r, 'cta').content).toBe('www.casa.com.br')
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', variante: 'c16-sem-prefixo', copyAutoral: COPY_16, arquetipo: { id: ID_CONVITE, versao: 1 } } as never)
    expect(m.medicao.blocos.find((x) => x.papel === 'cta')!.linhasMedidas[0].largura!).toBeLessThan(a.largura!)
    expect(camada(cru.r, 'cta').size.width).toBeLessThan(camada(semAutor.r, 'cta').size.width)
  }, 120_000)

  it('CP3 na logo fixa central: a desenhada clara não lê sobre o claro → troca para a variante AUTORIZADA escura, no MESMO centro', async () => {
    await montar('c16-cp3', { logo: '#F2F2F2' })
    const { r, entrada } = await compor(spec16('c16-cp3'))
    const logo = camada(r, 'logo')
    const leg = (r.diagnostico as any).logo.legibilidade
    expect([leg.escolha, leg.canto, leg.legivel, leg.variante.origem]).toEqual(['variante-trocada', 'superior-centro', true, 'projeto'])
    expect(leg.medida.contrasteP10).toBeGreaterThanOrEqual(45)
    expect(Math.abs(centroX(logo) - 540)).toBeLessThanOrEqual(1)
    expect(logo.fileUrl).toBe(leg.variante.url)
    // A variante escolhida vai à receita (a recomposição a repete); nenhum canto entra na escolha da logo fixa.
    const escolha = entrada!.fieldValues.composicao.arquetipo.buscaEspacial.escolha
    expect(escolha.logo.url).toBe(leg.variante.url)
    expect(escolha.cantoDaLogo ?? null).toBeNull()
    // Nenhum braço da cantoneira toca a variante trocada.
    const bracos = ocupacaoDoAcento(entrada!.fieldValues.composicao.arquetipo.acentos[0], ret(cantoneiras(r)[0]))
    for (const b of bracos) expect(toca(ret(logo), b)).toBe(false)
  }, 120_000)

  it('recusas honestas: foto pedida, marca sem claro, sem estilo cta, só logos claras, pré ausente, manchete que não cabe', async () => {
    await montar('c16-recusas')
    const antes = cap.entradas.length
    const com = (blocos: Array<Record<string, unknown>>) => ({ ...COPY_16, blocos })
    const [pre, manchete, apoio, quando, site] = COPY_16.blocos
    expect((await recusa(compor(spec16('c16-recusas', { foto: { driveFileId: 'foto-sintetica' } })))).code).toBe('ARQUETIPO_FOTO_NAO_SUPORTADA')
    const semPre = await recusa(compor(spec16('c16-recusas', { copyAutoral: com([{ ...manchete, ordem: 0 }, { ...apoio, ordem: 1 }, { ...quando, ordem: 2 }, { ...site, ordem: 3 }]) })))
    expect([semPre.code, semPre.details?.faltam]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['pre']])
    const tres = await recusa(compor(spec16('c16-recusas', { copyAutoral: com([pre, { ...manchete, linhas: ['Noite', 'de', 'vinhos'], estilo: undefined }, apoio, quando, site]) })))
    expect([tres.code, tres.details?.excedidas]).toEqual(['ARQUETIPO_LINHAS_EXCEDIDAS', [{ papel: 'headline', linhas: 3, linhasMax: 2 }]])
    const longa = await recusa(compor(spec16('c16-recusas', { copyAutoral: com([pre, { ...manchete, linhas: ['Uma noite inteira de grandes vinhos', 'do mundo todo'] }, apoio, quando, site]) })))
    expect(longa.code).toMatch(/^ARQUETIPO_(TEXTO_NAO_CABE|FORA_DA_ZONA)$/)
    expect(cap.entradas.length).toBe(antes)
    await montar('c16-sem-claro', { assinatura: { destaque: { fill: DOURADO } } })
    expect((await recusa(compor(spec16('c16-sem-claro')))).code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
    await montar('c16-sem-cta', { semCta: true })
    const semCta = await recusa(compor(spec16('c16-sem-cta')))
    // A recusa de hoje (422): a variante não tem o estilo cta — nenhum papel URL é forjado, a assinatura não muda.
    expect([semCta.code, (semCta as any).status]).toEqual(['PAPEIS_INCOMPATIVEIS', 422])
    expect(semCta.message).toMatch(/não tem cta/)
    // Só variantes CLARAS autorizadas (a da página e as do projeto): nenhuma alcança p10 ≥ 45 sobre o claro → recusa.
    const clara = dataUrl(await logoSintetica('#F2F2F2'))
    await montar('c16-so-claras', { logo: '#F2F2F2', variantes: [{ fileUrl: clara, isProjectLogo: true }] })
    expect((await recusa(compor(spec16('c16-so-claras')))).code).toBe('LOGO_SEM_VARIANTE_LEGIVEL')
    expect(cap.entradas.length).toBe(antes)
  }, 120_000)

  it('replay pela receita CONGELADA: o catálogo vivo e a paleta mudaram, a copy foi editada — cantoneiras, fio, logo e fundo seguem a peça', async () => {
    await montar('c16-replay')
    const { r, entrada } = await compor(spec16('c16-replay'))
    const gravada = entrada!.fieldValues.spec
    const escolha = escolhaEspacialOriginal(entrada!.fieldValues, gravada)
    const acentos = acentosCongelados(entrada!.fieldValues, gravada)!
    expect(acentos.map((a) => [a.elemento, a.presoA ?? null])).toEqual([['cantoneiras', null], ['fio', 'apoio']])
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!
    const original = asset.pathData
    try {
      // O catálogo VIVO muda o desenho (só os dois braços de cima) e a marca troca o destaque: nada disso pode chegar à peça antiga.
      asset.pathData = 'M0 25 L0 0 L25 0 M75 0 L100 0 L100 25'
      await montar('c16-replay', { assinatura: { fundoClaro: '#FFFFFF', destaque: { fill: '#C0392B' } } })
      const editada = { ...COPY_16, blocos: COPY_16.blocos.map((b) => (b.id === 'detalhe' ? { ...b, linhas: ['Menu degustação'] } : b)) }
      const { r: replay } = await compor({ ...spec16('c16-replay'), arquetipo: gravada.arquetipo, copyAutoral: editada }, { ...(escolha ? { escolhaEspacial: escolha } : {}), acentosCongelados: acentos, fundoCongelado: CLARO })
      const [antiga, nova] = [cantoneiras(r)[0], cantoneiras(replay)[0]]
      expect(ret(nova)).toEqual(ret(antiga))
      expect((nova.style as any).pathData).toBe(original)
      expect((nova.style as any).strokeColor).toBe(DOURADO_NO_TRACO)
      // A ocupação do replay sai do PATH CONGELADO (4 braços), não do catálogo de hoje (que daria 2).
      expect(ocupacaoDoAcento(acentos[0], ret(nova))).toHaveLength(4)
      expect(ocupacaoDoAcento({ tipo: 'cantoneiras', desenho: { ...acentos[0].desenho, pathData: asset.pathData } }, ret(nova))).toHaveLength(2)
      expect(replay.fundo).toBe(CLARO)
      expect(camada(replay, 'apoio').content).toBe('Menu degustação')
      for (const id of ['logo', 'cta', 'headline']) expect(ret(camada(replay, id)), id).toEqual(ret(camada(r, id)))
      expect(Math.abs(centroX(camada(replay, 'acento-fio')) - centroX(camada(replay, 'apoio')))).toBeLessThanOrEqual(1)
      // Controle: uma peça NOVA com o catálogo alterado usa o desenho de hoje — a mutação é efetiva, o replay é que não a lê.
      const { entrada: novaPeca } = await compor(spec16('c16-replay'))
      expect(novaPeca!.fieldValues.composicao.arquetipo.acentos[0].desenho.pathData).toBe('M0 25 L0 0 L25 0 M75 0 L100 0 L100 25')
    } finally {
      asset.pathData = original
    }
  }, 120_000)

  it('receita antiga sem presoA no FIO continua ilegível (ARQUETIPO_ESCOLHA_ILEGIVEL), antes de qualquer escrita', async () => {
    await montar('c16-ilegivel')
    const { entrada } = await compor(spec16('c16-ilegivel'))
    const fv = structuredClone(entrada!.fieldValues)
    delete fv.composicao.arquetipo.acentos[1].presoA
    expect(() => acentosCongelados(fv, fv.spec)).toThrow(expect.objectContaining({ code: 'ARQUETIPO_ESCOLHA_ILEGIVEL' }))
  }, 120_000)

  it('prova PNG pelo renderizador: claro no miolo, dourado nos braços, tinta no fio', async () => {
    await montar('c16-prova')
    const { r } = await compor(spec16('c16-prova'), { provar: true })
    const px = async (x: number, y: number) => {
      const { data } = await sharp(r.prova!).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    }
    const c = ret(cantoneiras(r)[0])
    expect(await px(20, 20)).toBe(CLARO)
    expect(await px(c.x + c.width / 2, c.y + c.height * 0.5 + 300)).toBe(CLARO)
    // O canto de cada braço (o vértice do L) e o meio do braço de cima à esquerda: dourado, não o claro.
    for (const [x, y] of [[c.x, c.y], [c.x + c.width, c.y], [c.x, c.y + c.height], [c.x + c.width, c.y + c.height], [c.x + c.width * 0.12, c.y]]) {
      expect(await px(Math.min(x, 1079), Math.min(y, 1919)), `${x},${y}`).not.toBe(CLARO)
    }
    // O meio da borda de cima, entre os braços, fica livre.
    expect(await px(c.x + c.width / 2, c.y)).toBe(CLARO)
    const fio = camada(r, 'acento-fio')
    expect(await px(fio.position.x + fio.size.width / 2, fio.position.y + fio.size.height / 2)).not.toBe(CLARO)
  }, 120_000)
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): o #16 × story e feed, fontes reais, renderizador do Studio,
 * marca sintética. Não é aceite visual do owner nem das marcas.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t4e16-convite.test.ts
 */
describe.skipIf(!process.env.PROVAS_DIR || !fontesNoDisco())('#16 · provas visuais locais', () => {
  for (const formato of FORMATOS) {
    it(`convite ${formato}`, async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const dir = process.env.PROVAS_DIR!
      mkdirSync(dir, { recursive: true })
      await montar(`c16-prova-${formato}`)
      const { r } = await compor(spec16(`c16-prova-${formato}`, { formato }), { provar: true })
      writeFileSync(join(dir, `t4e16-convite-${formato}.png`), r.prova!)
      const { medir } = await medidorReal()
      const acento = (r.diagnostico as any).arquetipo.acentos as Array<Record<string, any>>
      writeFileSync(
        join(dir, `t4e16-convite-${formato}.json`),
        JSON.stringify(
          {
            formato,
            arquetipo: `${ID_CONVITE}@1`,
            impressao: impressaoDoArquetipo(CONVITE),
            fundo: r.fundo,
            medidor: 'createServerTextBoxMeasurer (real) · Georgia + Montserrat registradas',
            faixas: (r.diagnostico as any).arquetipo.buscaEspacial.faixas.map((x: any) => ({ membros: x.membros, candidatos: x.candidatos.length })),
            logo: (r.diagnostico as any).logo.legibilidade,
            ocupacaoDasCantoneiras: ocupacaoDoAcento(acento[0] as never, acento[0].rect),
            camadas: r.layers.map((l) => ({ id: l.id, type: l.type, position: l.position, size: l.size, content: l.content, fontFamily: (l.style as any)?.fontFamily, linhasVisuais: l.type === 'text' ? medir(l).lineCount : undefined })),
          },
          null,
          2,
        ),
      )
    }, 120_000)
  }
})
