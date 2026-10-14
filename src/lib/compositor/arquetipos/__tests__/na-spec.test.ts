/**
 * T1a — o arquétipo na spec: resolução para id+versão+impressão, conferência da
 * impressão gravada e as recusas que não dependem da medida.
 */
import { describe, expect, it } from 'vitest'
import { CreativeError } from '@/lib/creatives/errors'
import { verArquetipo } from '../catalogo'
import { impressaoDoArquetipo } from '../impressao'
import { conferirLinhas, conferirPapeis, conferirPreferencias, disponibilidadeNoT1a, excessosDeLinhas, prepararArquetipo, resolverArquetipo, vitrineDeArquetipos } from '../na-spec'

const TOPO = 'minimal-fb-topo-esquerda'
const BASE = 'minimal-fb-base-esquerda'
const CENTRO = 'minimal-fb-centro-optico'
const impressaoDe = (id: string) => impressaoDoArquetipo(verArquetipo(id, 1)!)

function codigo(f: () => unknown): string {
  try {
    f()
  } catch (e) {
    expect(e).toBeInstanceOf(CreativeError)
    return (e as CreativeError).code
  }
  throw new Error('não recusou')
}
function detalhes(f: () => unknown): Record<string, unknown> {
  try {
    f()
  } catch (e) {
    return (e as CreativeError).details ?? {}
  }
  throw new Error('não recusou')
}

const copyDoTopo = {
  blocos: [
    { papel: 'headline' as const, linhas: ['Almoço', 'de domingo'] },
    { papel: 'servico' as const, linhas: ['Domingo, 12h às 16h'] },
  ],
}
const specDoTopo = (extra: Record<string, unknown> = {}) => ({ formato: 'story' as const, arquetipo: { id: TOPO }, ...copyDoTopo, ...extra })

describe('T1a · resolução e impressão', () => {
  it('2. id sem versão resolve a mais recente (v1) com a impressão exata', () => {
    const { resolvido } = resolverArquetipo({ id: TOPO })
    expect(resolvido).toEqual({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO) })
  })

  it('3. id + v1 reproduz a v1', () => {
    const a = resolverArquetipo({ id: CENTRO, versao: 1 })
    expect(a.resolvido).toEqual({ id: CENTRO, versao: 1, impressao: impressaoDe(CENTRO) })
    expect(a.definicao).toEqual(verArquetipo(CENTRO, 1))
  })

  it('4. impressão gravada correta passa', () => {
    expect(resolverArquetipo({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO) }).resolvido.impressao).toBe(impressaoDe(TOPO))
  })

  it('5. impressão divergente é recusada — nunca corrigida', () => {
    const f = () => resolverArquetipo({ id: TOPO, versao: 1, impressao: 'arq1-00000000000000' })
    expect(codigo(f)).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
    expect(detalhes(f)).toMatchObject({ impressaoEsperada: impressaoDe(TOPO), impressaoRecebida: 'arq1-00000000000000' })
  })

  it('6. modelo desconhecido é recusado', () => {
    expect(codigo(() => resolverArquetipo({ id: 'minimal-inexistente' }))).toBe('ARQUETIPO_DESCONHECIDO')
  })

  it('7. versão inexistente é recusada', () => {
    expect(codigo(() => resolverArquetipo({ id: TOPO, versao: 2 }))).toBe('ARQUETIPO_VERSAO_INEXISTENTE')
  })

  it('impressão sem versão, e a peça persistida sem versão, são recusadas (nunca "a mais recente")', () => {
    expect(codigo(() => resolverArquetipo({ id: TOPO, impressao: impressaoDe(TOPO) }))).toBe('ARQUETIPO_VERSAO_AUSENTE')
    expect(codigo(() => resolverArquetipo({ id: TOPO }, { persistida: true }))).toBe('ARQUETIPO_VERSAO_AUSENTE')
    // A peça persistida sem a impressão também: a equivalência com a definição de hoje nunca é presumida.
    expect(codigo(() => resolverArquetipo({ id: TOPO, versao: 1 }, { persistida: true }))).toBe('ARQUETIPO_IMPRESSAO_AUSENTE')
    expect(resolverArquetipo({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO) }, { persistida: true }).resolvido.versao).toBe(1)
  })
})

describe('T1a · recusas antes da medida', () => {
  it('sem arquétipo, nada: prepararArquetipo devolve null', () => {
    expect(prepararArquetipo({ formato: 'quadrado', ...copyDoTopo })).toBeNull()
  })

  it('8. quadrado + arquétipo é recusado (sem aproximar por feed/story)', () => {
    expect(codigo(() => prepararArquetipo(specDoTopo({ formato: 'quadrado' })))).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
  })

  it('9. CTA + arquétipo é recusado — o CTA não vira apoio nem some', () => {
    const f = () => prepararArquetipo(specDoTopo({ blocos: [...copyDoTopo.blocos, { papel: 'cta', linhas: ['Reserve'] }] }))
    expect(codigo(f)).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(detalhes(f)).toMatchObject({ naoSuportados: ['cta'], faltam: [], extras: [] })
  })

  it('10. papel obrigatório ausente é recusado', () => {
    const f = () => prepararArquetipo({ formato: 'story', arquetipo: { id: CENTRO }, blocos: [{ papel: 'headline', linhas: ['Sexta'] }, { papel: 'servico', linhas: ['18h'] }] })
    expect(codigo(f)).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(detalhes(f)).toMatchObject({ faltam: ['apoio'] })
  })

  it('11. papel não suportado é recusado (o pre não existe no centro-óptico)', () => {
    const f = () =>
      prepararArquetipo({
        formato: 'feed',
        arquetipo: { id: CENTRO },
        blocos: [
          { papel: 'pre', linhas: ['hoje'] },
          { papel: 'headline', linhas: ['Sexta'] },
          { papel: 'apoio', linhas: ['jazz ao vivo'] },
          { papel: 'servico', linhas: ['18h'] },
        ],
      })
    expect(codigo(f)).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(detalhes(f)).toMatchObject({ naoSuportados: ['pre'] })
  })

  it('camada extra e bloco com herdaDe não têm mapeamento 1:1 no T1a: recusa', () => {
    expect(codigo(() => prepararArquetipo(specDoTopo({ camadasExtras: [{ id: 'nota', linhas: ['x'], herdaDe: 'apoio' }] })))).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
    expect(
      codigo(() => prepararArquetipo(specDoTopo({ blocos: [...copyDoTopo.blocos, { papel: 'apoio', id: 'horario', herdaDe: 'servico', linhas: ['x'] }] }))),
    ).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
  })

  it('12. o modelo 2 (moldura-aberta obrigatória) é recusado até o T1b — nunca sai sem o L', () => {
    const f = () => prepararArquetipo({ formato: 'story', arquetipo: { id: BASE }, blocos: [{ papel: 'headline', linhas: ['x'] }, { papel: 'apoio', linhas: ['y'] }, { papel: 'servico', linhas: ['z'] }] })
    expect(codigo(f)).toBe('ARQUETIPO_INDISPONIVEL')
    expect(detalhes(f)).toMatchObject({ aguarda: 'T1b' })
    expect(disponibilidadeNoT1a(verArquetipo(BASE)!).disponivel).toBe(false)
    expect(disponibilidadeNoT1a(verArquetipo(TOPO)!).disponivel).toBe(true)
    expect(disponibilidadeNoT1a(verArquetipo(CENTRO)!).disponivel).toBe(true)
  })

  it('preferência posicional diferente do arquétipo é recusada; a igual é aceita e declarada; auto não conta', () => {
    const topo = verArquetipo(TOPO)!
    expect(codigo(() => conferirPreferencias(topo, { ancora: 'rodape' }))).toBe('ARQUETIPO_PREFERENCIA_CONFLITANTE')
    expect(codigo(() => conferirPreferencias(topo, { cantoDaMarca: 'nenhum' }))).toBe('ARQUETIPO_PREFERENCIA_CONFLITANTE')
    expect(conferirPreferencias(topo, { ancora: 'topo', alinha: 'esquerda' }).coincidentes).toEqual(['ancora', 'alinha'])
    expect(conferirPreferencias(topo, { ancora: 'auto', alinha: 'auto', cantoDaMarca: 'auto' }).coincidentes).toEqual([])
    expect(codigo(() => prepararArquetipo(specDoTopo({ preferencias: { alinha: 'centro' } })))).toBe('ARQUETIPO_PREFERENCIA_CONFLITANTE')
    expect(prepararArquetipo(specDoTopo({ preferencias: { ancora: 'topo', variante: 'Clássica' } }))!.preferenciasCoincidentes).toEqual(['ancora'])
  })

  it('a seleção experimental não compõe com arquétipo no T1a', () => {
    expect(codigo(() => prepararArquetipo(specDoTopo({ selecaoExperimental: true })))).toBe('ARQUETIPO_SELECAO_NAO_SUPORTADA')
  })

  it('18. linhasMax é HARD (linhas com texto, a manchete inteira); caracteresPorLinha nunca recusa', () => {
    const topo = verArquetipo(TOPO)!
    const tres = { blocos: [{ papel: 'headline' as const, linhas: ['um', 'dois', 'três'] }] }
    expect(excessosDeLinhas(topo, 'story', tres)).toEqual([{ papel: 'headline', linhas: 3, linhasMax: 2 }])
    expect(codigo(() => conferirLinhas(topo, 'story', tres))).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
    // O respiro não é linha de texto; a linha longa não é recusada aqui (a medição decide).
    expect(excessosDeLinhas(topo, 'story', { blocos: [{ papel: 'headline', linhas: ['um', '', 'dois'] }] })).toEqual([])
    expect(excessosDeLinhas(topo, 'story', { blocos: [{ papel: 'pre', linhas: ['uma linha bem mais longa que dezessete caracteres'] }] })).toEqual([])
  })

  it('a resolução completa devolve a forma resolvida e não muta a spec', () => {
    const spec = specDoTopo()
    const p = prepararArquetipo(spec)!
    expect(p.resolvido).toEqual({ id: TOPO, versao: 1, impressao: impressaoDe(TOPO) })
    expect(spec.arquetipo).toEqual({ id: TOPO })
    expect(() => conferirPapeis(p.definicao, spec)).not.toThrow()
  })

  it('a vitrine (ver-assinatura) diz o que está disponível e o que aguarda o T1b', () => {
    const v = Object.fromEntries(vitrineDeArquetipos().map((a) => [a.id, a]))
    expect(v[TOPO]).toMatchObject({ versao: 1, codigoTaxonomico: 'MIN-01', formatos: ['story', 'feed'], disponibilidade: 'disponivel' })
    expect(v[CENTRO]).toMatchObject({ versao: 1, codigoTaxonomico: 'MIN-02', disponibilidade: 'disponivel' })
    expect(v[BASE]).toMatchObject({ disponibilidade: 'aguarda-t1b' })
    expect(v[BASE].motivo).toMatch(/moldura-aberta/)
  })
})
