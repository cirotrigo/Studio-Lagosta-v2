/**
 * CP2B — o orquestrador puro da busca: a identidade da escolha, a contagem das recusas, o motivo da falta e o motivo
 * de a peça sair da referência.
 */
import { describe, expect, it } from 'vitest'

import { chaveDoCorte, corteDaEscolha, corteDaJanela, type Corte } from '@/lib/compositor/corte-da-foto'
import { mapaDeCalma } from '@/lib/compositor/mapa-de-calma'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import type { AvaliacaoDaCombinacao, ComponentesDaPontuacao, EscolhaEspacial, LeituraDoCorte, RegiaoProtegida } from '../busca-espacial-tipos'
import { contarRecusas, diagnosticoDaBusca, idDaEscolha, motivoContraAReferencia, motivoDaFalta, selecionarNoArquetipo, type ArgsDaSelecao } from '../busca-espacial'
import { partidaNoArquetipo } from '../candidatos-espaciais'
import { verArquetipo } from '../catalogo'
import type { UnidadeDoArquetipo } from '../no-compositor'
import { motivoDaVitoria, ordenarAvaliacoes } from '../pontuacao-espacial'

const componentes = (c: Partial<ComponentesDaPontuacao> = {}): ComponentesDaPontuacao => ({ custoDoTratamento: 0, calma: 0.5, contrasteNatural: 1, assunto: 1, referencia: 1, corte: 1, ...c })
const av = (indice: number, extra: Partial<AvaliacaoDaCombinacao> = {}): AvaliacaoDaCombinacao => ({
  crop: 'center-middle',
  chave: 'center-middle',
  combinacao: { indice, escolhas: [{ faixa: 0, rotulo: indice === 0 ? 'referencia' : 'acima', dy: indice === 0 ? 0 : -40 }], deslocamentos: { headline: indice === 0 ? 0 : -40 } },
  eliminada: [],
  componentes: componentes(),
  pontuacao: 0.8,
  tratamento: [],
  ...extra,
})

describe('CP2B · orquestrador', () => {
  it('a mesma escolha tem o mesmo id; o canto da logo não entra na identidade; outro dy muda o id', () => {
    const e: EscolhaEspacial = { modo: 'busca-espacial-v1', foto: 'u', corte: 'center-middle', deslocamentos: { headline: -40, apoio: -40 } }
    expect(idDaEscolha(e)).toMatch(/^be1-[0-9a-f]{12}$/)
    expect(idDaEscolha({ ...e, deslocamentos: { apoio: -40, headline: -40 } })).toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, cantoDaLogo: 'inferior-direito' })).toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, deslocamentos: { headline: -20, apoio: -20 } })).not.toBe(idDaEscolha(e))
    expect(idDaEscolha({ ...e, foto: 'outra' })).not.toBe(idDaEscolha(e))
  })

  it('cada avaliação conta uma vez por motivo distinto', () => {
    const elim = (m: string[]) => av(1, { eliminada: m.map((motivo) => ({ motivo: motivo as never, detalhe: '' })) })
    expect(contarRecusas([elim(['INVADE_REGIAO_PROTEGIDA', 'INVADE_REGIAO_PROTEGIDA', 'ORDEM_DE_LEITURA']), elim(['INVADE_REGIAO_PROTEGIDA']), av(0)])).toEqual({ INVADE_REGIAO_PROTEGIDA: 2, ORDEM_DE_LEITURA: 1 })
  })

  it('o motivo da falta: o do CP2A quando todas caem nele; senão o mais frequente', () => {
    const doCp2a = (m: string) => av(1, { eliminada: [{ motivo: 'POLARIDADE_INCOMPATIVEL', detalhe: '', motivoDoTratamento: m as never }] })
    expect(motivoDaFalta([doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA'), doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')])).toBe('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')
    const zona = av(2, { eliminada: [{ motivo: 'FORA_DA_ZONA', detalhe: '' }] })
    expect(motivoDaFalta([doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA'), zona, { ...zona }])).toBe('FORA_DA_ZONA')
    expect(motivoDaFalta([])).toBeNull()
    // Todo corte perde o assunto do catálogo: a FOTO é a causa, mesmo que o CP2A também recuse todas (o véu não salva
    // um produto cortado) — vence o motivo do CP2A uniforme.
    const cortadaETambemPolar = (i: number) =>
      av(i, { eliminada: [{ motivo: 'CORTE_PERDE_O_ASSUNTO', detalhe: '' }, { motivo: 'POLARIDADE_INCOMPATIVEL', detalhe: '', motivoDoTratamento: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA' as never }] })
    expect(motivoDaFalta([cortadaETambemPolar(1), cortadaETambemPolar(2)])).toBe('CORTE_PERDE_O_ASSUNTO')
    // Se UMA avaliação não perde o assunto, a regra de sempre (o CP2A uniforme) vale.
    expect(motivoDaFalta([cortadaETambemPolar(1), doCp2a('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')])).toBe('POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA')
  })

  it('por que saiu da referência: eliminada, véu, ou pontuação; nada quando a vencedora É a referência', () => {
    const vencedora = av(1)
    const ref = av(0)
    expect(motivoContraAReferencia([ref, vencedora], ref)).toBeNull()
    expect(motivoContraAReferencia([vencedora, { ...ref, eliminada: [{ motivo: 'INVADE_REGIAO_PROTEGIDA', detalhe: '' }] }], vencedora)).toBe('a referência caía em INVADE_REGIAO_PROTEGIDA')
    expect(motivoContraAReferencia([vencedora, { ...ref, componentes: componentes({ custoDoTratamento: 0.76 }), tratamento: [{ borda: 'rodape', estado: 'tratado', forca: 0.76 }] }], vencedora)).toBe(
      'a referência pedia véu no rodapé 0,76; aqui lê sem véu',
    )
    expect(motivoContraAReferencia([vencedora, { ...ref, pontuacao: 0.5 }], vencedora)).toBe('a referência perdia na pontuação (0,50 contra 0,80)')
    expect(motivoContraAReferencia([{ ...vencedora, crop: 'left-middle', chave: 'left-middle' }, { ...ref, componentes: componentes({ custoDoTratamento: 0.5 }), tratamento: [{ borda: 'rodape', estado: 'tratado', forca: 0.5 }] }], { ...vencedora, crop: 'left-middle', chave: 'left-middle' })).toMatch(
      /^a referência no corte center-middle pedia véu no rodapé 0,50/,
    )
  })

  it('toda válida cobre a região estimada: a cobertura decide ANTES do véu, e as duas frases dizem isso (o mesmo patamar de melhorEntre)', () => {
    const cobre = (cobertura: number) => ({ cobertura, teto: 0.4, invade: true })
    const ref = av(0, { regiaoEstimada: cobre(0.7), pontuacao: 0.9 })
    const menos = av(1, { regiaoEstimada: cobre(0.45), componentes: componentes({ custoDoTratamento: 0.5 }), pontuacao: 0.5, tratamento: [{ borda: 'rodape', estado: 'tratado', forca: 0.5 }] })
    const ordenadas = ordenarAvaliacoes([ref, menos])
    expect(ordenadas[0]).toBe(menos)
    expect(motivoContraAReferencia(ordenadas, menos)).toBe('a referência cobria 70% da região estimada como assunto; toda posição válida a cobre, e ficaram as de menor cobertura (a mínima 45%, tolerância 5 pontos)')
    expect(motivoDaVitoria(menos, ref, 0.45)).toBe('toda posição válida cobre a região estimada como assunto, e esta cobre menos (45% contra 70% da segunda)')
    const d = diagnosticoDaBusca({ escolha: { modo: 'busca-espacial-v1', foto: 'f', corte: 'center-middle', deslocamentos: { headline: -40 } }, resultado: { ordenadas, vencedora: menos, avaliadas: 2 }, faixas: [], cortesAvaliados: ['center-middle'] })
    expect(d.motivo).toMatch(/cobria 70% da região estimada.*esta cobre menos \(45% contra 70%/)
    // Dentro da tolerância a cobertura NÃO decide: volta o critério seguinte (o véu).
    const quase = av(2, { regiaoEstimada: cobre(0.48), pontuacao: 0.9 })
    expect(motivoDaVitoria(quase, menos, 0.45)).toMatch(/^lê sem véu; a segunda pedia véu no rodapé 0,50/)
  })
})

describe('F2b · a identidade dos cortes por VALOR (4a)', () => {
  const canvas = { width: 1080, height: 1920 }
  const geometria = { margemH: 92, safeTopo: 188, safeRodape: 224 }
  const arquetipo = verArquetipo('minimal-fb-topo-esquerda')!
  const unidade = (papel: 'headline' | 'servico', w: number, h: number): UnidadeDoArquetipo => ({ papel, blocos: [], pilha: { width: w, height: h, offsets: [0] } as never, ornamentos: { esquerda: 0, direita: 0, topo: 0, base: 0 }, ornamentosPorBloco: [] })
  const unidades = [unidade('headline', 700, 217), unidade('servico', 500, 51)]
  const raster: FotoCinza = { data: Buffer.alloc(540 * 960, 30), width: 540, height: 960, stride: 1, escala: 0.5, canvas }
  const mapa = mapaDeCalma(raster)
  const JANELAS: Corte[] = [corteDaJanela({ x: 0.1, y: 0, width: 0.5, height: 0.5 }), corteDaJanela({ x: 0.2, y: 0.1, width: 0.5, height: 0.5 }), corteDaJanela({ x: 0.3, y: 0.2, width: 0.5, height: 0.5 })]
  const NA_MANCHETE: RegiaoProtegida = { rect: { x: 0, y: 0, width: 1080, height: 1920 }, origem: 'catalogo', teto: 0.25 }
  const leitura = (corte: Corte, regioes: RegiaoProtegida[] = [], prior?: number): LeituraDoCorte => ({ crop: 'janela', chave: chaveDoCorte(corte), janela: corte.janela, raster, mapa, regioes, assuntoVisivel: null, ...(prior !== undefined ? { prior } : {}) })

  function args(cortes: LeituraDoCorte[], extra: Partial<ArgsDaSelecao> = {}): ArgsDaSelecao {
    const partida = partidaNoArquetipo({ arquetipo, formato: 'story', canvas, geometria, unidades, logo: null })
    if ('problemas' in partida) throw new Error(JSON.stringify(partida.problemas))
    return { arquetipo, formato: 'story', canvas, geometria, unidades, logo: null, partida, cortes, planejamento: { bordasExplicitas: [], planejar: () => { throw new Error('sem textos, sem plano') } }, foto: 'foto-x', ...extra }
  }

  it.each([
    ['2ª', [true, false, false], 1],
    ['3ª', [true, true, false], 2],
  ])('três janelas: a %s vence — avaliação, escolha, resumo e a reprodução depois de serializar são os DELA', (_nome, eliminadas, vencedora) => {
    const sel = selecionarNoArquetipo(args(JANELAS.map((c, i) => leitura(c, eliminadas[i] ? [NA_MANCHETE] : []))))
    if (!sel.ok) throw new Error('sem vencedora')
    const esperada = JANELAS[vencedora]
    expect(sel.crop).toBe('janela')
    expect(sel.chave).toBe(chaveDoCorte(esperada))
    expect(sel.escolha.corte).toBe('janela')
    expect(sel.escolha.janela).toEqual(esperada.janela)
    expect(sel.diagnostico.vencedor).toMatchObject({ crop: 'janela', chave: chaveDoCorte(esperada) })
    expect(sel.diagnostico.exemplosDeRecusa.every((e) => e.chave !== chaveDoCorte(esperada))).toBe(true)

    const gravada = JSON.parse(JSON.stringify(sel.escolha)) as EscolhaEspacial
    const corte = corteDaEscolha(gravada, { width: 1080, height: 1920 }, canvas)!
    expect(chaveDoCorte(corte)).toBe(chaveDoCorte(esperada))
    const reproduzida = selecionarNoArquetipo(args([leitura(corte)], { reproduzir: gravada }))
    if (!reproduzida.ok) throw new Error('sem reprodução')
    expect(reproduzida.chave).toBe(chaveDoCorte(esperada))
    expect(reproduzida.escolha.janela).toEqual(esperada.janela)
    expect(idDaEscolha(reproduzida.escolha)).toBe(idDaEscolha(sel.escolha))
  })

  it('o prior vai pela chave: a ideal vence a variação de pontuação igual, mesmo depois dela na entrada', () => {
    const sel = selecionarNoArquetipo(args([leitura(JANELAS[1], [], 0.9), leitura(JANELAS[0], [], 1), leitura(JANELAS[2], [], 0.9)]))
    if (!sel.ok) throw new Error('sem vencedora')
    expect(sel.chave).toBe(chaveDoCorte(JANELAS[0]))
    expect(sel.diagnostico.vencedor!.componentes!.corte).toBe(1)
  })

  it('sem prior, a regra de sempre: janela explícita e central valem 1, âncora lateral 0', () => {
    const lateral: LeituraDoCorte = { ...leitura(JANELAS[0]), crop: 'left-middle', chave: 'left-middle' }
    const central: LeituraDoCorte = { ...leitura(JANELAS[0]), crop: 'center-middle', chave: 'center-middle' }
    const corte = (l: LeituraDoCorte) => {
      const sel = selecionarNoArquetipo(args([l]))
      if (!sel.ok) throw new Error('sem vencedora')
      return sel.diagnostico.vencedor!.componentes!.corte
    }
    expect([corte(leitura(JANELAS[0])), corte(central), corte(lateral)]).toEqual([1, 1, 0])
  })

  it('o motivo diz a janela ideal, não o corte central', () => {
    const ideal = av(0, { crop: 'janela', chave: 'janela:a', componentes: componentes({ corte: 1 }), pontuacao: 0.8 })
    const variacao = av(1, { crop: 'janela', chave: 'janela:b', componentes: componentes({ corte: 0.9, referencia: 1 }), pontuacao: 0.79 })
    expect(motivoDaVitoria(ideal, variacao)).toBe('a foto não distingue: ficou a referência na janela ideal')
  })
})
