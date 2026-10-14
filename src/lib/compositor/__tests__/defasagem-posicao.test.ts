import { describe, expect, it } from 'vitest'

import { escolhaEspacialOriginal, specComAPosicaoOriginal } from '../defasagem'
import type { SpecDePeca } from '../spec'

const spec = (preferencias?: SpecDePeca['preferencias']): SpecDePeca =>
  ({
    projectId: 1,
    formato: 'story',
    blocos: [{ papel: 'headline', linhas: ['Dia do Milk-shake', 'em Dobro'] }],
    ...(preferencias ? { preferencias } : {}),
  }) as SpecDePeca

const composicao = (ancora: unknown, alinha: unknown) => ({ composicao: { posicao: { ancora, alinha, crop: 'center-middle' } } })

describe('posição da peça na recomposição', () => {
  it('fixa a âncora e o alinhamento da composição original, mantendo as outras preferências', () => {
    const r = specComAPosicaoOriginal(spec({ cantoDaMarca: 'superior-direito' }), composicao('topo', 'esquerda'))
    expect(r.preferencias).toEqual({ cantoDaMarca: 'superior-direito', ancora: 'topo', alinha: 'esquerda' })
  })

  it('spec que já pede posição fica como está', () => {
    const pedida = spec({ alinha: 'direita' })
    expect(specComAPosicaoOriginal(pedida, composicao('topo', 'esquerda'))).toBe(pedida)
  })

  it('sem composição original legível, nada muda', () => {
    const s = spec()
    expect(specComAPosicaoOriginal(s, null)).toBe(s)
    expect(specComAPosicaoOriginal(s, {})).toBe(s)
    expect(specComAPosicaoOriginal(s, composicao('lado', 'esquerda'))).toBe(s)
  })

  it('"auto" na spec não é pedido: a posição original vale', () => {
    const r = specComAPosicaoOriginal(spec({ ancora: 'auto', alinha: 'auto' }), composicao('rodape', 'centro'))
    expect(r.preferencias).toMatchObject({ ancora: 'rodape', alinha: 'centro' })
  })
})

describe('posição da peça COM arquétipo na recomposição (T1a)', () => {
  const arquetipo = { id: 'minimal-fb-topo-esquerda', versao: 1, impressao: 'arq1-1f4ab8c4a215f2' }
  const comArquetipo = (preferencias?: SpecDePeca['preferencias']) => ({ ...spec(preferencias), arquetipo }) as SpecDePeca

  it('23. não injeta âncora nem alinhamento: o arquétipo já congela a geometria (a variante, estilo, continua fixada)', () => {
    const r = specComAPosicaoOriginal(comArquetipo(), { composicao: { posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' }, assinatura: { pageId: 'pag-1' } } })
    expect(r.preferencias).toEqual({ varianteOriginal: 'pag-1' })
    expect(r.arquetipo).toEqual(arquetipo)
  })

  it('sem variante para fixar, devolve a MESMA spec (nada muda)', () => {
    const s = comArquetipo()
    expect(specComAPosicaoOriginal(s, composicao('rodape', 'centro'))).toBe(s)
  })
})

describe('escolha espacial na recomposição (CP2B)', () => {
  const arquetipo = { id: 'minimal-fb-topo-esquerda', versao: 1, impressao: 'arq1-1f4ab8c4a215f2' }
  const comArquetipo = { ...spec(), arquetipo } as SpecDePeca
  const escolha = { modo: 'busca-espacial-v1', foto: 'drive-123', corte: 'center-top', deslocamentos: { headline: -32, servico: 0, logo: 0 }, cantoDaLogo: null }
  const gravada = (extra: Record<string, unknown>) => ({ composicao: { posicao: { ancora: 'topo', alinha: 'esquerda' }, arquetipo: { ...arquetipo, ...extra } } })
  const daBusca = (e: unknown) => gravada({ modo: 'busca-espacial-v1', buscaEspacial: { versao: 'busca-espacial-v1', id: 'esc-1', escolha: e, vencedor: null } })
  const codigo = (f: () => unknown) => {
    try {
      f()
      return null
    } catch (e) {
      return (e as { code?: string }).code ?? 'sem código'
    }
  }

  it('sem arquétipo, null — nem lê o diagnóstico', () => {
    expect(escolhaEspacialOriginal(null, spec())).toBeNull()
    expect(escolhaEspacialOriginal(daBusca(escolha), spec())).toBeNull()
  })

  it('peça do T1a (modo referência) reproduz a referência', () => {
    expect(escolhaEspacialOriginal(gravada({ modo: 'referencia', papeis: [] }), comArquetipo)).toEqual({ modo: 'referencia' })
  })

  it('a escolha da busca volta LIMPA (cópia, sem as chaves do diagnóstico)', () => {
    const fv = daBusca({ ...escolha, lixo: 1 })
    const r = escolhaEspacialOriginal(fv, comArquetipo)
    expect(r).toEqual(escolha)
    expect(r).not.toBe((fv.composicao.arquetipo as unknown as { buscaEspacial: { escolha: unknown } }).buscaEspacial.escolha)
    expect((r as typeof escolha).deslocamentos).not.toBe(escolha.deslocamentos)
    // cantoDaLogo é opcional: ausente continua ausente.
    const { cantoDaLogo: _c, ...semCanto } = escolha
    expect(escolhaEspacialOriginal(daBusca(semCanto), comArquetipo)).toEqual(semCanto)
    expect(escolhaEspacialOriginal(daBusca({ ...escolha, foto: null, cantoDaLogo: 'inferior-direito' }), comArquetipo)).toMatchObject({ foto: null, cantoDaLogo: 'inferior-direito' })
  })

  it.each([
    ['diagnóstico ausente', { composicao: { posicao: {} } }],
    ['fieldValues nulo', null],
    ['modo desconhecido', gravada({ modo: 'busca-espacial-v2' })],
    ['busca sem escolha', gravada({ modo: 'busca-espacial-v1', buscaEspacial: {} })],
    ['escolha de outro modo', daBusca({ ...escolha, modo: 'referencia' })],
    ['foto que não é texto', daBusca({ ...escolha, foto: 7 })],
    ['foto ausente', daBusca({ ...escolha, foto: undefined })],
    ['corte inválido', daBusca({ ...escolha, corte: 'meio' })],
    ['corte herdado do protótipo', daBusca({ ...escolha, corte: 'constructor' })],
    ['deslocamentos em lista', daBusca({ ...escolha, deslocamentos: [0] })],
    ['dy não inteiro', daBusca({ ...escolha, deslocamentos: { headline: 12.5 } })],
    ['dy infinito', daBusca({ ...escolha, deslocamentos: { headline: Infinity } })],
    ['dy em texto', daBusca({ ...escolha, deslocamentos: { headline: '12' } })],
    ['membro inválido', daBusca({ ...escolha, deslocamentos: { cta: 0 } })],
    ['canto inválido', daBusca({ ...escolha, cantoDaLogo: 'meio' })],
  ])('ilegível (%s) recusa com ARQUETIPO_ESCOLHA_ILEGIVEL', (_nome, fv) => {
    expect(codigo(() => escolhaEspacialOriginal(fv, comArquetipo))).toBe('ARQUETIPO_ESCOLHA_ILEGIVEL')
  })

  it.each([
    ['id', { id: 'outro' }],
    ['versão', { versao: 2 }],
    ['impressão', { impressao: 'arq1-00000000000000' }],
    ['impressão ausente', { impressao: undefined }],
  ])('diagnóstico de outra definição (%s) recusa com ARQUETIPO_ESCOLHA_ILEGIVEL', (_nome, diferente) => {
    expect(codigo(() => escolhaEspacialOriginal(gravada({ modo: 'referencia', ...diferente }), comArquetipo))).toBe('ARQUETIPO_ESCOLHA_ILEGIVEL')
  })

  it('specComAPosicaoOriginal não muda com a escolha gravada (nem âncora, nem alinhamento, nem escolha na spec)', () => {
    const fv = { composicao: { ...daBusca(escolha).composicao, assinatura: { pageId: 'pag-1' } } }
    const r = specComAPosicaoOriginal(comArquetipo, fv)
    expect(r.preferencias).toEqual({ varianteOriginal: 'pag-1' })
    expect(r).not.toHaveProperty('escolhaEspacial')
    expect(specComAPosicaoOriginal(spec(), daBusca(escolha)).preferencias).toEqual({ ancora: 'topo', alinha: 'esquerda' })
  })
})
