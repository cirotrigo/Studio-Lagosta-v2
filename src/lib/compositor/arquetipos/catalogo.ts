/**
 * O CATÁLOGO de arquétipos publicados (T0, 14/10/2026). Fonte: a pesquisa em
 * docs/research/canva-minimal-editor-2026-10/CATALOGO-CANDIDATO-STUDIO.md (números
 * de 0–100 lá, frações de 0–1 aqui).
 *
 * 🔴 Versão publicada é IMUTÁVEL: QUALQUER mudança em `id@versao` (geometria,
 * zona, papel e até o texto descritivo) é publicar `id@versao+1` ao lado, nunca
 * editar a antiga — a peça vai registrar a versão que usou (T1a) e precisa
 * reproduzi-la. O teste fixa a impressão de cada versão.
 *
 * Só leitura: `listarArquetipos` e `verArquetipo` devolvem CÓPIAS; a fonte é
 * privada e congelada.
 */
import type { ArquetipoDeLayout } from './tipos'

function congelarFundo<T>(valor: T): T {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelarFundo)
    Object.freeze(valor)
  }
  return valor
}

/** Cópia profunda: as definições são JSON puro. */
const copiar = <T>(valor: T): T => JSON.parse(JSON.stringify(valor))

/**
 * MIN-01 · foto inteira, título no topo à esquerda, serviço e logo na faixa de
 * baixo. Desvio da pesquisa: o fio fica no respiro entre headline e apoio
 * (story y .278, feed y .298) — o "27 / idem" da pesquisa cai dentro da caixa da
 * headline nos dois formatos.
 */
const TOPO_ESQUERDA: ArquetipoDeLayout = {
  id: 'minimal-fb-topo-esquerda',
  versao: 1,
  codigoTaxonomico: 'MIN-01',
  nome: 'Foto inteira, título no topo à esquerda',
  papeis: [
    { papel: 'pre', obrigatorio: false, ordemDeLeitura: 0 },
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 2 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 3 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 4 },
  ],
  elementos: [{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' },
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Topo escuro ou liso, onde o título pousa; o assunto no meio ou na base.',
    referencias: ['S005', 'S034', 'F034'],
  },
  formatos: {
    story: {
      papeis: {
        pre: { referencia: { x: 0.085, y: 0.12, w: 0.5, h: 0.03 }, zona: { xMin: 0.085, xMax: 0.65, yMin: 0.098, yMax: 0.18 } },
        headline: { referencia: { x: 0.085, y: 0.155, w: 0.7, h: 0.12 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.098, yMax: 0.333 } },
        apoio: { referencia: { x: 0.085, y: 0.285, w: 0.6, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.2, yMax: 0.42 } },
        servico: { referencia: { x: 0.085, y: 0.81, w: 0.55, h: 0.07 }, zona: { xMin: 0.085, xMax: 0.685, yMin: 0.72, yMax: 0.883 } },
        logo: { referencia: { x: 0.74, y: 0.81, w: 0.175, h: 0.07 }, zona: { xMin: 0.62, xMax: 0.915, yMin: 0.72, yMax: 0.883 } },
      },
      elementos: { fio: { x: 0.085, y: 0.278, w: 0.18, h: 0.003 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 17 },
        headline: { linhasMax: 2, caracteresPorLinha: 16 },
        apoio: { linhasMax: 2, caracteresPorLinha: 28 },
        servico: { linhasMax: 2, caracteresPorLinha: 30 },
      },
    },
    feed: {
      papeis: {
        pre: { referencia: { x: 0.085, y: 0.11, w: 0.5, h: 0.04 }, zona: { xMin: 0.085, xMax: 0.65, yMin: 0.089, yMax: 0.19 } },
        headline: { referencia: { x: 0.085, y: 0.155, w: 0.7, h: 0.14 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.089, yMax: 0.333 } },
        apoio: { referencia: { x: 0.085, y: 0.305, w: 0.6, h: 0.07 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.22, yMax: 0.46 } },
        servico: { referencia: { x: 0.085, y: 0.84, w: 0.55, h: 0.08 }, zona: { xMin: 0.085, xMax: 0.685, yMin: 0.74, yMax: 0.922 } },
        logo: { referencia: { x: 0.74, y: 0.84, w: 0.175, h: 0.08 }, zona: { xMin: 0.62, xMax: 0.915, yMin: 0.74, yMax: 0.922 } },
      },
      elementos: { fio: { x: 0.085, y: 0.298, w: 0.18, h: 0.003 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 17 },
        headline: { linhasMax: 2, caracteresPorLinha: 18 },
        apoio: { linhasMax: 2, caracteresPorLinha: 28 },
        servico: { linhasMax: 2, caracteresPorLinha: 30 },
      },
    },
  },
}

/**
 * MIN-01 com fio em L · título na base à esquerda, logo no topo à direita; o L
 * (┌) fica na margem do texto e termina 3–4 unidades acima da headline (conduz
 * o olho até ela). A caixa declarada do L vale para a headline na referência: o braço de cima
 * fica, e o fim do braço vertical acompanha a headline (T1b) — por isso a zona
 * da headline começa 3 unidades abaixo do fim do L, e ela nunca sobe para dentro
 * dele. A zona da logo começa depois do braço de cima.
 * Desvio da pesquisa: no feed o L tem h .50 (a pesquisa dá .46, que termina 8
 * unidades acima e quebra a própria regra do acento).
 */
const BASE_ESQUERDA: ArquetipoDeLayout = {
  id: 'minimal-fb-base-esquerda',
  versao: 1,
  codigoTaxonomico: 'MIN-01',
  nome: 'Foto inteira, título na base à esquerda, fio em L',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  elementos: [{ id: 'moldura', tipo: 'moldura-aberta', opcional: false, corPorPapel: 'texto', presoA: 'headline', canto: 'superior-esquerdo' }],
  preferencias: { ancora: 'rodape', alinha: 'esquerda', cantoDaMarca: 'superior-direito' },
  fotoIdeal: {
    areaCalma: 'base',
    assunto: ['meio'],
    descricao: 'Base escura e lisa (mesa, sombra, balcão), onde o título pousa; o assunto no meio.',
    referencias: ['S027', 'F035', 'F029'],
  },
  formatos: {
    story: {
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.06 }, zona: { xMin: 0.71, xMax: 0.915, yMin: 0.098, yMax: 0.2 } },
        headline: { referencia: { x: 0.085, y: 0.66, w: 0.8, h: 0.11 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.66, yMax: 0.8 } },
        apoio: { referencia: { x: 0.085, y: 0.78, w: 0.6, h: 0.045 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.7, yMax: 0.86 } },
        servico: { referencia: { x: 0.085, y: 0.835, w: 0.6, h: 0.045 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.74, yMax: 0.883 } },
      },
      elementos: { moldura: { x: 0.085, y: 0.11, w: 0.6, h: 0.52 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 18 },
        apoio: { linhasMax: 1, caracteresPorLinha: 32 },
        servico: { linhasMax: 2 },
      },
    },
    feed: {
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.095, w: 0.175, h: 0.07 }, zona: { xMin: 0.71, xMax: 0.915, yMin: 0.089, yMax: 0.2 } },
        headline: { referencia: { x: 0.085, y: 0.64, w: 0.8, h: 0.12 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.63, yMax: 0.8 } },
        apoio: { referencia: { x: 0.085, y: 0.78, w: 0.6, h: 0.05 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.7, yMax: 0.87 } },
        servico: { referencia: { x: 0.085, y: 0.85, w: 0.6, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.735, yMin: 0.76, yMax: 0.922 } },
      },
      elementos: { moldura: { x: 0.085, y: 0.1, w: 0.6, h: 0.5 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 18 },
        apoio: { linhasMax: 1, caracteresPorLinha: 32 },
        servico: { linhasMax: 2 },
      },
    },
  },
}

/**
 * MIN-02 · centro óptico: título curto centralizado no meio, serviço embaixo,
 * logo no canto mais calmo (o topo-centro da pesquisa é P1: os cantos de hoje
 * são quatro). O spark-4 é opcional, logo acima da headline.
 * Desvio da pesquisa: a caixa do spark é quadrada em pixels nos dois formatos
 * (43,2 px; a pesquisa dá h .025/.03, que o deformaria de jeitos diferentes).
 */
const CENTRO_OPTICO: ArquetipoDeLayout = {
  id: 'minimal-fb-centro-optico',
  versao: 1,
  codigoTaxonomico: 'MIN-02',
  nome: 'Foto inteira, título curto no centro óptico',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  elementos: [{ id: 'spark', tipo: 'spark-4', opcional: true, corPorPapel: 'destaque', presoA: 'headline' }],
  preferencias: { ancora: 'meio', alinha: 'centro', cantoDaMarca: 'auto' },
  fotoIdeal: {
    areaCalma: 'meio',
    assunto: ['deslocado'],
    descricao: 'Área lisa e ampla no centro, onde o título pousa; o assunto deslocado para um lado ou para as bordas.',
    referencias: ['S006', 'S040', 'S009'],
  },
  formatos: {
    story: {
      papeis: {
        headline: { referencia: { x: 0.2, y: 0.445, w: 0.6, h: 0.1 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.42, yMax: 0.62 } },
        apoio: { referencia: { x: 0.25, y: 0.56, w: 0.5, h: 0.05 }, zona: { xMin: 0.2, xMax: 0.8, yMin: 0.5, yMax: 0.7 } },
        servico: { referencia: { x: 0.25, y: 0.84, w: 0.5, h: 0.04 }, zona: { xMin: 0.2, xMax: 0.8, yMin: 0.76, yMax: 0.883 } },
        logo: { automatica: 'canto-mais-calmo' },
      },
      elementos: { spark: { x: 0.48, y: 0.41, w: 0.04, h: 0.0225 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1 },
      },
    },
    feed: {
      papeis: {
        headline: { referencia: { x: 0.2, y: 0.42, w: 0.6, h: 0.11 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.4, yMax: 0.62 } },
        apoio: { referencia: { x: 0.25, y: 0.55, w: 0.5, h: 0.06 }, zona: { xMin: 0.2, xMax: 0.8, yMin: 0.48, yMax: 0.7 } },
        servico: { referencia: { x: 0.25, y: 0.87, w: 0.5, h: 0.05 }, zona: { xMin: 0.2, xMax: 0.8, yMin: 0.78, yMax: 0.922 } },
        logo: { automatica: 'canto-mais-calmo' },
      },
      elementos: { spark: { x: 0.48, y: 0.38, w: 0.04, h: 0.032 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1 },
      },
    },
  },
}

const PUBLICADOS: ReadonlyArray<ArquetipoDeLayout> = congelarFundo([TOPO_ESQUERDA, BASE_ESQUERDA, CENTRO_OPTICO])

/** Todas as versões publicadas, em ordem de id (por code point: a mesma no servidor e no editor) e versão. Cada item é uma cópia. */
export function listarArquetipos(): ArquetipoDeLayout[] {
  return [...PUBLICADOS].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.versao - b.versao)).map(copiar)
}

/**
 * A regra de resolução, pura (o teste a exercita com várias versões): com
 * `versao`, exatamente `id@versao`; sem, a MAIOR versão do id.
 */
export function resolverArquetipo<T extends { id: string; versao: number }>(lista: ReadonlyArray<T>, id: string, versao?: number): T | null {
  const doId = lista.filter((a) => a.id === id)
  if (versao !== undefined) return doId.find((a) => a.versao === versao) ?? null
  return doId.reduce<T | null>((maior, a) => (!maior || a.versao > maior.versao ? a : maior), null)
}

/**
 * Uma definição publicada, como cópia. Com `versao`, exatamente `id@versao`;
 * SEM `versao`, a MAIS RECENTE do id — e a cópia traz o `versao` resolvido, que
 * é o que a peça deve registrar. `null` quando não existe.
 * Para REPRODUZIR uma peça, passe sempre a versão gravada: a forma sem versão é
 * só para escolher um arquétipo novo.
 */
export function verArquetipo(id: string, versao?: number): ArquetipoDeLayout | null {
  const achado = resolverArquetipo(PUBLICADOS, id, versao)
  return achado ? copiar(achado) : null
}
