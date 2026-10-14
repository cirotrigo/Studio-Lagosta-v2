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
  'tratamento-piorou-leitura',
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
      .describe('gradiente: cor (#RRGGBB) do gradiente CRIADO numa borda sem gradiente. Sobre um gradiente que já existe, cor diferente da dele é RECUSADA (trocar a cor não é suportado por este ajuste).'),
    visivel: z.boolean().optional().describe('visibilidade: true mostra, false esconde.'),
    largura: z.number().min(20).max(4000).optional().describe('caixa: largura nova da caixa de texto em px (o alinhamento do texto é preservado).'),
    alturaAutomatica: z.boolean().optional().describe('caixa: true liga a altura automática (a caixa cresce até caber o texto).'),
    achado: z.string().max(200).optional().describe('O id do achado da revisão que este ajuste corrige (rastreabilidade).'),
  })
  .strict()

export type Ajuste = z.infer<typeof ajusteSchema>

/**
 * Os campos que cada tipo de ajuste USA, além de `tipo` e do rótulo `achado`
 * (CP1, 13/10/2026: nada em silêncio). O schema é um objeto plano, então um
 * `forca` num `mover` passava pela validação e era ignorado calado — agora todo
 * campo fora desta lista RECUSA o ajuste com o campo nomeado.
 */
export const CAMPOS_DO_AJUSTE: Record<TipoDeAjuste, ReadonlyArray<keyof Ajuste>> = {
  fonte: ['camadas', 'fontSize', 'escala', 'entrelinha'],
  mover: ['camadas', 'dx', 'dy'],
  gradiente: ['camadas', 'borda', 'forca', 'altura', 'cor'],
  visibilidade: ['camadas', 'visivel'],
  caixa: ['camadas', 'largura', 'alturaAutomatica'],
}

/** Por que um ajuste não pode ser aplicado — o código é estável, o motivo é para gente. */
export type CodigoDaRecusa =
  | 'TIPO_DESCONHECIDO'
  | 'AJUSTE_INCOMPLETO'
  | 'CAMPO_FORA_DO_TIPO'
  | 'VALOR_FORA_DA_FAIXA'
  | 'CAMADA_INEXISTENTE'
  | 'CAMADA_DE_OUTRO_TIPO'
  | 'COR_DE_GRADIENTE_EXISTENTE'
  | 'SEM_EFEITO'
  /** Ajuste válido NÃO executado porque a chamada inteira foi recusada por outro (pré-checagem do ajustar-arte). */
  | 'CHAMADA_RECUSADA'

export interface ProblemaDoAjuste {
  codigo: CodigoDaRecusa
  motivo: string
  /** Os campos do ajuste que causaram a recusa, quando a causa é um campo. */
  campos?: string[]
}

/** Os campos que o ajuste mandou e que o tipo dele não usa. */
export function camposForaDoTipo(a: Ajuste): string[] {
  const usados = CAMPOS_DO_AJUSTE[a.tipo] as ReadonlyArray<string> | undefined
  if (!usados) return []
  return Object.keys(a).filter((k) => k !== 'tipo' && k !== 'achado' && (a as Record<string, unknown>)[k] !== undefined && !usados.includes(k))
}

/** O que impede um ajuste de ser aplicado, sem olhar a página — `null` quando ele está completo e coerente. */
export function problemaEstruturadoDoAjuste(a: Ajuste): ProblemaDoAjuste | null {
  if (!(TIPOS_DE_AJUSTE as readonly string[]).includes(a.tipo)) {
    return { codigo: 'TIPO_DESCONHECIDO', motivo: `tipo de ajuste desconhecido: ${String((a as { tipo?: unknown }).tipo)}` }
  }
  const fora = camposForaDoTipo(a)
  if (fora.length > 0) {
    return {
      codigo: 'CAMPO_FORA_DO_TIPO',
      motivo: `${a.tipo} não usa ${fora.map((c) => `"${c}"`).join(', ')}: o ajuste foi recusado inteiro em vez de aplicado sem ${fora.length === 1 ? 'esse campo' : 'esses campos'}`,
      campos: fora,
    }
  }
  const incompleto = (motivo: string, campos?: string[]): ProblemaDoAjuste => ({ codigo: 'AJUSTE_INCOMPLETO', motivo, ...(campos ? { campos } : {}) })
  switch (a.tipo) {
    case 'fonte':
      if (!a.camadas?.length) return incompleto('fonte precisa de "camadas"', ['camadas'])
      if (a.fontSize != null && a.escala != null) return incompleto('fonte aceita "fontSize" OU "escala", não os dois', ['fontSize', 'escala'])
      if (a.fontSize == null && a.escala == null && a.entrelinha == null) return incompleto('fonte precisa de "fontSize", "escala" ou "entrelinha"')
      return null
    case 'mover':
      if (!a.camadas?.length) return incompleto('mover precisa de "camadas"', ['camadas'])
      if (!a.dx && !a.dy) return incompleto('mover precisa de "dx" e/ou "dy" diferentes de zero', ['dx', 'dy'])
      return null
    case 'gradiente':
      if (a.borda !== 'topo' && a.borda !== 'rodape') return incompleto('gradiente precisa de "borda" (topo ou rodape)', ['borda'])
      if (a.forca == null) return incompleto('gradiente precisa de "forca" (0 a 1)', ['forca'])
      if (a.forca < 0 || a.forca > 1) return { codigo: 'VALOR_FORA_DA_FAIXA', motivo: `"forca" vai de 0 a 1 (veio ${a.forca})`, campos: ['forca'] }
      if ((a.camadas?.length ?? 0) > 1) return incompleto('gradiente aceita no máximo UM id em "camadas" (o gradiente a alterar)', ['camadas'])
      return null
    case 'visibilidade':
      if (!a.camadas?.length) return incompleto('visibilidade precisa de "camadas"', ['camadas'])
      if (typeof a.visivel !== 'boolean') return incompleto('visibilidade precisa de "visivel" (true ou false)', ['visivel'])
      return null
    case 'caixa':
      if (a.camadas?.length !== 1) return incompleto('caixa age em UMA camada: "camadas" com um id só', ['camadas'])
      if (a.largura == null && a.alturaAutomatica !== true) return incompleto('caixa precisa de "largura" e/ou "alturaAutomatica": true', ['largura', 'alturaAutomatica'])
      if (a.alturaAutomatica === false) {
        return { codigo: 'SEM_EFEITO', motivo: '"alturaAutomatica": false não desliga nada — este ajuste só liga a altura automática', campos: ['alturaAutomatica'] }
      }
      return null
  }
  return null
}

/** O que falta num ajuste para ele poder ser aplicado — `null` quando está completo. */
export function problemaDoAjuste(a: Ajuste): string | null {
  return problemaEstruturadoDoAjuste(a)?.motivo ?? null
}

export interface RelatorioDaRevisao {
  versaoDasRegras: typeof VERSAO_DAS_REGRAS
  achados: AchadoDaRevisao[]
  ajustes: Ajuste[]
  cobertura: Partial<Record<RegraDaRevisao, CoberturaDaRegra>>
  resumo: string
}
