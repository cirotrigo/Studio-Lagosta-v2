/**
 * ARQUÉTIPO DE LAYOUT (T0, 14/10/2026) — a GRAMÁTICA de uma composição: onde
 * cada papel pode pousar, em que ordem se lê, que elementos acompanham, que
 * foto a favorece. NÃO é Page, nem template do banco, nem assinatura, nem
 * variante, nem um tipo novo de arte: no T1a/CP2B, arquétipo + parâmetros +
 * foto + assinatura serão MATERIALIZADOS em camadas normais, e a peça
 * persistida continua uma Page normal (ver docs/design/arquetipos-minimalistas-v1.md).
 *
 * O arquétipo nunca guarda fonte, peso, cor (hex) nem projeto: isso vem da
 * assinatura/DNA da marca. Geometria em FRAÇÕES da peça (0–1), nunca pixels.
 * A área segura NÃO é do arquétipo: é o piso global de cada formato, que
 * recorta a zona na materialização; o validador só confere que o recorte
 * ainda comporta a caixa.
 *
 * Módulo PURO: sem banco, sem render, sem efeito.
 */
import type { Alinhamento, Ancora, Canto, Papel } from '../spec'

export const FORMATOS_DO_ARQUETIPO = ['story', 'feed'] as const
export type FormatoDoArquetipo = (typeof FORMATOS_DO_ARQUETIPO)[number]

/**
 * Os papéis que um arquétipo posiciona: os da spec do compositor MAIS a logo. O `cta` entrou no #15 (24/10/2026), como
 * coluna do rodapé de duas colunas; arquétipo que não o declara continua recusando o bloco cta (`conferirPapeis`).
 */
export const PAPEIS_DO_ARQUETIPO = ['pre', 'headline', 'apoio', 'servico', 'logo', 'cta'] as const satisfies ReadonlyArray<Exclude<Papel, 'headline2'> | 'logo'>
export type PapelDoArquetipo = (typeof PAPEIS_DO_ARQUETIPO)[number]
export type PapelDeTexto = Exclude<PapelDoArquetipo, 'logo'>

/**
 * O CÓDIGO TAXONÔMICO da pesquisa (TAXONOMIA.md: MIN-01, MIN-02…): o
 * agrupamento conceitual a que a entrada concreta do catálogo pertence. NÃO é
 * a família macro A–E da pesquisa, que o T0 não modela — se o T1a ou um
 * ranking precisar dela, ela entra depois, com nome próprio.
 */
export const CODIGOS_TAXONOMICOS = ['MIN-01', 'MIN-02', 'MIN-04', 'MIN-09', 'MIN-10', 'MIN-05'] as const
export type CodigoTaxonomico = (typeof CODIGOS_TAXONOMICOS)[number]

/**
 * Os elementos que um arquétipo pode DECLARAR. Só a referência semântica: o
 * T0 não cria SVG nem materializa nada (é o T1b). As `cantoneiras` (#16, 24/10/2026) são o único elemento preso à
 * PEÇA, não a um texto: pousam na caixa declarada e ocupam só os quatro braços (`ocupacaoDoAcento`). A `pilula-contorno`
 * (#5, 24/10/2026) é o único elemento que ENVOLVE o papel a que se prende (o serviço de uma linha).
 */
export const ELEMENTOS_DO_ARQUETIPO = ['fio-fino', 'moldura-aberta', 'spark-4', 'cantoneiras', 'pilula-contorno'] as const
export type ElementoDoArquetipo = (typeof ELEMENTOS_DO_ARQUETIPO)[number]
/** Os elementos presos à PEÇA (sem `presoA`): todos os outros se prendem a um papel de texto. */
export const ELEMENTOS_PRESOS_A_PECA: ReadonlyArray<ElementoDoArquetipo> = ['cantoneiras']
/** Os elementos que ENVOLVEM o papel a que se prendem (#5): o interior é do papel; a borda, de ninguém. */
export const ELEMENTOS_QUE_ENVOLVEM: ReadonlyArray<ElementoDoArquetipo> = ['pilula-contorno']

/**
 * Onde a logo FIXA do arquétipo pousa: um dos quatro cantos ou, só no arquétipo (#16, decisão do owner de 24/10/2026
 * para a logo topo-centro do convite), o `superior-centro`. A spec pública e os `CANTOS` não mudam.
 */
export type CantoDaLogo = Canto | 'superior-centro'

/** A cor de um elemento é uma INTENÇÃO: o papel de cor da assinatura que ele segue (resolvido no T1b, nunca hex). */
export const PAPEIS_DE_COR = ['texto', 'destaque'] as const
export type PapelDeCor = (typeof PAPEIS_DE_COR)[number]

/** Faixa vertical da foto (o mesmo vocabulário para a área calma e o assunto). */
export type FaixaDaFoto = 'topo' | 'meio' | 'base'

/** Uma caixa em FRAÇÕES: x e w da largura, y e h da altura da peça. */
export interface Caixa {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * A região, em frações, que a caixa INTEIRA do papel pode ocupar. A posição
 * final dentro dela é escolhida pela foto (CP2B), recortada pela área segura
 * do formato; a zona é o que preserva a identidade do arquétipo.
 */
export interface Zona {
  readonly xMin: number
  readonly xMax: number
  readonly yMin: number
  readonly yMax: number
}

/**
 * Onde um papel pousa num formato: a REFERÊNCIA (a posição base) dentro da
 * ZONA permitida — ou, só para a logo, o canto mais calmo da foto (como o
 * compositor já faz com `cantoDaMarca: 'auto'`).
 */
export type PosicaoDoPapel = { readonly referencia: Caixa; readonly zona: Zona } | { readonly automatica: 'canto-mais-calmo' }

/**
 * Limite de texto de um papel num formato. `linhasMax` é HARD (estrutural: a
 * zona não comporta mais). `caracteresPorLinha` é SOFT (estimativa editorial
 * da pesquisa): quem decide é a medição (`medir-copy`), nunca uma recusa por
 * contagem de caracteres.
 */
export interface LimiteDeTexto {
  readonly linhasMax: number
  readonly caracteresPorLinha?: number
}

/**
 * Os ITENS de uma lista (#15): o vão entre o fim de um item e o topo do seguinte, em fração da ALTURA da peça. É ele que
 * dá lugar ao fio de cada item — o ritmo da casa (gap) vale só fora da lista.
 */
export interface ItensDaLista {
  readonly vao: number
}

export interface GeometriaDoArquetipo {
  readonly papeis: Readonly<Partial<Record<PapelDoArquetipo, PosicaoDoPapel>>>
  /** Só o papel com `lista: true`. */
  readonly itens?: Readonly<Partial<Record<PapelDeTexto, ItensDaLista>>>
  /** A referência de cada elemento declarado, pelo `id` do elemento. */
  readonly elementos?: Readonly<Record<string, Caixa>>
  /** Obrigatório para todo papel de texto declarado: `linhasMax` é estrutural. */
  readonly limitesDeTexto: Readonly<Partial<Record<PapelDeTexto, LimiteDeTexto>>>
  /**
   * Só no fundo `foto-em-caixa` (#8, 24/10/2026), e nele obrigatória: a CAIXA da foto, em frações. A foto pousa nela em
   * cover; nenhuma zona de papel nem caixa de elemento a toca (o texto fica no liso).
   */
  readonly foto?: Caixa
  /** Só com a caixa da foto (#9): a máscara dela neste formato. Ausente = a foto retangular de sempre. */
  readonly mascaraDaFoto?: MascaraDaFoto
}

/**
 * A MÁSCARA da foto em caixa (#9, 25/10/2026). `arco-janela`: o topo da caixa em arco de círculo (pico no alto, laterais
 * retas abaixo do toque). O desenho é DERIVADO da caixa em px na composição (`pathDoArcoJanela`) e congelado na peça;
 * aqui só a intenção — nunca path.
 */
export const MASCARAS_DO_ARQUETIPO = ['arco-janela'] as const
export type MascaraDoArquetipo = (typeof MASCARAS_DO_ARQUETIPO)[number]

export interface MascaraDaFoto {
  readonly tipo: MascaraDoArquetipo
  /** O raio do arco em fração da LARGURA da caixa da foto (≥ 0,5; 0,5 = semicírculo). */
  readonly raio: number
}

/**
 * A ESCALA do papel (T4-A, 24/10/2026): uma RELAÇÃO, nunca um corpo. `dominante` (só a headline, MIN-10) = o texto
 * cresce a partir do corpo da assinatura até ocupar a referência; sem ela, a escada só desce (até 80%), como sempre.
 */
export const ESCALAS_DO_PAPEL = ['dominante'] as const
export type EscalaDoPapel = (typeof ESCALAS_DO_PAPEL)[number]

/**
 * O FUNDO do arquétipo (T4-E, 24/10/2026). Ausente = `foto` (as famílias com foto, como sempre). `liso-claro` = a
 * família E (MIN-09): a peça NÃO tem foto e o fundo é o liso CLARO da marca (`numeros.fundoClaro` da assinatura) —
 * resolvido por `fundoDaPeca`, a mesma conta no compor, no medir-copy e na página gravada. `foto-em-caixa` (#8, MIN-04):
 * a foto numa caixa declarada por formato (`GeometriaDoArquetipo.foto`) e o texto no liso, no papel da marca escolhido
 * pelo contraste com as tintas da peça (`papelDoBloco`). Nunca hex aqui.
 */
export const FUNDOS_DO_ARQUETIPO = ['foto', 'liso-claro', 'foto-em-caixa'] as const
export type FundoDoArquetipo = (typeof FUNDOS_DO_ARQUETIPO)[number]

/** Um papel do arquétipo: se é obrigatório e em que ordem se lê (0 = primeiro). */
export interface PapelNoArquetipo {
  readonly papel: PapelDoArquetipo
  readonly obrigatorio: boolean
  readonly ordemDeLeitura: number
  /** Ausente = a escala de sempre (o corpo da assinatura, a escada só desce). */
  readonly escala?: EscalaDoPapel
  /**
   * O alinhamento PRÓPRIO do papel (T4-A, rodada 1): o apoio do título gigante é alinhado à direita com a manchete à
   * esquerda. Ausente = `preferencias.alinha`. Nunca na headline (ela É o alinhamento do arquétipo) nem na logo (canto).
   */
  readonly alinha?: Alinhamento
  /**
   * LISTA (#15, só o apoio): cada linha autoral com texto é um ITEM — uma camada própria (mesmo bloco, a linha dele) e,
   * com elemento `porItem`, um fio próprio. O item que quebra em duas linhas visuais continua um item.
   */
  readonly lista?: true
}

export interface ElementoNoArquetipo {
  readonly id: string
  readonly tipo: ElementoDoArquetipo
  readonly opcional: boolean
  readonly corPorPapel: PapelDeCor
  /** O papel a que o elemento se prende: ele o acompanha na materialização (T1b). Ausente só nas `cantoneiras` (presas à peça). */
  readonly presoA?: PapelDoArquetipo
  /** Só a `moldura-aberta`: o canto em que o L dobra (┌ = superior-esquerdo). */
  readonly canto?: Canto
  /** Um por ITEM do papel `lista` a que se prende (o fio acima de cada item, #15). A caixa declarada é a do primeiro. */
  readonly porItem?: true
  /**
   * Só no elemento preso à PEÇA (#16@2): o braço de cada L, em fração da LARGURA da peça, IGUAL nos dois eixos. A peça
   * nova deriva o path das cantoneiras por ele e o congela na receita (`derivacao`); ausente = o desenho do asset.
   */
  readonly braco?: number
}

/**
 * As PREFERÊNCIAS do arquétipo no vocabulário que o compositor já obedece. Não
 * são gate nem uma segunda fonte de posição: o validador exige que concordem
 * com a geometria (a âncora com a zona da headline, o alinhamento com a
 * referência dela, o canto com a posição da logo).
 */
export interface PreferenciasDoArquetipo {
  readonly ancora: Ancora
  readonly alinha: Alinhamento
  /** `superior-centro` só com a logo fixa e a zona dela no eixo, em cima (#16). */
  readonly cantoDaMarca: CantoDaLogo | 'auto'
}

/** A foto que favorece o arquétipo — metadado DESCRITIVO para um ranking futuro; o compositor não o lê. */
export interface FotoIdeal {
  /** Onde a foto tem de ser calma (o espaço negativo onde o texto pousa). */
  readonly areaCalma: FaixaDaFoto
  /** Onde o assunto fica bem (`deslocado` = fora do centro, para um lado). */
  readonly assunto: ReadonlyArray<FaixaDaFoto | 'deslocado'>
  readonly descricao: string
  /** Os modelos de referência da pesquisa (S = story, F = feed). */
  readonly referencias: ReadonlyArray<string>
}

export interface ArquetipoDeLayout {
  /** kebab-case, estável. A identidade publicada é `id@versao`. */
  readonly id: string
  /** Inteiro ≥ 1. Qualquer mudança é VERSÃO nova; a publicada nunca muda. */
  readonly versao: number
  /** O agrupamento conceitual MIN-XX — não a família macro A–E. */
  readonly codigoTaxonomico: CodigoTaxonomico
  readonly nome: string
  readonly papeis: ReadonlyArray<PapelNoArquetipo>
  readonly elementos?: ReadonlyArray<ElementoNoArquetipo>
  readonly preferencias: PreferenciasDoArquetipo
  /** Ausente = `foto`. `liso-claro` não tem `fotoIdeal` (não há foto a favorecer). */
  readonly fundo?: FundoDoArquetipo
  readonly fotoIdeal?: FotoIdeal
  /** Cada formato é uma definição PRÓPRIA (não uma escala da outra). */
  readonly formatos: Readonly<Record<FormatoDoArquetipo, GeometriaDoArquetipo>>
}

/** A identidade publicada de um arquétipo: `id@versao`. */
export const chaveDoArquetipo = (a: Pick<ArquetipoDeLayout, 'id' | 'versao'>) => `${a.id}@${a.versao}`
