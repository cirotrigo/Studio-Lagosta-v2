/**
 * CP-T6 preflight — candidatos de arquétipo: as guardas existentes aplicadas a cada modelo do catálogo, sem ranking
 * nem vencedor, e o pedido explícito preservado (recusado não cai em outro).
 */
import { describe, expect, it } from 'vitest'
import { candidatosDeArquetipo } from '../candidatos'
import { listarArquetipos } from '../catalogo'

const TOPO = 'minimal-fb-topo-esquerda'
const copy = {
  blocos: [
    { papel: 'headline' as const, linhas: ['Almoço', 'de domingo'] },
    { papel: 'servico' as const, linhas: ['Domingo, 12h às 16h'] },
  ],
}
const ids = [...new Set(listarArquetipos().map((a) => a.id))]

describe('candidatosDeArquetipo', () => {
  it('sem pedido: um candidato por id do catálogo, na ordem do catálogo, com motivo em cada recusa', () => {
    const r = candidatosDeArquetipo({ formato: 'story', ...copy }, { temLogo: true })
    expect(r.origem).toBe('catalogo')
    expect(r.candidatos.map((c) => c.id)).toEqual(ids)
    expect(r.candidatos.find((c) => c.id === TOPO)).toMatchObject({ compativel: true, versao: 1 })
    for (const c of r.candidatos) if (!c.compativel) expect(c.recusa?.codigo).toMatch(/^ARQUETIPO_/)
  })

  it('marca sem logo: nenhum candidato compatível (a logo é papel obrigatório)', () => {
    const r = candidatosDeArquetipo({ formato: 'story', ...copy }, { temLogo: false })
    expect(r.candidatos.every((c) => !c.compativel)).toBe(true)
  })

  it('linhas máximas entram (HARD do compositor); seleção experimental recusa todos', () => {
    const longa = { blocos: [{ papel: 'headline' as const, linhas: ['1', '2', '3', '4', '5', '6', '7'] }, copy.blocos[1]] }
    expect(candidatosDeArquetipo({ formato: 'story', ...longa }, { temLogo: true }).candidatos.find((c) => c.id === TOPO)?.recusa?.codigo).toBe('ARQUETIPO_LINHAS_EXCEDIDAS')
    const exp = candidatosDeArquetipo({ formato: 'story', selecaoExperimental: true, ...copy }, { temLogo: true })
    expect(exp.candidatos.every((c) => c.recusa?.codigo === 'ARQUETIPO_SELECAO_NAO_SUPORTADA')).toBe(true)
  })

  it('pedido explícito: só ele é avaliado; recusado não cai em outro candidato', () => {
    const ok = candidatosDeArquetipo({ formato: 'story', arquetipo: { id: TOPO }, ...copy }, { temLogo: true })
    expect(ok).toEqual({ origem: 'explicito', candidatos: [{ id: TOPO, versao: 1, compativel: true }] })
    const divergente = candidatosDeArquetipo({ formato: 'story', arquetipo: { id: TOPO, versao: 1, impressao: 'outra' }, ...copy }, { temLogo: true })
    expect(divergente.candidatos).toHaveLength(1)
    expect(divergente.candidatos[0]).toMatchObject({ id: TOPO, versao: 1, compativel: false, recusa: { codigo: 'ARQUETIPO_IMPRESSAO_DIVERGENTE' } })
  })
})
