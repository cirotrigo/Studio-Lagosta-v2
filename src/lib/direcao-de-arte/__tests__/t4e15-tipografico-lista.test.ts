/**
 * #15 `minimal-tipografico-lista` (CP-T4-E, 24/10/2026) no COMPOSITOR REAL com FONTES REAIS: Georgia e Montserrat
 * registradas no canvas e o medidor REAL do servidor (`createServerTextBoxMeasurer`), o mesmo motor do renderizador da
 * prova PNG. Dublados: o banco (em memória, não Postgres), o Blob (a persistência só captura a entrada), o registro de
 * fontes do projeto (as fontes já estão no canvas) e o autofix (com arquétipo, ajuste final é recusa).
 *
 * Prova: lista com UM fio por item autoral (também no item que quebra em duas linhas visuais), rodapé em DUAS COLUNAS
 * de texto (cta | serviço) com identidade pelo papel, TRÊS faixas sem busca (1 combinação, 0 avaliações), Story e Feed
 * próprios, sem foto/fundo claro, contrato autoral e segunda voz atravessando inteiros, medir-copy = compor, replay
 * pela identidade gravada (sem fio duplicado) e as recusas.
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
import { acentosCongelados, escolhaEspacialOriginal } from '@/lib/compositor/defasagem'
import { verArquetipo } from '@/lib/compositor/arquetipos/catalogo'
import { impressaoDoArquetipo } from '@/lib/compositor/arquetipos/impressao'
import { blocosLidosDasCamadas, vinculoDaCamada } from '@/lib/copy-autoral/efetiva'
import type { MeasureTextBox } from '@/lib/creatives/text-geometry'
import type { Layer } from '@/types/template'
import { cenario } from './suporte/compositor'
import { CLARO, COPY_15, ID_LISTA, cenario15, fontesNoDisco, medidorComFontesReais, paginaDoCenario15, spec15 } from './suporte/cenario-15'

const FORMATOS = ['story', 'feed'] as const
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } }
const LISTA = verArquetipo(ID_LISTA)!

let real: { medir: MeasureTextBox; registradas: string[] } | null = null
async function medidorReal() {
  real ??= await medidorComFontesReais(() => vi.importActual('@/lib/creatives/server-text-measurer'))
  return real
}

async function montar(id: string, assinatura?: Record<string, unknown>, tinta?: string, filete?: { abaixo: number; altura: number }) {
  const { medir } = await medidorReal()
  const pagina = await paginaDoCenario15(id, tinta, filete)
  cenario.atual = await cenario15(pagina, medir, assinatura)
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
const caixa = (l: Layer) => ({ x: l.position.x, y: l.position.y, w: l.size.width, h: l.size.height })
const fios = (r: ResultadoDaComposicao) => r.layers.filter((l) => (l.metadata as any)?.compositor?.acento?.elemento === 'fio').sort((a, b) => a.position.y - b.position.y)
const itens = (r: ResultadoDaComposicao) => ['apoio', 'apoio-2', 'apoio-3'].map((id) => camada(r, id))

describe.skipIf(!fontesNoDisco())('#15 · minimal-tipografico-lista no compositor real, fontes reais', () => {
  it('na margem da marca (30/10/2026, revisão do Codex): o fio de cada item segue a coluna da lista — margem 64 alarga, 96 recolhe, nunca sai do piso', async () => {
    for (const [margemH, x0, direita] of [[64, 64, 1005], [96, 96, 973]] as const) {
      await montar(`l15-margem-${margemH}`, { fundoClaro: CLARO, geometria: { story: { margemH } } })
      const { r } = await compor(spec15(`l15-margem-${margemH}`, { formato: 'story' }))
      const [i1] = itens(r)
      expect(i1.position.x).toBe(x0)
      const f = fios(r)
      expect(f).toHaveLength(3)
      for (const fio of f) {
        expect(fio.position.x).toBe(x0 + 6)
        // A caixa do fio do catálogo (91,8 … 977,4) na margem da marca: a direita guarda o recuo de 10,8 px além do quadro.
        expect(Math.abs(fio.position.x + fio.size.width - (direita + 6))).toBeLessThanOrEqual(1)
        expect(fio.position.x + fio.size.width).toBeLessThanOrEqual(1080 - margemH + 6.5)
      }
    }
  }, 120_000)

  it('as fontes REAIS estão no canvas e o medidor é o do servidor (Georgia ≠ fallback)', async () => {
    const { medir, registradas } = await medidorReal()
    expect(registradas.sort()).toEqual(['Georgia', 'Georgia Italica', 'Montserrat'])
    const linha = (fontFamily: string) =>
      medir({ id: 'x', type: 'text', content: 'Produzido localmente', position: { x: 0, y: 0 }, size: { width: 4000, height: 200 }, style: { fontFamily, fontSize: 100, lineHeight: 1 } } as Layer).maxLineWidth
    expect(linha('Georgia')).not.toBe(linha('Montserrat'))
    expect(linha('Georgia')).not.toBe(linha('FamiliaQueNaoExiste'))
    expect(linha('Georgia Italica')).not.toBe(linha('Georgia'))
  }, 60_000)

  for (const formato of FORMATOS) {
    it(`${formato}: lista com um fio por item, rodapé em duas colunas, três faixas, sem foto e fundo claro`, async () => {
      await montar(`l15-${formato}`)
      const H = CANVAS[formato].height
      const W = CANVAS[formato].width
      const geo = LISTA.formatos[formato]
      const { r, entrada } = await compor(spec15(`l15-${formato}`, { formato }))
      // Sem foto, fundo claro da marca (o mesmo no resultado e na persistência).
      expect(r.layers.some((l) => l.type === 'image')).toBe(false)
      expect(r.fundo).toBe(CLARO)
      expect(entrada!.background).toBe(CLARO)
      expect(entrada!.fieldValues.spec.arquetipo).toEqual({ id: ID_LISTA, versao: 1, impressao: impressaoDoArquetipo(LISTA) })

      // A LISTA: uma camada por linha autoral, todas do bloco `lista`, na ordem do autor.
      const [i1, i2, i3] = itens(r)
      expect([i1, i2, i3].map((l) => l.content)).toEqual(COPY_15.blocos[1].linhas)
      expect([i1, i2, i3].map((l) => vinculoDaCamada(l))).toEqual([0, 1, 2].map((i) => ({ bloco: 'lista', linhas: [i] })))
      const { medir } = await medidorReal()
      // A lista tem UM corpo: o item longo encolheu a escada (medida real) e puxou os outros — nunca um item menor.
      expect(new Set([i1, i2, i3].map((l) => l.style?.fontSize)).size).toBe(1)
      expect(Number(i1.style?.fontSize)).toBeLessThan(38)
      // Cada item é UMA linha visual (a casa não quebra a linha do autor: a que não cabe a 80% é recusada, abaixo).
      expect([i1, i2, i3].map((l) => medir(l).lineCount)).toEqual([1, 1, 1])

      // UM fio por item, ACIMA dele, no vão: nunca encosta no item de cima nem no próprio.
      const f = fios(r)
      expect(f).toHaveLength(3)
      expect(f.map((l) => l.id)).toEqual(['acento-fio-item1', 'acento-fio-item2', 'acento-fio-item3'])
      expect(f.map((l) => (l.metadata as any).compositor.acento.item)).toEqual([1, 2, 3])
      const vaoAcima = Math.round((geo.papeis.apoio as any).referencia.y * H - (geo.elementos!.fio.y + geo.elementos!.fio.h) * H)
      for (const [k, item] of [i1, i2, i3].entries()) {
        const fio = f[k]
        expect(fio.position.y + fio.size.height, `fio ${k + 1}`).toBeLessThanOrEqual(item.position.y)
        expect(item.position.y - (fio.position.y + fio.size.height), `vão do fio ${k + 1}`).toBeGreaterThanOrEqual(vaoAcima - 1)
        expect(item.position.y - (fio.position.y + fio.size.height), `vão do fio ${k + 1}`).toBeLessThanOrEqual(vaoAcima + 1)
        if (k > 0) expect(fio.position.y, `fio ${k + 1} abaixo do item ${k}`).toBeGreaterThanOrEqual([i1, i2, i3][k - 1].position.y + [i1, i2, i3][k - 1].size.height)
        expect(fio.size.width).toBe(Math.round(geo.elementos!.fio.w * W))
        expect(fio.position.x).toBe(i1.position.x + 6)
      }
      // Cada fio acompanha o topo do SEU item: o passo entre fios é o passo entre itens.
      expect(f[2].position.y - f[1].position.y).toBe(i3.position.y - i2.position.y)
      expect(f[1].position.y - f[0].position.y).toBe(i2.position.y - i1.position.y)

      // RODAPÉ em duas colunas de TEXTO, identidade pelo papel: cta à esquerda, serviço à direita, sem sobreposição.
      const cta = camada(r, 'cta')
      const servico = camada(r, 'servico')
      expect([cta.content, servico.content]).toEqual(['Compre em nosso site', 'www.restaurante.com.br'])
      expect([vinculoDaCamada(cta), vinculoDaCamada(servico)]).toEqual([{ bloco: 'chamada', linhas: [0] }, { bloco: 'endereco', linhas: [0] }])
      const zc = (geo.papeis.cta as any).zona
      const zs = (geo.papeis.servico as any).zona
      expect(cta.position.x).toBeGreaterThanOrEqual(zc.xMin * W - 1)
      expect(cta.position.x + cta.size.width).toBeLessThanOrEqual(zc.xMax * W + 1)
      expect(servico.position.x).toBeGreaterThanOrEqual(zs.xMin * W - 1)
      expect(servico.position.x + servico.size.width).toBeLessThanOrEqual(zs.xMax * W + 1)
      expect(cta.position.x + cta.size.width).toBeLessThan(servico.position.x)
      for (const l of [cta, servico]) expect(l.position.y).toBeGreaterThanOrEqual(0.82 * H - 1)

      // Manchete: 3 linhas, a última na SEGUNDA VOZ (declarada pelo autor, `linhasNaVoz2`), Georgia bold itálica.
      expect(camada(r, 'headline').content).toBe('Algo\nnovo feito')
      expect(camada(r, 'headline2').content).toBe('para você')
      expect(camada(r, 'headline2').style).toMatchObject({ fontFamily: 'Georgia Italica' })
      expect(camada(r, 'headline2').position.y + camada(r, 'headline2').size.height).toBeLessThanOrEqual(0.397 * (formato === 'story' ? H : H) + 1)
      // Logo no canto superior direito (decisão do owner, 24/10), sem tocar a manchete.
      const logo = camada(r, 'logo')
      expect(logo.position.x).toBeGreaterThanOrEqual(0.74 * W - 1)
      expect(logo.position.y).toBeLessThan(0.2 * H)
      for (const id of ['headline', 'headline2']) expect(camada(r, id).position.x + camada(r, id).size.width).toBeLessThanOrEqual(logo.position.x)

      // TRÊS faixas, sem busca: cada uma com um candidato (a partida), 1 combinação, 0 avaliações.
      const busca = (r.diagnostico as any).arquetipo.buscaEspacial
      expect(busca.faixas.map((x: any) => x.membros)).toEqual([['headline', 'logo'], ['apoio'], ['cta', 'servico']])
      expect(busca.faixas.map((x: any) => x.candidatos.length)).toEqual([1, 1, 1])
      expect(busca.avaliadas ?? busca.combinacoesAvaliadas ?? 0).toBe(0)

      // A copy efetiva lida das camadas = o contrato (ids, ordem, linhas, segunda voz): nada fundido, cortado ou forjado.
      const lidos = blocosLidosDasCamadas(COPY_15 as never, r.layers)
      expect(lidos.lacunas).toEqual([])
      expect(lidos.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, b.estilo?.linhasNaVoz2 ?? null])).toEqual(
        COPY_15.blocos.map((b) => [b.id, b.funcao, b.ordem, b.linhas, (b as any).estilo?.linhasNaVoz2 ?? null]),
      )
      const efetiva = entrada!.copyAutoral as { blocos: Array<{ id: string; ordem: number; linhas: string[] }> }
      expect(efetiva.blocos.map((b) => [b.id, b.ordem, b.linhas])).toEqual(COPY_15.blocos.map((b) => [b.id, b.ordem, b.linhas]))

      // A receita gravada: um registro por fio desenhado, todos da mesma receita e da mesma cor (a da lista).
      const gravados = entrada!.fieldValues.composicao.arquetipo.acentos as Array<Record<string, any>>
      expect(gravados.map((a) => [a.elemento, a.item, a.camada])).toEqual([1, 2, 3].map((k) => ['fio', k, `acento-fio-item${k}`]))
      expect(new Set(gravados.map((a) => a.cor)).size).toBe(1)

      // O medir-copy diz o MESMO: cabe, os 3 fios nas mesmas caixas, o mesmo fundo.
      const m = await medirCopyDoProjeto({ projectId: 9002, formato, variante: `l15-${formato}`, copyAutoral: COPY_15, arquetipo: { id: ID_LISTA } } as never)
      expect(m.fundo).toBe(CLARO)
      expect(m.medicao.cabeTudo).toBe(true)
      const previstos = (m.medicao.arquetipo as any).acentos.previstos as Array<{ item: number; rect: Record<string, number> }>
      expect(previstos.map((p) => p.item)).toEqual([1, 2, 3])
      expect(previstos.map((p) => p.rect)).toEqual(f.map((l) => ({ x: l.position.x, y: l.position.y, width: l.size.width, height: l.size.height })))
    }, 120_000)
  }

  it('prova PNG pelo renderizador: fundo claro no canto e tinta do fio na linha de cada fio', async () => {
    await montar('l15-prova')
    const { r } = await compor(spec15('l15-prova'), { provar: true })
    const px = async (x: number, y: number) => {
      const { data } = await sharp(r.prova!).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true })
      return `#${[...data.subarray(0, 3)].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
    }
    expect(await px(20, 20)).toBe(CLARO)
    for (const fio of fios(r)) expect(await px(fio.position.x + 200, fio.position.y + Math.floor(fio.size.height / 2))).not.toBe(CLARO)
  }, 120_000)

  it('replay pela identidade gravada: mesma geometria, 3 fios (a receita não se repete por item), fundo congelado', async () => {
    await montar('l15-replay')
    const { r, entrada } = await compor(spec15('l15-replay'))
    const gravada = entrada!.fieldValues.spec
    const escolha = escolhaEspacialOriginal(entrada!.fieldValues, gravada)
    const acentos = acentosCongelados(entrada!.fieldValues, gravada)
    expect(acentos).toHaveLength(3)
    const { r: replay } = await compor({ ...spec15('l15-replay'), arquetipo: gravada.arquetipo }, { ...(escolha ? { escolhaEspacial: escolha } : {}), acentosCongelados: acentos!, fundoCongelado: CLARO })
    const ids = ['headline', 'headline2', 'apoio', 'apoio-2', 'apoio-3', 'cta', 'servico', 'logo', 'acento-fio-item1', 'acento-fio-item2', 'acento-fio-item3']
    for (const id of ids) expect(caixa(camada(replay, id)), id).toEqual(caixa(camada(r, id)))
    expect(fios(replay)).toHaveLength(3)
    expect(replay.fundo).toBe(CLARO)
  }, 120_000)

  it('recusas honestas: respiro na lista, quarto item, sem cta, com foto, marca sem claro, cta em modelo antigo', async () => {
    await montar('l15-recusas')
    const com = (blocos: Array<Record<string, unknown>>) => ({ ...COPY_15, blocos })
    const [manchete, lista, chamada, endereco] = COPY_15.blocos
    const antes = cap.entradas.length
    const respiro = await recusa(compor(spec15('l15-recusas', { copyAutoral: com([manchete, { ...lista, linhas: ['Artesanal', '', 'Sustentável'] }, chamada, endereco]) })))
    expect(respiro.code).toBe('ARQUETIPO_LISTA_COM_RESPIRO')
    const quatro = await recusa(compor(spec15('l15-recusas', { copyAutoral: com([manchete, { ...lista, linhas: ['A', 'B', 'C', 'D'] }, chamada, endereco]) })))
    expect([quatro.code, quatro.details?.excedidas]).toEqual(['ARQUETIPO_LINHAS_EXCEDIDAS', [{ papel: 'apoio', linhas: 4, linhasMax: 3 }]])
    const semCta = await recusa(compor(spec15('l15-recusas', { copyAutoral: com([manchete, lista, { ...endereco, ordem: 2 }]) })))
    expect([semCta.code, semCta.details?.faltam]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['cta']])
    const comFoto = await recusa(compor(spec15('l15-recusas', { foto: { driveFileId: 'foto-sintetica' } })))
    expect(comFoto.code).toBe('ARQUETIPO_FOTO_NAO_SUPORTADA')
    // O item que só caberia QUEBRANDO em duas linhas visuais: recusa com o orçamento (a casa não quebra a linha do autor),
    // nunca dois itens nem um fio a mais.
    const quebra = await recusa(compor(spec15('l15-recusas', { copyAutoral: com([manchete, { ...lista, linhas: ['Artesanal', 'Sustentável', 'Produzido localmente, com ingredientes frescos da nossa estação'] }, chamada, endereco]) })))
    expect(quebra.message).toMatch(/apoio tem linha maior que a coluna da referência .* mesmo a 80% da fonte/)
    // A coluna da direita não cabe: o serviço longo passa da zona — recusa, nunca invade a coluna do cta.
    const longo = await recusa(compor(spec15('l15-recusas', { copyAutoral: com([manchete, lista, chamada, { ...endereco, linhas: ['Rua das Palmeiras, 1234 — Centro, Vitória · ES'] }]) })))
    expect(longo.code).toMatch(/^ARQUETIPO_(TEXTO_NAO_CABE|FORA_DA_ZONA)$/)
    // Um modelo antigo continua sem lugar para o cta (o contrato só cresceu para quem o declara).
    const antigo = await recusa(compor({ ...spec15('l15-recusas'), arquetipo: { id: 'minimal-titulo-gigante' }, foto: { driveFileId: 'foto-sintetica' } }))
    expect([antigo.code, antigo.details?.naoSuportados]).toEqual(['ARQUETIPO_PAPEIS_INCOMPATIVEIS', ['cta']])
    expect(cap.entradas.length).toBe(antes)
    await montar('l15-sem-claro', {})
    expect((await recusa(compor(spec15('l15-sem-claro')))).code).toBe('ARQUETIPO_FUNDO_INDISPONIVEL')
    expect(cap.entradas.length).toBe(antes)
  }, 120_000)
})

/**
 * Rodada 1 (P2-1 do Codex): o ornamento do ARRANJO preso ao 1º item da lista (um filete sob o texto, como a página de
 * assinatura o desenha) é obstáculo do fio do item seguinte — pelo que ele ocupa, não pelo vão inteiro. No compor e no
 * medir-copy, a mesma guarda: o filete que desce até o fio 2 RECUSA (o fio é obrigatório e não é empurrado); o filete rente
 * ao item (controle) compõe, desenhado, sem tocar fio nenhum.
 */
describe.skipIf(!fontesNoDisco())('#15 · rodada 1 · ornamento do arranjo no vão da lista', () => {
  const intersecta = (a: Layer, b: Layer) =>
    a.position.x < b.position.x + b.size.width && b.position.x < a.position.x + a.size.width && a.position.y < b.position.y + b.size.height && b.position.y < a.position.y + a.size.height
  const fileteDa = (r: ResultadoDaComposicao) => r.layers.find((l) => l.type === 'shape' && !(l.metadata as any)?.compositor?.acento)

  it('controle: filete rente ao 1º item — compõe, o filete é desenhado e não toca fio nenhum; medir diz o mesmo', async () => {
    await montar('l15-filete-rente', undefined, undefined, { abaixo: 8, altura: 4 })
    const { r } = await compor(spec15('l15-filete-rente'))
    const filete = fileteDa(r)
    expect(filete, 'o filete do arranjo foi desenhado').toBeDefined()
    expect(filete!.position.y).toBeGreaterThan(camada(r, 'apoio').position.y)
    expect(fios(r)).toHaveLength(3)
    for (const f of fios(r)) expect(intersecta(f, filete!), f.id).toBe(false)
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', variante: 'l15-filete-rente', copyAutoral: COPY_15, arquetipo: { id: ID_LISTA } } as never)
    expect((m.medicao.arquetipo as any).acentos.recusas).toEqual([])
  }, 120_000)

  it('filete do 1º item que desce até o fio do 2º: o compor RECUSA (nada persistido) e o medir-copy declara a mesma recusa', async () => {
    await montar('l15-filete-vao', undefined, undefined, { abaixo: 110, altura: 6 })
    const antes = cap.entradas.length
    const e = await recusa(compor(spec15('l15-filete-vao')))
    expect(e.code).toBe('ARQUETIPO_ELEMENTO_NAO_CABE')
    expect(e.details?.problemas.map((p: any) => [p.elemento, p.item, p.opcional])).toEqual([['fio', 2, false]])
    expect(e.details?.problemas[0].motivo).toMatch(/encosta em apoio#1/)
    expect(cap.entradas.length).toBe(antes)
    const m = await medirCopyDoProjeto({ projectId: 9002, formato: 'story', variante: 'l15-filete-vao', copyAutoral: COPY_15, arquetipo: { id: ID_LISTA } } as never)
    expect((m.medicao.arquetipo as any).acentos.recusas.map((p: any) => [p.elemento, p.item])).toEqual([['fio', 2]])
  }, 120_000)
})

/**
 * Provas visuais LOCAIS (só com PROVAS_DIR; o CI pula): o #15 × story e feed, fontes reais, renderizador do Studio,
 * marca sintética. Não é aceite visual do owner nem das marcas.
 *   PROVAS_DIR=/caminho npx vitest run src/lib/direcao-de-arte/__tests__/t4e15-tipografico-lista.test.ts
 */
describe.skipIf(!process.env.PROVAS_DIR || !fontesNoDisco())('#15 · provas visuais locais', () => {
  for (const formato of FORMATOS) {
    it(`tipográfico com lista ${formato}`, async () => {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const { join } = await import('node:path')
      const dir = process.env.PROVAS_DIR!
      mkdirSync(dir, { recursive: true })
      await montar(`l15-prova-${formato}`)
      const { r } = await compor(spec15(`l15-prova-${formato}`, { formato }), { provar: true })
      writeFileSync(join(dir, `t4e15-tipografico-lista-${formato}.png`), r.prova!)
      const { medir } = await medidorReal()
      writeFileSync(
        join(dir, `t4e15-tipografico-lista-${formato}.json`),
        JSON.stringify(
          {
            formato,
            arquetipo: `${ID_LISTA}@1`,
            impressao: impressaoDoArquetipo(LISTA),
            fundo: r.fundo,
            medidor: 'createServerTextBoxMeasurer (real) · Georgia + Montserrat registradas',
            faixas: (r.diagnostico as any).arquetipo.buscaEspacial.faixas.map((x: any) => ({ membros: x.membros, candidatos: x.candidatos.length })),
            camadas: r.layers.map((l) => ({ id: l.id, type: l.type, position: l.position, size: l.size, content: l.content, fontFamily: (l.style as any)?.fontFamily, linhasVisuais: l.type === 'text' ? medir(l).lineCount : undefined })),
          },
          null,
          2,
        ),
      )
    }, 120_000)
  }
})
