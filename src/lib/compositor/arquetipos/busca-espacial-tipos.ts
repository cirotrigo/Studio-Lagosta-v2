/**
 * O CONTRATO da BUSCA ESPACIAL do arquétipo (CP2B, 14/10/2026): tipos, limites e constantes compartilhados pela
 * geração de candidatos (`candidatos-espaciais.ts`), pela avaliação pela foto (`pontuacao-espacial.ts`), pelo
 * orquestrador (`busca-espacial.ts`), pelo compositor, pela recomposição e pelo diagnóstico. Só tipos e números:
 * nenhuma lógica mora aqui.
 *
 * A REGRA CENTRAL: POSIÇÃO PRIMEIRO, TRATAMENTO DE LEITURA DEPOIS. A busca escolhe, pela foto, onde cada FAIXA do
 * arquétipo pousa DENTRO da zona efetiva (zona ∩ `pisoDoProjeto`), partindo da referência e com poucas alternativas;
 * o CP2A (régua, polaridade, `planejarTratamentoDaBorda`, TRATAMENTO_PIOROU_LEITURA) continua sendo o juiz final da
 * peça escolhida — a busca só ESTIMA o tratamento para ordenar as posições, com a MESMA função pura do CP2A.
 *
 * FAIXA (a unidade de busca): os papéis cujas ZONAS se sobrepõem na vertical formam um conjunto de leitura — no
 * topo-esquerda, {pre, headline, apoio} e {servico, logo}; no centro-óptico, {headline, apoio} e {servico} (a logo
 * automática fica fora: é escolhida depois, pelo canto mais calmo). A faixa se move INTEIRA com um único `dy`: a
 * ordem, o ritmo e a relação interna que o arquétipo desenhou na referência ficam preservados por construção (e o
 * fio/spark do T1b, presos à manchete, acompanham). Faixas diferentes têm zonas disjuntas: nunca colidem.
 *
 * SÓ VERTICAL no v1: o alinhamento estrutural ancora uma LINHA (a margem esquerda no topo-esquerda, o eixo central
 * no centro-óptico); deslocar na horizontal moveria essa linha — a busca não reinventa o modelo.
 */
import type { CropPosition } from '@/lib/image-crop-utils'
import type { Rect } from '@/lib/creatives/halo/halo'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import type { MapaDeCalma } from '../mapa-de-calma'
import type { Borda } from '../gradiente-de-leitura'
import type { MotivoDoTratamento, PlanoDaBorda, TextoNaBorda } from '../tratamento-de-leitura'
import type { Canto } from '../spec'
import type { PapelDeTexto } from './tipos'

/** O nome VERSIONADO do modo de posicionamento (vai para `fieldValues.composicao.arquetipo.modo`). */
export const MODO_BUSCA_ESPACIAL = 'busca-espacial-v1' as const

/**
 * Os LIMITES explícitos: a busca nunca passa disto (lança se passar — é defeito, não foto).
 * Pior caso dos modelos habilitados: 3 cortes × 5 × 5 = 75 combinações avaliadas.
 */
export const LIMITES_DA_BUSCA = {
  cortes: 3,
  /** 2 × 5 candidatos = 25 por corte: os limites fecham entre si (3 faixas passariam das 25 combinações). */
  faixas: 2,
  candidatosPorFaixa: 5,
  combinacoesPorCorte: 25,
  avaliacoes: 75,
} as const

/** Deslocamento menor que isto não é alternativa: a foto não distingue, e o design andaria por ruído. */
export const PASSO_MINIMO_PX = 16

/** Um membro de faixa: papel de texto, ou a logo de referência fixa (que acompanha a faixa do serviço). */
export type MembroDaFaixa = PapelDeTexto | 'logo'

/**
 * Os rótulos dos candidatos de uma faixa, na ORDEM FIXA de desempate: a referência, depois o mais acima, o meio do
 * caminho para cima, o meio do caminho para baixo e o mais abaixo que a zona efetiva permite.
 */
export const ROTULOS_DO_DESLOCAMENTO = ['referencia', 'acima', 'meio-acima', 'meio-abaixo', 'abaixo'] as const
/** `congelado`: o dy de uma escolha gravada que a recomposição reproduz (não é um candidato da busca de agora). */
export type RotuloDoDeslocamento = (typeof ROTULOS_DO_DESLOCAMENTO)[number] | 'congelado'

export interface CandidatoDaFaixa {
  rotulo: RotuloDoDeslocamento
  /** px na vertical, relativo à posição de referência (negativo = acima). Inteiro. */
  dy: number
}

export interface FaixaDeBusca {
  /** Índice estável: a ordem das faixas (a do primeiro papel na ordem de leitura do arquétipo). */
  indice: number
  /** Os membros PRESENTES na peça, na ordem de leitura do arquétipo. */
  membros: MembroDaFaixa[]
  /**
   * O intervalo de `dy` em que TODOS os membros (caixa real + ornamentos presos) ficam dentro da zona efetiva de cada
   * um, arredondado para DENTRO. Contém 0 quando a referência cabe; quando a área segura do projeto corta a
   * referência, ele não contém 0 (a busca RESGATA na vertical) — e vazio quando nenhuma posição vertical cabe.
   */
  intervalo: { min: number; max: number }
  /** A referência cabe na zona efetiva (então ela é a primeira candidata). */
  referenciaValida: boolean
  /**
   * A primeira candidata é a PARTIDA (a referência, ou a posição válida mais perto dela); ≤
   * `LIMITES_DA_BUSCA.candidatosPorFaixa`; entre si, as candidatas ficam ≥ `PASSO_MINIMO_PX` uma da outra. VAZIA quando
   * a faixa não cabe na zona em posição vertical nenhuma (recusa estrutural, `semPosicao` diz por quê).
   */
  candidatos: CandidatoDaFaixa[]
  /** Só na faixa sem posição: o membro e o motivo (a caixa passa da zona na horizontal, ou o intervalo é vazio). */
  semPosicao?: { membro: MembroDaFaixa; motivo: string }
}

/** Uma combinação: um candidato por faixa. O índice dela na lista é o desempate final (ordem fixa). */
export interface Combinacao {
  indice: number
  escolhas: Array<{ faixa: number; rotulo: RotuloDoDeslocamento; dy: number }>
  /** O `dy` de cada membro (derivado das escolhas) — é o que a materialização recebe. */
  deslocamentos: Partial<Record<MembroDaFaixa, number>>
}

// ─── A foto ─────────────────────────────────────────────────────────────────

/**
 * Uma REGIÃO PROTEGIDA da foto (produto, rosto, vitrine, prato…): o texto não a cobre acima do `teto`. Lista, nunca
 * "o único assunto": hoje o catálogo dá uma caixa e, sem ela, a energia estima uma — o tipo já aceita várias.
 * Só a do CATÁLOGO (anotada) é hard constraint; a ESTIMADA pela energia é heurística e entra só como custo
 * (componente `assunto`) — como recusa dura, a borda de uma faixa de luz zerava a foto inteira.
 */
export interface RegiaoProtegida {
  rect: Rect
  origem: 'catalogo' | 'estimado'
  /** O limite estrutural EXISTENTE: 0,25 do catálogo (compositor); 0,40 do estimado (o do revisor, medido em peças reais). */
  teto: number
}

/** A foto num corte: o raster (cover, 540 px, b-w — a escala da régua), o mapa de calma e as regiões, nesse corte. */
export interface LeituraDoCorte {
  crop: CropPosition
  raster: FotoCinza
  mapa: MapaDeCalma
  regioes: RegiaoProtegida[]
  /** Fração visível da caixa do CATÁLOGO neste corte (`null` sem catálogo): abaixo de 0,75 o corte é eliminado. */
  assuntoVisivel: number | null
}

// ─── A peça numa combinação ──────────────────────────────────────────────────

export interface TextoDaCombinacao {
  camada: string
  /** O `groupId` da unidade (`grupo-arq-<papel>`). */
  grupo: string
  cor: string
  rect: Rect
  caixaDeFundo: boolean
}

/** Uma unidade (papel) do arquétipo pousada numa combinação — as camadas que o compositor desenharia ali. */
export interface UnidadeDaCombinacao {
  papel: PapelDeTexto
  /** A ordem de leitura declarada pelo arquétipo. */
  ordemDeLeitura: number
  faixa: number
  /** A pilha dos textos na posição candidata. */
  rect: Rect
  /** A pilha + os ornamentos presos (ícone, filete, selo do arranjo) — é ela que não pode colidir nem invadir. */
  rectComOrnamentos: Rect
  /** A pilha na posição de REFERÊNCIA (dy = 0): a hierarquia estrutural é a ordem vertical destas. */
  rectNaReferencia: Rect
  /** A borda do tratamento, fixada pela posição de REFERÊNCIA (não vira com o dy — o plano do CP2A não salta). */
  borda: Borda
  textos: TextoDaCombinacao[]
}

/** A combinação materializada (geometria independente do corte) — ou eliminada pela zona/ornamento/área segura. */
export type CombinacaoMaterializada =
  | { combinacao: Combinacao; unidades: UnidadeDaCombinacao[]; eliminada?: undefined; /** A logo de referência fixa, deslocada com a faixa do serviço. */ logo?: Rect }
  | { combinacao: Combinacao; unidades?: undefined; eliminada: Eliminacao[]; logo?: undefined }

// ─── O tratamento estimado ───────────────────────────────────────────────────

/**
 * O planejamento do CP2A, entregue pelo compositor: a MESMA `planejarTratamentoDaBorda` (cores aprovadas da
 * assinatura, curva, faixa de força e altura da faixa daquela borda) — a busca não reimplementa contraste.
 */
export interface PlanejamentoDoTratamento {
  /** Bordas cujo véu é EXPLÍCITO da página de assinatura: ele existe sempre (o CP2A não o planeja); custo constante. */
  bordasExplicitas: Borda[]
  /** O plano de uma borda AUTOMÁTICA com estes textos (e os das outras bordas como vizinhos). */
  planejar: (args: { borda: Borda; textos: TextoNaBorda[]; vizinhos: TextoNaBorda[]; alcance: number }) => PlanoDaBorda
}

// ─── Eliminação e pontuação ──────────────────────────────────────────────────

/** Os HARD CONSTRAINTS: candidata que cai num deles sai ANTES da pontuação (nunca vira penalidade). */
export const MOTIVOS_DE_ELIMINACAO = {
  foraDaZona: 'FORA_DA_ZONA',
  foraDaAreaSegura: 'FORA_DA_AREA_SEGURA',
  ornamentoForaDaZona: 'ORNAMENTO_FORA_DA_ZONA',
  corteSemOAssunto: 'CORTE_PERDE_O_ASSUNTO',
  invadeRegiaoProtegida: 'INVADE_REGIAO_PROTEGIDA',
  colisao: 'COLISAO_ENTRE_GRUPOS',
  ordemDeLeitura: 'ORDEM_DE_LEITURA',
  hierarquia: 'HIERARQUIA_ESTRUTURAL',
  tratamentoPiora: 'TRATAMENTO_PIORA_LEITURA',
  semCorAprovada: 'SEM_COR_APROVADA',
  polaridadeIncompativel: 'POLARIDADE_INCOMPATIVEL',
  limiteGeometrico: 'LIMITE_GEOMETRICO',
} as const
export type MotivoDeEliminacao = (typeof MOTIVOS_DE_ELIMINACAO)[keyof typeof MOTIVOS_DE_ELIMINACAO]

export interface Eliminacao {
  motivo: MotivoDeEliminacao
  detalhe: string
  papel?: MembroDaFaixa
  /** Só no tratamento: o motivo do CP2A que levou à eliminação. */
  motivoDoTratamento?: MotivoDoTratamento
}

/**
 * Os componentes da pontuação (todos 0..1, maior = melhor), EXCETO `custoDoTratamento` (≥ 0, menor = melhor), que
 * não entra na soma ponderada: é o critério DOMINANTE (ver `ordenarAvaliacoes`).
 */
export interface ComponentesDaPontuacao {
  /** Σ por borda automática: 0 sem necessidade; a força do plano; força máxima + 0,5 quando o véu não alcança o alvo. */
  custoDoTratamento: number
  /** 1 − energia/energiaDeReferencia sob as unidades (energia comum a todos os cortes). */
  calma: number
  /** A menor margem de leitura SEM tratamento (alvo − p98 do claro, p02 − alvo do escuro) / 64, presa em 0..1. */
  contrasteNatural: number
  /** 1 − (maior cobertura de região protegida / teto dela); 1 sem região. */
  assunto: number
  /** 1 − média de |dy| / amplitude da faixa: o PRIOR da referência (identidade do arquétipo). */
  referencia: number
  /** 1 no corte central (o do T1a), 0 nos laterais: o PRIOR do enquadramento. */
  corte: number
}

/**
 * Os PESOS da pontuação secundária (somam 1). As proporções vêm da pontuação legada do compositor
 * (`PESO_CALMA` 0,55 > `PESO_LUZ` 0,30 > `PESO_PREFERENCIA` 0,15), com uma fatia para a interferência com o assunto e o
 * prior da referência dividido entre posição e corte. O prior (0,15 + 0,10) é o que segura a peça na referência
 * quando a foto não distingue (o ruído da foto mexe a calma em ~0,04); calma real (≥ 0,4 de diferença) o vence.
 */
export const PESOS_DA_PONTUACAO = {
  calma: 0.4,
  contrasteNatural: 0.2,
  assunto: 0.15,
  referencia: 0.15,
  corte: 0.1,
} as const

/** Custos de tratamento que diferem menos que isto empatam (a força do véu anda em passos maiores). */
export const TOLERANCIA_DO_CUSTO = 0.05
/** Pontuações secundárias que diferem menos que isto empatam — aí vale a mais perto da referência, depois o corte central. */
export const TOLERANCIA_DA_PONTUACAO = 0.02

/** A leitura estimada de um texto numa combinação (o fundo SEM tratamento, do raster do corte). */
export interface LeituraDoTexto {
  camada: string
  borda: Borda
  p02: number
  p98: number
  polaridade: 'clara' | 'escura' | null
  alvo: number | null
  /** Já lê sem tratamento (o `ok` do plano do CP2A, contra o alvo exato ± a tolerância dele). */
  jaLe: boolean
  precisaDeTratamento: boolean
  /** O véu planejado alcança o alvo? `null` quando não há véu automático nessa borda. */
  alcancaAlvo: boolean | null
  /** A força estimada do véu dessa borda (`null` sem véu automático). */
  forcaEstimada: number | null
}

export interface TratamentoEstimado {
  borda: Borda
  /** `explicito`: o véu é da página de assinatura (existe sempre; o CP2A não o planeja). */
  estado: PlanoDaBorda['estado'] | 'explicito'
  forca?: number
  cor?: string
  alcancaAlvo?: boolean
  motivo?: MotivoDoTratamento
}

export interface AvaliacaoDaCombinacao {
  crop: CropPosition
  combinacao: Combinacao
  /** Vazio = válida. */
  eliminada: Eliminacao[]
  componentes?: ComponentesDaPontuacao
  /** A soma ponderada dos componentes (sem o custo do tratamento). */
  pontuacao?: number
  tratamento?: TratamentoEstimado[]
  textos?: LeituraDoTexto[]
  /** A maior cobertura dos textos sobre a região ESTIMADA como assunto (sem catálogo): um patamar da ordenação, nunca eliminação. */
  regiaoEstimada?: { cobertura: number; teto: number; invade: boolean }
}

// ─── A escolha congelada e o diagnóstico ─────────────────────────────────────

/**
 * A ESCOLHA ESPACIAL que a peça grava e a recomposição REPRODUZ (sem refazer a busca): o corte, o `dy` de cada membro
 * e o canto da logo automática. Vale para a foto em que foi feita (`foto`): foto trocada, busca nova (dito no aviso).
 */
export interface EscolhaEspacial {
  modo: typeof MODO_BUSCA_ESPACIAL
  /**
   * A foto em que a escolha foi feita: a impressão (`chaveDaFoto`) da URL que a peça DESENHA (a do fundo) — a mesma
   * depois da recomposição, que troca o `driveFileId` da spec pela URL da página. Impressão, e não a URL: uma foto em
   * `data:` gravaria a imagem inteira no diagnóstico. `null` sem foto.
   */
  foto: string | null
  corte: CropPosition
  deslocamentos: Partial<Record<MembroDaFaixa, number>>
  /** O canto da logo AUTOMÁTICA (centro-óptico), congelado com a posição. */
  cantoDaLogo?: Canto | null
}

/** O resumo da busca que ESCOLHEU a posição — a recomposição o carrega adiante, para a explicação não se perder. */
export interface ResumoDaBuscaOriginal {
  id: string
  motivo: string
  recusas: Partial<Record<MotivoDeEliminacao, number>>
  combinacoesAvaliadas: number
  cortesAvaliados: CropPosition[]
}

/**
 * O que a recomposição pede ao compositor: reproduzir a escolha gravada (com o resumo da busca original), ou a
 * referência no corte central (peças do T1a, com o canto da logo automática que elas gravaram).
 */
export type EscolhaParaReproduzir = (EscolhaEspacial & { buscaOriginal?: ResumoDaBuscaOriginal }) | { modo: 'referencia'; cantoDaLogo?: Canto | null }

/** Uma avaliação no diagnóstico: compacta (sem as camadas). */
export interface ResumoDaAvaliacao {
  crop: CropPosition
  escolhas: Combinacao['escolhas']
  pontuacao: number | null
  componentes: ComponentesDaPontuacao | null
  tratamento: TratamentoEstimado[]
  textos: LeituraDoTexto[]
  eliminada: Eliminacao[]
  regiaoEstimada?: AvaliacaoDaCombinacao['regiaoEstimada']
}

/**
 * O diagnóstico da busca — em `fieldValues.composicao.arquetipo.buscaEspacial` (nunca no topo do diagnóstico: o
 * baseline sem arquétipo lista as chaves de lá). O vencedor, até 2 alternativas relevantes e o resumo das recusas.
 */
export interface DiagnosticoDaBuscaEspacial {
  versao: typeof MODO_BUSCA_ESPACIAL
  /** A impressão da escolha (foto, corte, deslocamentos): a MESMA quando a recomposição a reproduz. */
  id: string
  escolha: EscolhaEspacial
  /** Presente quando a posição veio da escolha gravada (recomposição), não de uma busca nova — com o resumo da busca original. */
  reproduzida?: { de: string; original?: ResumoDaBuscaOriginal }
  cortesAvaliados: CropPosition[]
  combinacoesAvaliadas: number
  limite: number
  faixas: Array<{ membros: MembroDaFaixa[]; intervalo: { min: number; max: number }; candidatos: CandidatoDaFaixa[] }>
  vencedor: ResumoDaAvaliacao | null
  alternativas: ResumoDaAvaliacao[]
  recusas: Partial<Record<MotivoDeEliminacao, number>>
  /** Até 6 exemplos de recusa (um por motivo, primeiro). */
  exemplosDeRecusa: Array<{ crop: CropPosition; escolhas: Combinacao['escolhas']; eliminada: Eliminacao[] }>
  /** Por que o vencedor venceu, em uma frase (o critério que decidiu). */
  motivo: string
}
