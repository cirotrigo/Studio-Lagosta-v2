/**
 * FIXTURE de teste (T4-E): um arquétipo `liso-claro` (família E, sem foto) só para provar o contrato de fundo. NÃO é o
 * #15 `minimal-tipografico-lista` (falta o fio por item e o rodapé de 2 colunas) e NÃO entra no catálogo publicado:
 * os testes o injetam por mock do catálogo. A zona do apoio encosta na do rodapé (até .82) porque a busca espacial
 * tem no máximo DUAS faixas (`LIMITES_DA_BUSCA.faixas`) — o mesmo desvio do #7; o #15 fiel tem três (lacuna).
 */
import type { ArquetipoDeLayout } from '../../tipos'

export const ID_SEM_FOTO = 'fixture-sem-foto'

export const ARQUETIPO_SEM_FOTO: ArquetipoDeLayout = {
  id: ID_SEM_FOTO,
  versao: 1,
  codigoTaxonomico: 'MIN-09',
  nome: 'Fixture sem foto, fundo claro',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' },
  fundo: 'liso-claro',
  formatos: {
    story: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.12, w: 0.6, h: 0.2 }, zona: { xMin: 0.085, xMax: 0.75, yMin: 0.098, yMax: 0.36 } },
        apoio: { referencia: { x: 0.085, y: 0.5, w: 0.7, h: 0.2 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.46, yMax: 0.82 } },
        servico: { referencia: { x: 0.085, y: 0.84, w: 0.5, h: 0.04 }, zona: { xMin: 0.085, xMax: 0.6, yMin: 0.8, yMax: 0.883 } },
        logo: { referencia: { x: 0.74, y: 0.83, w: 0.175, h: 0.05 }, zona: { xMin: 0.62, xMax: 0.915, yMin: 0.8, yMax: 0.883 } },
      },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 1 } },
    },
    feed: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.11, w: 0.6, h: 0.22 }, zona: { xMin: 0.085, xMax: 0.75, yMin: 0.089, yMax: 0.36 } },
        apoio: { referencia: { x: 0.085, y: 0.48, w: 0.7, h: 0.22 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.44, yMax: 0.82 } },
        servico: { referencia: { x: 0.085, y: 0.85, w: 0.5, h: 0.05 }, zona: { xMin: 0.085, xMax: 0.6, yMin: 0.8, yMax: 0.922 } },
        logo: { referencia: { x: 0.74, y: 0.84, w: 0.175, h: 0.06 }, zona: { xMin: 0.62, xMax: 0.915, yMin: 0.8, yMax: 0.922 } },
      },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 1 } },
    },
  },
}

/** O mock do catálogo: o publicado de verdade + a fixture (para `vi.mock('…/arquetipos/catalogo', …)`). */
export async function catalogoComAFixture(original: () => Promise<typeof import('../../catalogo')>) {
  const real = await original()
  const copiar = <T>(v: T): T => JSON.parse(JSON.stringify(v))
  return {
    ...real,
    listarArquetipos: () => [...real.listarArquetipos(), copiar(ARQUETIPO_SEM_FOTO)],
    verArquetipo: (id: string, versao?: number) =>
      id === ID_SEM_FOTO ? (versao === undefined || versao === 1 ? copiar(ARQUETIPO_SEM_FOTO) : null) : real.verArquetipo(id, versao),
  }
}
