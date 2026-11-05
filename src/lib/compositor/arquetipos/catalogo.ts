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

/**
 * MIN-10 · título gigante (T4-A, 24/10/2026): a palavra é a imagem. A headline tem ESCALA DOMINANTE — cresce a partir
 * do corpo da assinatura até ocupar a referência (largura .83, altura .26/.27) —, o apoio pequeno faz contraponto
 * ALINHADO À DIREITA (alinhamento próprio do papel; o resto à esquerda) e serviço + logo fecham a faixa de baixo. Sem sangria no v1: a caixa mede dentro da margem.
 * Desvios da pesquisa (CATALOGO-CANDIDATO-STUDIO.md §3, #7): a zona da headline vai até .397/.388, não "topo 10–48"
 * (a âncora topo pede a zona até 40% e nenhuma zona de texto passa de 30% da altura); a zona do apoio encosta na do serviço (a busca
 * espacial tem duas faixas); a logo, que o catálogo não posiciona, fica no canto inferior direito.
 */
const TITULO_GIGANTE: ArquetipoDeLayout = {
  id: 'minimal-titulo-gigante',
  versao: 1,
  codigoTaxonomico: 'MIN-10',
  nome: 'Foto inteira, título gigante no topo',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0, escala: 'dominante' },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 1, alinha: 'direita' },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' },
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Metade de cima lisa ou escura, onde a palavra gigante pousa; o assunto no meio ou na base.',
    referencias: ['S025', 'F014', 'F018'],
  },
  formatos: {
    story: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.12, w: 0.83, h: 0.26 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.098, yMax: 0.397 } },
        apoio: { referencia: { x: 0.55, y: 0.7, w: 0.365, h: 0.07 }, zona: { xMin: 0.5, xMax: 0.915, yMin: 0.64, yMax: 0.82 } },
        servico: { referencia: { x: 0.085, y: 0.84, w: 0.55, h: 0.043 }, zona: { xMin: 0.085, xMax: 0.635, yMin: 0.78, yMax: 0.883 } },
        logo: { referencia: { x: 0.74, y: 0.82, w: 0.175, h: 0.063 }, zona: { xMin: 0.65, xMax: 0.915, yMin: 0.78, yMax: 0.883 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 10 },
        apoio: { linhasMax: 2, caracteresPorLinha: 20 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
      },
    },
    feed: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.11, w: 0.83, h: 0.27 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.089, yMax: 0.388 } },
        apoio: { referencia: { x: 0.55, y: 0.68, w: 0.365, h: 0.08 }, zona: { xMin: 0.5, xMax: 0.915, yMin: 0.62, yMax: 0.8 } },
        servico: { referencia: { x: 0.085, y: 0.86, w: 0.55, h: 0.062 }, zona: { xMin: 0.085, xMax: 0.635, yMin: 0.76, yMax: 0.922 } },
        logo: { referencia: { x: 0.74, y: 0.85, w: 0.175, h: 0.072 }, zona: { xMin: 0.65, xMax: 0.915, yMin: 0.76, yMax: 0.922 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 10 },
        apoio: { linhasMax: 2, caracteresPorLinha: 20 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
      },
    },
  },
}

/**
 * MIN-09 · tipográfico com lista (#15, 24/10/2026): sem foto, fundo liso CLARO da marca. Manchete de até 3 linhas no topo
 * à esquerda; a LISTA de até 3 itens (o apoio, um item por linha autoral) com um fio fino ACIMA de cada item; o rodapé em
 * DUAS COLUNAS de texto — o cta à esquerda e o serviço à direita, cada um com zona própria. Três faixas (manchete,
 * lista, rodapé): sem foto não há busca, cada faixa fica na partida.
 * Desvios da pesquisa (S055, CATALOGO-CANDIDATO-STUDIO.md §6): o rodapé sobe para 84–88 (a área segura do Studio
 * termina em 88,3); a logo, que a S055 não tem, fica no canto superior direito (todo publicado tem a marca) e por isso a
 * zona da manchete vai até .72; nenhuma zona de texto passa de 30% da altura (a regra da casa); sem as bolinhas à direita dos itens (o catálogo não as pede); o fio tem .82 da largura
 * (o .83 da lista passaria da área segura com a folga de desenho do texto).
 */
const TIPOGRAFICO_LISTA: ArquetipoDeLayout = {
  id: 'minimal-tipografico-lista',
  versao: 1,
  codigoTaxonomico: 'MIN-09',
  nome: 'Sem foto, manchete e lista com fios, rodapé em duas colunas',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 1, lista: true },
    { papel: 'cta', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 3 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 4 },
  ],
  elementos: [{ id: 'fio', tipo: 'fio-fino', opcional: false, corPorPapel: 'texto', presoA: 'apoio', porItem: true }],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'superior-direito' },
  fundo: 'liso-claro',
  formatos: {
    story: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.12, w: 0.63, h: 0.24 }, zona: { xMin: 0.085, xMax: 0.72, yMin: 0.098, yMax: 0.397 } },
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.05 }, zona: { xMin: 0.74, xMax: 0.915, yMin: 0.098, yMax: 0.2 } },
        apoio: { referencia: { x: 0.085, y: 0.5, w: 0.83, h: 0.26 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.48, yMax: 0.779 } },
        cta: { referencia: { x: 0.085, y: 0.84, w: 0.4, h: 0.035 }, zona: { xMin: 0.085, xMax: 0.49, yMin: 0.82, yMax: 0.883 } },
        servico: { referencia: { x: 0.52, y: 0.84, w: 0.395, h: 0.035 }, zona: { xMin: 0.52, xMax: 0.915, yMin: 0.82, yMax: 0.883 } },
      },
      itens: { apoio: { vao: 0.055 } },
      elementos: { fio: { x: 0.085, y: 0.488, w: 0.82, h: 0.002 } },
      limitesDeTexto: {
        headline: { linhasMax: 3, caracteresPorLinha: 16 },
        apoio: { linhasMax: 3, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 24 },
        servico: { linhasMax: 1, caracteresPorLinha: 24 },
      },
    },
    feed: {
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.11, w: 0.63, h: 0.25 }, zona: { xMin: 0.085, xMax: 0.72, yMin: 0.089, yMax: 0.388 } },
        logo: { referencia: { x: 0.74, y: 0.095, w: 0.175, h: 0.06 }, zona: { xMin: 0.74, xMax: 0.915, yMin: 0.089, yMax: 0.2 } },
        apoio: { referencia: { x: 0.085, y: 0.48, w: 0.83, h: 0.28 }, zona: { xMin: 0.085, xMax: 0.915, yMin: 0.47, yMax: 0.769 } },
        cta: { referencia: { x: 0.085, y: 0.86, w: 0.4, h: 0.045 }, zona: { xMin: 0.085, xMax: 0.49, yMin: 0.85, yMax: 0.922 } },
        servico: { referencia: { x: 0.52, y: 0.86, w: 0.395, h: 0.045 }, zona: { xMin: 0.52, xMax: 0.915, yMin: 0.85, yMax: 0.922 } },
      },
      itens: { apoio: { vao: 0.06 } },
      elementos: { fio: { x: 0.085, y: 0.465, w: 0.82, h: 0.003 } },
      limitesDeTexto: {
        headline: { linhasMax: 3, caracteresPorLinha: 16 },
        apoio: { linhasMax: 3, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 24 },
        servico: { linhasMax: 1, caracteresPorLinha: 24 },
      },
    },
  },
}

/**
 * MIN-09 · convite tipográfico (#16, 24/10/2026): sem foto, fundo liso CLARO da marca (F1, escolha do owner); tudo
 * centrado. A logo FIXA no topo-centro (d09 liberado pelo owner só para este modelo, escala normal, sem tratamento novo);
 * o pré, a manchete de duas linhas, o apoio com UM fio fino obrigatório acima dele, o serviço e, na base, a linha final
 * da chamada (o papel `cta` — "www…", "@perfil": o autor escreve; não há papel URL). As CANTONEIRAS emolduram a peça:
 * presas à PEÇA (não a um texto), ocupam só os quatro braços — o miolo, onde os textos e a logo moram, não é obstáculo.
 * Três faixas (logo · conjunto central · chamada): sem foto não há busca, cada faixa fica na partida.
 * Desvios da referência (F036 do grid-06, CATALOGO-CANDIDATO-STUDIO.md, preflight do #16): o fundo é o claro da marca, não
 * o cetim escuro texturizado; um fio só (o de baixo da F036 fica de fora); sem os sparks que ladeiam o apoio (o spark só
 * pousa acima ou abaixo de um texto); a marca de texto vira a logo em contain; o braço da cantoneira é o do asset (25% da
 * caixa em cada eixo — no Story, mais longo na vertical); não há referência Story: o Story é adaptação. Ajuste da
 * execução sobre a geometria do preflight: a referência da manchete no Feed tem h .12 (não .11) — duas linhas na escala do
 * Feed pedem a mesma folga proporcional que o Story tem (.11 recusava a manchete de 2 linhas da marca de teste por 6 px).
 */
const CONVITE: ArquetipoDeLayout = {
  id: 'minimal-tipografico-convite',
  versao: 1,
  codigoTaxonomico: 'MIN-09',
  nome: 'Sem foto, convite centrado com cantoneiras',
  papeis: [
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'pre', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 3 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 4 },
    { papel: 'cta', obrigatorio: true, ordemDeLeitura: 5 },
  ],
  elementos: [
    { id: 'cantoneiras', tipo: 'cantoneiras', opcional: false, corPorPapel: 'destaque' },
    { id: 'fio', tipo: 'fio-fino', opcional: false, corPorPapel: 'texto', presoA: 'apoio' },
  ],
  preferencias: { ancora: 'meio', alinha: 'centro', cantoDaMarca: 'superior-centro' },
  fundo: 'liso-claro',
  formatos: {
    story: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.13, w: 0.18, h: 0.04 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.098, yMax: 0.2 } },
        pre: { referencia: { x: 0.3, y: 0.3, w: 0.4, h: 0.035 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.27, yMax: 0.36 } },
        headline: { referencia: { x: 0.14, y: 0.36, w: 0.72, h: 0.1 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.34, yMax: 0.52 } },
        apoio: { referencia: { x: 0.25, y: 0.53, w: 0.5, h: 0.035 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.5, yMax: 0.62 } },
        servico: { referencia: { x: 0.25, y: 0.62, w: 0.5, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.58, yMax: 0.7 } },
        cta: { referencia: { x: 0.32, y: 0.8, w: 0.36, h: 0.035 }, zona: { xMin: 0.22, xMax: 0.78, yMin: 0.76, yMax: 0.86 } },
      },
      elementos: { cantoneiras: { x: 0.085, y: 0.1, w: 0.83, h: 0.78 }, fio: { x: 0.36, y: 0.497, w: 0.28, h: 0.002 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 18 },
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 26 },
      },
    },
    feed: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.125, w: 0.18, h: 0.045 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.089, yMax: 0.2 } },
        pre: { referencia: { x: 0.3, y: 0.32, w: 0.4, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.29, yMax: 0.4 } },
        headline: { referencia: { x: 0.14, y: 0.375, w: 0.72, h: 0.12 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.34, yMax: 0.56 } },
        apoio: { referencia: { x: 0.25, y: 0.56, w: 0.5, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.52, yMax: 0.64 } },
        servico: { referencia: { x: 0.25, y: 0.655, w: 0.5, h: 0.045 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.62, yMax: 0.74 } },
        cta: { referencia: { x: 0.32, y: 0.82, w: 0.36, h: 0.04 }, zona: { xMin: 0.22, xMax: 0.78, yMin: 0.78, yMax: 0.9 } },
      },
      elementos: { cantoneiras: { x: 0.085, y: 0.09, w: 0.83, h: 0.83 }, fio: { x: 0.36, y: 0.537, w: 0.28, h: 0.003 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 18 },
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 26 },
      },
    },
  },
}

/**
 * MIN-09 @2 · o convite com CANTONEIRAS DE BRAÇO IGUAL e margens internas menores (#16 C2, 24/10/2026; o owner recusou
 * esteticamente o C1 e escolheu C2). O `@1` fica intocado ao lado. Desvios sobre o `@1`:
 * - `braco: 0.12` nas cantoneiras: cada L com braço de round(0,12 × 1080) = 130 px nos DOIS eixos, em Story e Feed. O
 *   path é derivado na peça nova (`receitasDoArquetipo` com o formato) e congelado na receita com `derivacao`; o asset
 *   `cantoneiras@1` (25% da caixa por eixo) não muda. A caixa da moldura é a do `@1` (já encosta na área segura HARD).
 * - margens internas menores, pedidas pelo owner: a logo e a chamada sobem/descem para a altura do meio dos Ls, e o
 *   conjunto central se abre (ritmo 1,2 × o do `@1`); a manchete ganha folga para duas linhas (h .11 no Story, .13 no
 *   Feed). Toda zona de papel fica fora da ocupação dos Ls.
 * - Story: a zona do serviço começa em .61 (não .62): .62 só TOCAVA a do apoio (.50–.62) e a peça teria 4 faixas, acima
 *   do teto 3 sem foto; com .61 continuam as 3 faixas do `@1` (logo · conjunto central · chamada).
 */
const CONVITE_V2: ArquetipoDeLayout = {
  id: 'minimal-tipografico-convite',
  versao: 2,
  codigoTaxonomico: 'MIN-09',
  nome: 'Sem foto, convite centrado com cantoneiras',
  papeis: [
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'pre', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 3 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 4 },
    { papel: 'cta', obrigatorio: true, ordemDeLeitura: 5 },
  ],
  elementos: [
    { id: 'cantoneiras', tipo: 'cantoneiras', opcional: false, corPorPapel: 'destaque', braco: 0.12 },
    { id: 'fio', tipo: 'fio-fino', opcional: false, corPorPapel: 'texto', presoA: 'apoio' },
  ],
  preferencias: { ancora: 'meio', alinha: 'centro', cantoDaMarca: 'superior-centro' },
  fundo: 'liso-claro',
  formatos: {
    story: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.114, w: 0.18, h: 0.04 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.098, yMax: 0.2 } },
        pre: { referencia: { x: 0.3, y: 0.28, w: 0.4, h: 0.035 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.27, yMax: 0.36 } },
        headline: { referencia: { x: 0.14, y: 0.352, w: 0.72, h: 0.11 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.34, yMax: 0.52 } },
        apoio: { referencia: { x: 0.25, y: 0.556, w: 0.5, h: 0.035 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.5, yMax: 0.62 } },
        servico: { referencia: { x: 0.25, y: 0.664, w: 0.5, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.61, yMax: 0.74 } },
        cta: { referencia: { x: 0.32, y: 0.829, w: 0.36, h: 0.035 }, zona: { xMin: 0.22, xMax: 0.78, yMin: 0.76, yMax: 0.875 } },
      },
      elementos: { cantoneiras: { x: 0.085, y: 0.1, w: 0.83, h: 0.78 }, fio: { x: 0.36, y: 0.523, w: 0.28, h: 0.002 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 18 },
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 26 },
      },
    },
    feed: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.116, w: 0.18, h: 0.045 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.089, yMax: 0.2 } },
        pre: { referencia: { x: 0.3, y: 0.284, w: 0.4, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.27, yMax: 0.4 } },
        headline: { referencia: { x: 0.14, y: 0.35, w: 0.72, h: 0.13 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.34, yMax: 0.56 } },
        apoio: { referencia: { x: 0.25, y: 0.572, w: 0.5, h: 0.04 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.52, yMax: 0.64 } },
        servico: { referencia: { x: 0.25, y: 0.686, w: 0.5, h: 0.045 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.62, yMax: 0.74 } },
        cta: { referencia: { x: 0.32, y: 0.853, w: 0.36, h: 0.04 }, zona: { xMin: 0.22, xMax: 0.78, yMin: 0.78, yMax: 0.9 } },
      },
      elementos: { cantoneiras: { x: 0.085, y: 0.09, w: 0.83, h: 0.83 }, fio: { x: 0.36, y: 0.549, w: 0.28, h: 0.003 } },
      limitesDeTexto: {
        pre: { linhasMax: 1, caracteresPorLinha: 18 },
        headline: { linhasMax: 2, caracteresPorLinha: 14 },
        apoio: { linhasMax: 1, caracteresPorLinha: 26 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
        cta: { linhasMax: 1, caracteresPorLinha: 26 },
      },
    },
  },
}

/**
 * MIN-04 · divisão com a foto no alto (#8, 24/10/2026): a foto RETANGULAR numa caixa do topo (60% no Story, 58% no Feed,
 * sangrando nas bordas) e o texto embaixo, no liso — o fundo da peça é o papel da marca (escuro ou claro) que o contraste
 * com as tintas da peça escolhe (`papelDoBloco`), nunca a foto. A logo FIXA no canto inferior direito. Referências =
 * as literais do catálogo candidato (CATALOGO-CANDIDATO-STUDIO.md, #8); as ZONAS são do preflight T3-B (HARD, abaixo da
 * junção e dentro da área segura). Uma faixa por formato (as zonas se encadeiam), sem busca pela foto: só a partida.
 * Sem pré nem cta no `@1` (não há respiro entre a junção e a manchete sem mexer no que o owner viu).
 */
const DIVISAO_FOTO_TOPO: ArquetipoDeLayout = {
  id: 'minimal-divisao-foto-topo',
  versao: 1,
  codigoTaxonomico: 'MIN-04',
  nome: 'Foto no alto, texto no fundo da marca embaixo',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  preferencias: { ancora: 'rodape', alinha: 'esquerda', cantoDaMarca: 'inferior-direito' },
  fundo: 'foto-em-caixa',
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio'],
    descricao: 'Assunto no terço central da foto: o corte de baixo é reto, na junção com o fundo da marca.',
    referencias: ['S056', 'F028'],
  },
  formatos: {
    story: {
      foto: { x: 0, y: 0, w: 1, h: 0.6 },
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.65, w: 0.7, h: 0.11 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.63, yMax: 0.77 } },
        apoio: { referencia: { x: 0.085, y: 0.775, w: 0.7, h: 0.05 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.765, yMax: 0.835 } },
        servico: { referencia: { x: 0.085, y: 0.84, w: 0.6, h: 0.04 }, zona: { xMin: 0.085, xMax: 0.685, yMin: 0.83, yMax: 0.883 } },
        logo: { referencia: { x: 0.74, y: 0.83, w: 0.175, h: 0.05 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.82, yMax: 0.883 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 18 },
        apoio: { linhasMax: 2 },
        servico: { linhasMax: 1 },
      },
    },
    feed: {
      foto: { x: 0, y: 0, w: 1, h: 0.58 },
      papeis: {
        headline: { referencia: { x: 0.085, y: 0.63, w: 0.7, h: 0.13 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.61, yMax: 0.775 } },
        apoio: { referencia: { x: 0.085, y: 0.78, w: 0.7, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.835, yMin: 0.765, yMax: 0.85 } },
        servico: { referencia: { x: 0.085, y: 0.86, w: 0.6, h: 0.05 }, zona: { xMin: 0.085, xMax: 0.685, yMin: 0.845, yMax: 0.922 } },
        logo: { referencia: { x: 0.74, y: 0.85, w: 0.175, h: 0.06 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.84, yMax: 0.922 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 18 },
        apoio: { linhasMax: 2 },
        servico: { linhasMax: 1 },
      },
    },
  },
}

/**
 * MIN-01 · #4, base centrada (d09, 24/10/2026: "#4 e #5"): foto INTEIRA, manchete centrada na base, serviço logo
 * abaixo e a logo FIXA no topo-centro, em escala normal e contain, sem tratamento novo — a leitura dela é do CP3 (troca
 * só de variante cadastrada, na mesma caixa centrada; sem variante legível, recusa). O véu fraco automático da logo é o
 * da família A (o mesmo do #2): fica quando salva, sai quando não salva; nenhum véu nasce para ela aqui.
 * Desvios do catálogo candidato (CATALOGO-CANDIDATO-STUDIO.md, #4; preflight cp-t4-a-4):
 * - o catálogo não dá x/w: as larguras são as da prévia que o owner viu no d09 (logo 41/18, manchete 12/76, serviço 20/60);
 * - a zona do serviço sobe até tocar a da manchete (.785 no Story, .77 no Feed): as duas formam UMA faixa, e a peça fica
 *   com 2 (texto · logo), o teto com foto; separadas seriam 3;
 * - a logo é a mesma fração nos dois formatos (o catálogo dá a mesma faixa); Story e Feed diferem pela manchete.
 * Sem pré, apoio nem cta no `@1`: o catálogo e a prévia do d09 mostram só logo, manchete e serviço, e entre a manchete
 * (até .78) e o serviço (de .80) não há respiro para um apoio sem refazer o que o owner viu.
 */
const BASE_CENTRO: ArquetipoDeLayout = {
  id: 'minimal-fb-base-centro',
  versao: 1,
  codigoTaxonomico: 'MIN-01',
  nome: 'Foto inteira, título centrado na base, logo no topo',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 2 },
  ],
  preferencias: { ancora: 'rodape', alinha: 'centro', cantoDaMarca: 'superior-centro' },
  fotoIdeal: {
    areaCalma: 'base',
    assunto: ['meio'],
    descricao: 'Base calma para o texto; o alto sem assunto, onde a logo pousa.',
    referencias: ['F029', 'F020'],
  },
  formatos: {
    story: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.105, w: 0.18, h: 0.045 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.098, yMax: 0.2 } },
        headline: { referencia: { x: 0.12, y: 0.66, w: 0.76, h: 0.12 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.63, yMax: 0.79 } },
        servico: { referencia: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.785, yMax: 0.883 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 16 },
        servico: { linhasMax: 2, caracteresPorLinha: 30 },
      },
    },
    feed: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.105, w: 0.18, h: 0.045 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.089, yMax: 0.2 } },
        headline: { referencia: { x: 0.12, y: 0.64, w: 0.76, h: 0.12 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.61, yMax: 0.775 } },
        servico: { referencia: { x: 0.2, y: 0.8, w: 0.6, h: 0.08 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.77, yMax: 0.922 } },
      },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 16 },
        servico: { linhasMax: 2, caracteresPorLinha: 30 },
      },
    },
  },
}

/**
 * MIN-01 · #5, topo centrado com o serviço em PÍLULA (d09, 24/10/2026: "#4 e #5"): foto INTEIRA, a logo FIXA no
 * topo-centro (escala normal, contain, sem tratamento novo — a leitura dela é do CP3), a manchete e o apoio opcional
 * centrados logo abaixo e, na base, o serviço de UMA linha envolvido por uma pílula de CONTORNO (`pilula-contorno`,
 * obrigatória, cor do serviço, traço 2, raio de meia altura). A pílula acompanha a tinta real do serviço; a folga dela é
 * a caixa E do elemento contra a referência do serviço (32 × 19 px no Story, 32 × 16 no Feed), e conta na zona e na faixa.
 * Desvios do catálogo candidato (CATALOGO-CANDIDATO-STUDIO.md, #5; preflight cp-t4-a-5, rodada 1):
 * - a pílula de contorno única é ADAPTAÇÃO da casa: a S005 tem duas pílulas preenchidas (placa de leitura, que o estilo
 *   exclui) e a F010 nenhuma; o desenho é o item 13 do SVG-ELEMENTOS;
 * - o catálogo não dá x/w: as larguras são as do d09/#4 (logo 41/18, manchete 12/76, apoio e serviço 20/60);
 * - a manchete começa em .155 no Story e em .16 no Feed, com h .12 (duas linhas na voz do #4); o apoio vai até .35 / .37;
 *   ajuste da execução sobre o preflight: no Feed a manchete desce de .155 para .16 (o literal do catálogo) — com .155 o
 *   vão logo → manchete era 20 px e o CP3 exige 24 px de folga entre a logo e qualquer texto (`intersecta`), então toda
 *   peça Feed recusava a logo; com .16 o vão é 27 px;
 * - a pílula vai a .815–.88 no Story (catálogo 82–87): R comporta o corpo do serviço e E não passa do HARD;
 * - a logo, a manchete e o apoio formam UMA faixa (as zonas se tocam) e o serviço a outra: 2 faixas, o teto com foto. A
 *   logo acompanha o dy da faixa de cima dentro da própria zona; com texto na borda de cima, o véu fraco dela não nasce.
 */
const TOPO_CENTRO: ArquetipoDeLayout = {
  id: 'minimal-fb-topo-centro',
  versao: 1,
  codigoTaxonomico: 'MIN-01',
  nome: 'Foto inteira, título centrado no topo, serviço em pílula',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: false, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  elementos: [{ id: 'pilula', tipo: 'pilula-contorno', opcional: false, corPorPapel: 'texto', presoA: 'servico' }],
  preferencias: { ancora: 'topo', alinha: 'centro', cantoDaMarca: 'superior-centro' },
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Topo calmo ou escuro para a logo, a manchete e o apoio; base sem detalhe forte onde a pílula do serviço pousa.',
    referencias: ['S005', 'F010'],
  },
  formatos: {
    story: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.105, w: 0.18, h: 0.035 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.098, yMax: 0.17 } },
        headline: { referencia: { x: 0.12, y: 0.155, w: 0.76, h: 0.12 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.15, yMax: 0.3 } },
        apoio: { referencia: { x: 0.2, y: 0.29, w: 0.6, h: 0.06 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.27, yMax: 0.4 } },
        servico: { referencia: { x: 0.2, y: 0.825, w: 0.6, h: 0.045 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.79, yMax: 0.883 } },
      },
      elementos: { pilula: { x: 0.17, y: 0.815, w: 0.66, h: 0.065 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 16 },
        apoio: { linhasMax: 2, caracteresPorLinha: 28 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
      },
    },
    feed: {
      papeis: {
        logo: { referencia: { x: 0.41, y: 0.105, w: 0.18, h: 0.035 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.089, yMax: 0.17 } },
        headline: { referencia: { x: 0.12, y: 0.16, w: 0.76, h: 0.12 }, zona: { xMin: 0.1, xMax: 0.9, yMin: 0.15, yMax: 0.32 } },
        apoio: { referencia: { x: 0.2, y: 0.3, w: 0.6, h: 0.07 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.28, yMax: 0.42 } },
        servico: { referencia: { x: 0.2, y: 0.83, w: 0.6, h: 0.06 }, zona: { xMin: 0.15, xMax: 0.85, yMin: 0.78, yMax: 0.922 } },
      },
      elementos: { pilula: { x: 0.17, y: 0.818, w: 0.66, h: 0.084 } },
      limitesDeTexto: {
        headline: { linhasMax: 2, caracteresPorLinha: 16 },
        apoio: { linhasMax: 2, caracteresPorLinha: 28 },
        servico: { linhasMax: 1, caracteresPorLinha: 30 },
      },
    },
  },
}

/**
 * MIN-04 · #9, divisão de cor com a foto EMBAIXO e o topo em ARCO (H9, 25/10/2026): a foto numa caixa da base (58% no
 * Story, 56% no Feed, sangrando nas bordas) recortada pela máscara `arco-janela` de raio 0,62 da largura, e o texto no
 * liso em cima, à esquerda — o fundo é o papel da marca (`papelDoBloco`), nunca a foto. A logo FIXA no canto superior
 * direito. Pré e apoio opcionais; sem serviço nem cta no `@1`. Proveniência: a S024 do catálogo candidato, as amostras
 * Bv3 que o owner aprovou (G-A9, raio 0,62) e a definição final da I9 — A-I1/A-I2 adotados: as referências de TEXTO
 * com w .602 (coluna 636, a medida da manchete das Bv3) e a da logo do Feed com h .0348 (a logo 94×47 das Bv3). A
 * literal das amostras (w .6, h .035) não reproduz no produto: a escada descia a manchete do Story, e a logo do Feed
 * passava 1 px da zona porque a materialização arredonda x e largura separados (`materializar.ts`, dívida registrada).
 * O arco é do modelo: a peça grava o path derivado da caixa em px e o congela; o assunto conta só o que o arco mostra.
 */
const DIVISAO_ARCO: ArquetipoDeLayout = {
  id: 'minimal-divisao-cor-topo-arco',
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
      mascaraDaFoto: { tipo: 'arco-janela', raio: 0.62 },
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.035 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.098, yMax: 0.15 } },
        pre: { referencia: { x: 0.085, y: 0.155, w: 0.602, h: 0.03 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.15, yMax: 0.2 } },
        headline: { referencia: { x: 0.085, y: 0.19, w: 0.602, h: 0.12 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.18, yMax: 0.33 } },
        apoio: { referencia: { x: 0.085, y: 0.325, w: 0.602, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.31, yMax: 0.405 } },
      },
      limitesDeTexto: { pre: { linhasMax: 1 }, headline: { linhasMax: 2 }, apoio: { linhasMax: 2 } },
    },
    feed: {
      foto: { x: 0, y: 0.44, w: 1, h: 0.56 },
      mascaraDaFoto: { tipo: 'arco-janela', raio: 0.62 },
      papeis: {
        logo: { referencia: { x: 0.74, y: 0.105, w: 0.175, h: 0.0348 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.089, yMax: 0.15 } },
        pre: { referencia: { x: 0.085, y: 0.16, w: 0.602, h: 0.035 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.155, yMax: 0.21 } },
        headline: { referencia: { x: 0.085, y: 0.2, w: 0.602, h: 0.13 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.19, yMax: 0.345 } },
        apoio: { referencia: { x: 0.085, y: 0.345, w: 0.602, h: 0.065 }, zona: { xMin: 0.085, xMax: 0.69, yMin: 0.335, yMax: 0.43 } },
      },
      limitesDeTexto: { pre: { linhasMax: 1 }, headline: { linhasMax: 2 }, apoio: { linhasMax: 2 } },
    },
  },
}

/**
 * MIN-05 · #10, coluna de foto (IH, 25/10/2026): a foto numa caixa de altura inteira e 42,5% da largura, sangrando em
 * cima, embaixo e no lado de fora, e o texto numa coluna estreita no liso do outro lado — o fundo é o papel da marca
 * (`papelDoBloco`), nunca a foto. Dois ids, um por lado (não há parâmetro de espelho na spec): `minimal-coluna-foto` com
 * a foto à DIREITA e `minimal-coluna-foto-esquerda` com a foto à ESQUERDA. O espelho é FUNCIONAL: a foto, as zonas e a
 * referência da logo espelham; os textos e o fio ficam no `xMin` da coluna, alinhados à esquerda nos dois lados.
 * Proveniência: S050 (D) e S014 (E) do catálogo candidato, as amostras v2 que o owner aprovou no G-A10 ("Aprovar os
 * dois lados, com o fio") e as decisões técnicas do preflight focal adotadas pelo Codex:
 * - A10-1: as referências de TEXTO com w .436 (as amostras têm .435). A coluna do medidor é `floor(w) − 14`: com .435
 *   ela dá 455 e "Bastidores" a 80 px (456) não cabe — a escada desceria a manchete para 77. Com .436, 456. O texto E sai
 *   de .48 para .479 (a zona vai a .915, o piso: .48 + .436 passaria da área segura);
 * - A10-2a: a referência da logo D x .086 / E x .739 (as amostras têm .085/.74). A materialização arredonda x e
 *   largura separados (`materializar.ts`, dívida registrada): com .74, a logo do Feed E 2:1 arredondava para 894 + 95 =
 *   989 contra a zona que termina em 988, e cerca de 18% das proporções de logo seriam recusadas; com .739, nenhuma.
 * Desvios do catálogo candidato: sem manchete girada nem pílula (S050), sem fios cruzados nem foto em altura parcial
 * (S014), sem linha vertical; o fio horizontal opcional sob a manchete; pré e cta fora do `@1`. A coluna é estreita: a
 * manchete curta em até 3 linhas e o apoio em linhas curtas dependem da quebra do autor — a linha que não cabe inteira
 * na coluna é recusada (`ARQUETIPO_TEXTO_NAO_CABE`), e o medir-copy diz isso antes.
 */
const COLUNA_FOTO: ArquetipoDeLayout = {
  id: 'minimal-coluna-foto',
  versao: 1,
  codigoTaxonomico: 'MIN-05',
  nome: 'Foto em coluna à direita, texto no fundo da marca à esquerda',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  elementos: [{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'superior-esquerdo' },
  fundo: 'foto-em-caixa',
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Foto vertical com o assunto no centro: a coluna mostra uma faixa estreita dela (cerca de 36% da largura de uma foto 2:3 no Story, 51% no Feed). Coluna estreita: manchete curta em até 3 linhas e apoio em linhas curtas.',
    referencias: ['S050'],
  },
  formatos: {
    story: {
      foto: { x: 0.575, y: 0, w: 0.425, h: 1 },
      papeis: {
        logo: { referencia: { x: 0.086, y: 0.105, w: 0.175, h: 0.035 }, zona: { xMin: 0.085, xMax: 0.3, yMin: 0.098, yMax: 0.15 } },
        headline: { referencia: { x: 0.085, y: 0.155, w: 0.436, h: 0.245 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.15, yMax: 0.4 } },
        apoio: { referencia: { x: 0.085, y: 0.62, w: 0.436, h: 0.16 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.6, yMax: 0.8 } },
        servico: { referencia: { x: 0.085, y: 0.82, w: 0.436, h: 0.06 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.79, yMax: 0.883 } },
      },
      elementos: { fio: { x: 0.085, y: 0.405, w: 0.18, h: 0.002 } },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 2 } },
    },
    feed: {
      foto: { x: 0.575, y: 0, w: 0.425, h: 1 },
      papeis: {
        logo: { referencia: { x: 0.086, y: 0.1, w: 0.175, h: 0.035 }, zona: { xMin: 0.085, xMax: 0.3, yMin: 0.089, yMax: 0.14 } },
        headline: { referencia: { x: 0.085, y: 0.165, w: 0.436, h: 0.21 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.16, yMax: 0.4 } },
        apoio: { referencia: { x: 0.085, y: 0.6, w: 0.436, h: 0.15 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.58, yMax: 0.79 } },
        servico: { referencia: { x: 0.085, y: 0.82, w: 0.436, h: 0.07 }, zona: { xMin: 0.085, xMax: 0.521, yMin: 0.78, yMax: 0.922 } },
      },
      elementos: { fio: { x: 0.085, y: 0.38, w: 0.18, h: 0.003 } },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 2 } },
    },
  },
}

/** MIN-05 · #10 espelhado: a mesma definição com a foto à ESQUERDA (o comentário do `COLUNA_FOTO` vale para os dois). */
const COLUNA_FOTO_ESQUERDA: ArquetipoDeLayout = {
  id: 'minimal-coluna-foto-esquerda',
  versao: 1,
  codigoTaxonomico: 'MIN-05',
  nome: 'Foto em coluna à esquerda, texto no fundo da marca à direita',
  papeis: [
    { papel: 'headline', obrigatorio: true, ordemDeLeitura: 0 },
    { papel: 'apoio', obrigatorio: true, ordemDeLeitura: 1 },
    { papel: 'servico', obrigatorio: true, ordemDeLeitura: 2 },
    { papel: 'logo', obrigatorio: true, ordemDeLeitura: 3 },
  ],
  elementos: [{ id: 'fio', tipo: 'fio-fino', opcional: true, corPorPapel: 'texto', presoA: 'headline' }],
  preferencias: { ancora: 'topo', alinha: 'esquerda', cantoDaMarca: 'superior-direito' },
  fundo: 'foto-em-caixa',
  fotoIdeal: {
    areaCalma: 'topo',
    assunto: ['meio', 'base'],
    descricao: 'Foto vertical com o assunto no centro: a coluna mostra uma faixa estreita dela (cerca de 36% da largura de uma foto 2:3 no Story, 51% no Feed). Coluna estreita: manchete curta em até 3 linhas e apoio em linhas curtas.',
    referencias: ['S014'],
  },
  formatos: {
    story: {
      foto: { x: 0, y: 0, w: 0.425, h: 1 },
      papeis: {
        logo: { referencia: { x: 0.739, y: 0.105, w: 0.175, h: 0.035 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.098, yMax: 0.15 } },
        headline: { referencia: { x: 0.479, y: 0.155, w: 0.436, h: 0.245 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.15, yMax: 0.4 } },
        apoio: { referencia: { x: 0.479, y: 0.62, w: 0.436, h: 0.16 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.6, yMax: 0.8 } },
        servico: { referencia: { x: 0.479, y: 0.82, w: 0.436, h: 0.06 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.79, yMax: 0.883 } },
      },
      elementos: { fio: { x: 0.479, y: 0.405, w: 0.18, h: 0.002 } },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 2 } },
    },
    feed: {
      foto: { x: 0, y: 0, w: 0.425, h: 1 },
      papeis: {
        logo: { referencia: { x: 0.739, y: 0.1, w: 0.175, h: 0.035 }, zona: { xMin: 0.7, xMax: 0.915, yMin: 0.089, yMax: 0.14 } },
        headline: { referencia: { x: 0.479, y: 0.165, w: 0.436, h: 0.21 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.16, yMax: 0.4 } },
        apoio: { referencia: { x: 0.479, y: 0.6, w: 0.436, h: 0.15 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.58, yMax: 0.79 } },
        servico: { referencia: { x: 0.479, y: 0.82, w: 0.436, h: 0.07 }, zona: { xMin: 0.479, xMax: 0.915, yMin: 0.78, yMax: 0.922 } },
      },
      elementos: { fio: { x: 0.479, y: 0.38, w: 0.18, h: 0.003 } },
      limitesDeTexto: { headline: { linhasMax: 3 }, apoio: { linhasMax: 3 }, servico: { linhasMax: 2 } },
    },
  },
}

const PUBLICADOS: ReadonlyArray<ArquetipoDeLayout> = congelarFundo([TOPO_ESQUERDA, BASE_ESQUERDA, CENTRO_OPTICO, TITULO_GIGANTE, TIPOGRAFICO_LISTA, CONVITE, CONVITE_V2, DIVISAO_FOTO_TOPO, BASE_CENTRO, TOPO_CENTRO, DIVISAO_ARCO, COLUNA_FOTO, COLUNA_FOTO_ESQUERDA])

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
