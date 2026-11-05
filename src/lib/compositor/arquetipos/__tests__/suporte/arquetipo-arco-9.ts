/**
 * FIXTURE de teste do #9 `minimal-divisao-cor-topo-arco@1` (MIN-04, I9 técnica, 25/10/2026): a foto numa caixa EMBAIXO,
 * com o topo em arco (`mascaraDaFoto: arco-janela`, raio 0,62 — o B das amostras aceitas), e o texto no liso em cima,
 * à esquerda; logo FIXA no canto superior direito. Referências e zonas = as das amostras Bv3 (PLANO amplo do
 * cp-t3-b-9-preflight, §1.2). NÃO está em `PUBLICADOS`: os testes a injetam por mock do catálogo (I-01). A habilitação
 * (catálogo, impressão travada, Layouts, MCP) é outra etapa.
 * H9 (25/10/2026): o catálogo publica a definição FINAL (`arcoComOAjusteDeDiagnostico`, abaixo), não esta literal; ela
 * segue como caracterização histórica.
 */
import type { ArquetipoDeLayout } from '../../tipos'

export const ID_ARCO = 'minimal-divisao-cor-topo-arco'
export const RAIO_DO_ARCO = 0.62

export const ARQUETIPO_ARCO_9: ArquetipoDeLayout = {
  id: ID_ARCO,
  versao: 1,
  codigoTaxonomico: 'MIN-04',
  nome: 'Texto no liso em cima, foto embaixo com o topo em arco',
  papeis: [
    { papel: 'pre', obrigatorio: false, ordemDeLeitura: 0 },
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'superior-direito' },
  fundo: 'foto-em-caixa',
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Assunto no centro da foto, longe dos dois cantos de cima que o arco esconde.',
    referencias: ['S024', 'S034'],
  },
  formatos: {
    story: {
      foto: { x: 0, y: 0.42, w: 1, h: 0.58 },
      mascaraDaFoto: { tipo: 'arco-janela', raio: RAIO_DO_ARCO },
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.035 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.098, yMax: 0.15 } },
        pre: { referencia: { x: 0.085, y: 0.155, w: 0.6, h: 0.03 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.15, yMax: 0.2 } },
        headline: { referencia: { x: 0.085, y: 0.19, w: 0.6, h: 0.12 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.18, yMax: 0.33 } },
        apoio: { referencia: { x: 0.085, y: 0.325, w: 0.6, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.31, yMax: 0.405 } },
      },
      limitesDeTexto: { pre: { linhasMax: 1 }, headline: { linhasMax: 2 }, apoio: { linhasMax: 2 } },
    },
    feed: {
      foto: { x: 0, y: 0.44, w: 1, h: 0.56 },
      mascaraDaFoto: { tipo: 'arco-janela', raio: RAIO_DO_ARCO },
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.035 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.089, yMax: 0.15 } },
        pre: { referencia: { x: 0.085, y: 0.16, w: 0.6, h: 0.035 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.155, yMax: 0.21 } },
        headline: { referencia: { x: 0.085, y: 0.2, w: 0.6, h: 0.13 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.19, yMax: 0.345 } },
        apoio: { referencia: { x: 0.085, y: 0.345, w: 0.6, h: 0.065 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.335, yMax: 0.43 } },
      },
      limitesDeTexto: { pre: { linhasMax: 1 }, headline: { linhasMax: 2 }, apoio: { linhasMax: 2 } },
    },
  },
}

const copiar = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/**
 * A DEFINIÇÃO FINAL da I9 (A-I1/A-I2 ADOTADOS (a)/(a) pelo Codex na R1, 25/10/2026 — é ela que a H publica; o nome
 * "de diagnóstico" fica como proveniência). A `ARQUETIPO_ARCO_9` literal acima é a caracterização histórica: ela não
 * reproduz as Bv3 no produto por dois motivos medidos, nenhum do arco:
 * - A-I1: "Bastidores da" a 87 px (800) mede 636 px; a coluna do produto numa referência de 648 px é 634
 *   (`colunaDaCaixa`: 648 − 2×6 − 2), e a escada desce a manchete do Story para 84 (a amostra mediu contra 636);
 * - A-I2: a logo 2:1 na referência do Feed (47,25 px de altura) tem 94,5 px de largura; a materialização arredonda x e
 *   largura separados (893,7 → 894, 94,5 → 95) e a caixa passa 1 px da zona efetiva (989 > 988): recusa.
 * Aqui as referências de TEXTO têm 650 px (w .602, coluna 636) nos dois formatos e a da logo do Feed 46,98 px de
 * altura (h .0348, a logo 94×47 das Bv3): as quatro tintas iguais às Bv3 e o PNG do Feed com o sha do receipt. Motor,
 * escada, fonte, assinatura, zonas, raio, corte e foto intocados.
 */
export function arcoComOAjusteDeDiagnostico(): ArquetipoDeLayout {
  const a = copiar(ARQUETIPO_ARCO_9) as any
  for (const f of ['story', 'feed'] as const) for (const p of ['pre', 'headline', 'apoio']) a.formatos[f].papeis[p].referencia.w = 0.602
  a.formatos.feed.papeis.logo.referencia.h = 0.0348
  return a as ArquetipoDeLayout
}

/**
 * O mock do catálogo: o publicado de verdade + a fixture do #9 (`base`: a literal, ou a variante de diagnóstico) +
 * `extras` (uma `@2` dublê, para provar que a `@1` gravada não segue a mais recente). Os dois são lidos a cada chamada
 * (o teste pode trocá-los entre peças).
 * H9 (R-02): com o #9 publicado, o real sai da lista ANTES da base — `resolverArquetipo` devolve o primeiro `id@versao`,
 * e o publicado esconderia a base (a literal histórica e os dublês, como o `semMascara`, deixariam de ser testados).
 */
export async function catalogoComOArco(original: () => Promise<typeof import('../../catalogo')>, extras: () => ArquetipoDeLayout[] = () => [], base: () => ArquetipoDeLayout = () => ARQUETIPO_ARCO_9) {
  const real = await original()
  const lista = () => [...real.listarArquetipos().filter((a) => a.id !== ID_ARCO), copiar(base()), ...extras().map(copiar)]
  return {
    ...real,
    listarArquetipos: lista,
    verArquetipo: (id: string, versao?: number) => {
      const a = real.resolverArquetipo(lista(), id, versao)
      return a ? copiar(a) : null
    },
  }
}
