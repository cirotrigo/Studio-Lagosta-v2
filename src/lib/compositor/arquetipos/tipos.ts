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
 * Os papéis que um arquétipo posiciona: os da spec do compositor MENOS o `cta`
 * (nenhum dos modelos minimalistas o tem; o T1a decide o que fazer com um
 * bloco cta), MAIS a logo.
 */
export const PAPEIS_DO_ARQUETIPO = ['pre', 'headline', 'apoio', 'servico', 'logo'] as const satisfies ReadonlyArray<Exclude<Papel, 'cta'> | 'logo'>
export type PapelDoArquetipo = (typeof PAPEIS_DO_ARQUETIPO)[number]
export type PapelDeTexto = Exclude<PapelDoArquetipo, 'logo'>

/**
 * O código do arquétipo na taxonomia da pesquisa (TAXONOMIA.md: MIN-01,
 * MIN-02…). A "família" A–E de lá (o que o compositor já materializa) não é
 * registrada: o T1a acrescenta se precisar.
 */
export const FAMILIAS_DO_ARQUETIPO = ['MIN-01', 'MIN-02'] as const
export type FamiliaDoArquetipo = (typeof FAMILIAS_DO_ARQUETIPO)[number]

/**
 * Os elementos que um arquétipo pode DECLARAR. Só a referência semântica: o
 * T0 não cria SVG nem materializa nada (é o T1b).
 */
export const ELEMENTOS_DO_ARQUETIPO = ['fio-fino', 'moldura-aberta', 'spark-4'] as const
export type ElementoDoArquetipo = (typeof ELEMENTOS_DO_ARQUETIPO)[number]

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

export interface GeometriaDoArquetipo {
  readonly papeis: Readonly<Partial<Record<PapelDoArquetipo, PosicaoDoPapel>>>
  /** A referência de cada elemento declarado, pelo `id` do elemento. */
  readonly elementos?: Readonly<Record<string, Caixa>>
  /** Obrigatório para todo papel de texto declarado: `linhasMax` é estrutural. */
  readonly limitesDeTexto: Readonly<Partial<Record<PapelDeTexto, LimiteDeTexto>>>
}

/** Um papel do arquétipo: se é obrigatório e em que ordem se lê (0 = primeiro). */
export interface PapelNoArquetipo {
  readonly papel: PapelDoArquetipo
  readonly obrigatorio: boolean
  readonly ordemDeLeitura: number
}

export interface ElementoNoArquetipo {
  readonly id: string
  readonly tipo: ElementoDoArquetipo
  readonly opcional: boolean
  readonly corPorPapel: PapelDeCor
  /** O papel a que o elemento se prende: ele o acompanha na materialização (T1b). */
  readonly presoA?: PapelDoArquetipo
  /** Só a `moldura-aberta`: o canto em que o L dobra (┌ = superior-esquerdo). */
  readonly canto?: Canto
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
  readonly cantoDaMarca: Canto | 'auto'
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
  readonly familia: FamiliaDoArquetipo
  readonly nome: string
  readonly papeis: ReadonlyArray<PapelNoArquetipo>
  readonly elementos?: ReadonlyArray<ElementoNoArquetipo>
  readonly preferencias: PreferenciasDoArquetipo
  readonly fotoIdeal?: FotoIdeal
  /** Cada formato é uma definição PRÓPRIA (não uma escala da outra). */
  readonly formatos: Readonly<Record<FormatoDoArquetipo, GeometriaDoArquetipo>>
}

/** A identidade publicada de um arquétipo: `id@versao`. */
export const chaveDoArquetipo = (a: Pick<ArquetipoDeLayout, 'id' | 'versao'>) => `${a.id}@${a.versao}`
