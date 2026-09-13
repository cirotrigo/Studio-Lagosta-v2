/**
 * O contrato do REVISOR DA ARTE (11/09/2026).
 *
 * Pedido do Ciro: revisar a arte feita no EDITOR antes de concluir a
 * programação — "o título está muito grande", "o horário de funcionamento não
 * deu leitura" — e devolver os COMANDOS para ajustar no editor.
 *
 * Duas camadas, uma saída. O código mede o que é medível (a régua de
 * contraste, a geometria dos glifos, o corpo contra o modelo); a visão olha a
 * peça renderizada para o que a medida não enxerga (bloco mal colocado,
 * gradiente pesando na foto, entrelinha esparramada). As duas devolvem
 * ACHADOS no mesmo formato, e o número de todo ajuste é calculado pelo
 * código — a visão escolhe a correção num vocabulário fechado, nunca o valor.
 *
 * Regras da casa que moldam o contrato:
 *  - o revisor AVISA, nunca veta: nenhuma severidade bloqueia a agenda;
 *  - achado sem ajuste é decisão de gente (trocar a foto, reescrever a copy,
 *    mudar o bloco de borda) — o revisor não reescreve copy nem troca foto;
 *  - a versão da página vai junto: ajuste calculado sobre uma página que mudou
 *    depois é recusado, nunca aplicado às cegas.
 *
 * Módulo PURO (zod + tipos).
 */

import { z } from 'zod'

export const VERSAO_DAS_REGRAS = 'revisao-v1'

export const REGRAS_DA_REVISAO = [
  'fonte-nao-carregada',
  'texto-cortado',
  'tinta-fora-da-caixa',
  'colisao',
  'fora-da-area-segura',
  'logo-sobre-texto',
  'texto-sem-leitura',
  'gradiente-forte-demais',
  'titulo-grande',
  'entrelinha-grande',
  'texto-pequeno',
  'palavra-orfa',
  'texto-sobre-assunto',
  'visao',
] as const
export type RegraDaRevisao = (typeof REGRAS_DA_REVISAO)[number]

/** Nenhuma bloqueia nada: `problema` é impacto técnico (texto cortado, horário ilegível), `sugestao` é gosto. */
export type Severidade = 'problema' | 'aviso' | 'sugestao'
/** `medida` = o código mediu; `estimada` = medida aproximada (rich text, assunto estimado); `visao` = só a visão viu. */
export type Certeza = 'medida' | 'estimada' | 'visao'
export type EstadoDaCobertura = 'avaliada' | 'parcial' | 'nao-avaliada'

export const ORDEM_DE_SEVERIDADE: Record<Severidade, number> = { problema: 0, aviso: 1, sugestao: 2 }

export interface OlharDaVisao {
  problema: string
  evidencia: string
  confianca: 'alta' | 'media'
}

export interface AchadoDaRevisao {
  id: string
  regra: RegraDaRevisao
  severidade: Severidade
  certeza: Certeza
  /** Ids das camadas envolvidas (vazio = a peça inteira). */
  camadas: string[]
  mensagem: string
  evidencia: Record<string, number | string | boolean | null>
  /** Índices em `ajustes` do relatório. Vazio = sem correção mecânica. */
  ajustes: number[]
  observacao?: string
  /** O que a visão disse sobre o mesmo ponto — confirmação da medida ou achado só dela. */
  visao?: OlharDaVisao
}

export interface CoberturaDaRegra {
  estado: EstadoDaCobertura
  motivo?: string
}

export const TIPOS_DE_AJUSTE = ['fonte', 'mover', 'gradiente', 'visibilidade', 'caixa'] as const
export type TipoDeAjuste = (typeof TIPOS_DE_AJUSTE)[number]

/**
 * UM ajuste de diagramação. Objeto plano (não união) de propósito: o JSON
 * Schema derivado fica simples para o modelo ler, e a validação por tipo mora
 * em `problemaDoAjuste`, que o executor roda antes de tocar em qualquer camada.
 */
export const ajusteSchema = z
  .object({
    tipo: z
      .enum(TIPOS_DE_AJUSTE)
      .describe('fonte (corpo e/ou entrelinha), mover (desloca camadas), gradiente (força/altura do gradiente de leitura de uma borda), visibilidade, caixa (largura ou altura automática de UM texto).'),
    camadas: z
      .array(z.string().min(1).max(200))
      .min(1)
      .max(40)
      .optional()
      .describe('Ids das camadas. fonte, mover e visibilidade aceitam várias (mover um bloco = todas as camadas dele); caixa aceita UMA; gradiente aceita UM id — o gradiente a alterar (sem ele, altera o gradiente de leitura da borda ou cria um).'),
    fontSize: z.number().min(8).max(600).optional().describe('fonte: corpo novo em px da peça.'),
    escala: z.number().min(0.5).max(2).optional().describe('fonte: multiplica o corpo atual (mantém a proporção entre as vozes de um título).'),
    entrelinha: z.number().min(0.7).max(3).optional().describe('fonte: entrelinha nova (multiplicador do corpo).'),
    dx: z.number().min(-2000).max(2000).optional().describe('mover: px para a direita (negativo = esquerda).'),
    dy: z.number().min(-4000).max(4000).optional().describe('mover: px para baixo (negativo = cima).'),
    borda: z.enum(['topo', 'rodape']).optional().describe('gradiente: a borda do gradiente de leitura.'),
    forca: z.number().min(0).max(1).optional().describe('gradiente: força nova (opacidade na borda, 0 a 1).'),
    altura: z.number().min(40).max(4000).optional().describe('gradiente: altura nova da faixa em px.'),
    cor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .describe('gradiente: cor (#RRGGBB), só usada quando a borda ainda não tem gradiente.'),
    visivel: z.boolean().optional().describe('visibilidade: true mostra, false esconde.'),
    largura: z.number().min(20).max(4000).optional().describe('caixa: largura nova da caixa de texto em px (o alinhamento do texto é preservado).'),
    alturaAutomatica: z.boolean().optional().describe('caixa: true liga a altura automática (a caixa cresce até caber o texto).'),
    achado: z.string().max(200).optional().describe('O id do achado da revisão que este ajuste corrige (rastreabilidade).'),
  })
  .strict()

export type Ajuste = z.infer<typeof ajusteSchema>

/** O que falta num ajuste para ele poder ser aplicado — `null` quando está completo. */
export function problemaDoAjuste(a: Ajuste): string | null {
  switch (a.tipo) {
    case 'fonte':
      if (!a.camadas?.length) return 'fonte precisa de "camadas"'
      if (a.fontSize != null && a.escala != null) return 'fonte aceita "fontSize" OU "escala", não os dois'
      if (a.fontSize == null && a.escala == null && a.entrelinha == null) return 'fonte precisa de "fontSize", "escala" ou "entrelinha"'
      return null
    case 'mover':
      if (!a.camadas?.length) return 'mover precisa de "camadas"'
      if (!a.dx && !a.dy) return 'mover precisa de "dx" e/ou "dy" diferentes de zero'
      return null
    case 'gradiente':
      if (a.borda !== 'topo' && a.borda !== 'rodape') return 'gradiente precisa de "borda" (topo ou rodape)'
      if (a.forca == null) return 'gradiente precisa de "forca" (0 a 1)'
      if ((a.camadas?.length ?? 0) > 1) return 'gradiente aceita no máximo UM id em "camadas" (o gradiente a alterar)'
      return null
    case 'visibilidade':
      if (!a.camadas?.length) return 'visibilidade precisa de "camadas"'
      if (typeof a.visivel !== 'boolean') return 'visibilidade precisa de "visivel" (true ou false)'
      return null
    case 'caixa':
      if (a.camadas?.length !== 1) return 'caixa age em UMA camada: "camadas" com um id só'
      if (a.largura == null && a.alturaAutomatica !== true) return 'caixa precisa de "largura" e/ou "alturaAutomatica": true'
      return null
    default:
      return `tipo de ajuste desconhecido: ${String((a as { tipo?: unknown }).tipo)}`
  }
}

export interface RelatorioDaRevisao {
  versaoDasRegras: typeof VERSAO_DAS_REGRAS
  achados: AchadoDaRevisao[]
  ajustes: Ajuste[]
  cobertura: Partial<Record<RegraDaRevisao, CoberturaDaRegra>>
  resumo: string
}
