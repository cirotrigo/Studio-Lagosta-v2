/**
 * O VOCABULÁRIO SEMÂNTICO das camadas — a única fonte do papel para a
 * fundação semântica (docs/research/studio-target-architecture.md §2).
 *
 * Não é um vocabulário paralelo: os papéis de texto são os do compositor
 * (`PAPEIS_DO_COMPOSITOR`), importados; só `foto` e `logo` entram aqui, porque
 * hoje existem apenas como convenção (`bg-foto`, `type: 'logo'`).
 *
 * Módulo PURO.
 */

import { PAPEIS_DO_COMPOSITOR } from '@/lib/compositor/papel-do-nome'

export const SEMANTIC_ROLES = [...PAPEIS_DO_COMPOSITOR, 'foto', 'logo'] as const
export type SemanticRole = (typeof SEMANTIC_ROLES)[number]

export function ehSemanticRole(valor: unknown): valor is SemanticRole {
  return typeof valor === 'string' && (SEMANTIC_ROLES as readonly string[]).includes(valor)
}

/**
 * Que tipo de camada pode cumprir cada papel. O compositor só grava papel em
 * camada de TEXTO (`camadaDoPapel`); sem esta guarda, uma imagem chamada
 * "headline" virava a manchete da página (revisão adversarial do PR A, F2).
 */
const TIPOS_DE_TEXTO = ['text', 'rich-text'] as const
const TIPOS_DO_PAPEL: Readonly<Record<SemanticRole, readonly string[]>> = {
  pre: TIPOS_DE_TEXTO,
  headline: TIPOS_DE_TEXTO,
  headline2: TIPOS_DE_TEXTO,
  apoio: TIPOS_DE_TEXTO,
  cta: TIPOS_DE_TEXTO,
  servico: TIPOS_DE_TEXTO,
  foto: ['image', 'video'],
  logo: ['logo', 'image', 'element'],
}

export function papelCabeNoTipo(papel: SemanticRole, tipo: unknown): boolean {
  return typeof tipo === 'string' && TIPOS_DO_PAPEL[papel].includes(tipo)
}

export type Cardinalidade = 'ONE' | 'OPTIONAL' | 'MANY'

/**
 * Quantas ocorrências se ESPERA de cada papel — default do vocabulário, não
 * regra. Uma página fora da expectativa (dois logos, dois CTAs) não é
 * inválida, e a expectativa nunca recusa operação: quem recusa ambiguidade é a
 * contagem OBSERVADA na resolução (`resolverAlvo`). Serve para mensagens,
 * testes e a descoberta pelos agentes; o template poderá sobrescrevê-la.
 */
export const CARDINALIDADE_ESPERADA: Readonly<Record<SemanticRole, Cardinalidade>> = {
  pre: 'OPTIONAL',
  headline: 'ONE',
  headline2: 'OPTIONAL',
  apoio: 'OPTIONAL',
  cta: 'OPTIONAL',
  servico: 'MANY',
  foto: 'ONE',
  logo: 'ONE',
}

export type CardinalidadeDoTemplate = Partial<Record<SemanticRole, Cardinalidade>>

export function cardinalidadeEsperada(papel: SemanticRole, doTemplate?: CardinalidadeDoTemplate): Cardinalidade {
  return doTemplate?.[papel] ?? CARDINALIDADE_ESPERADA[papel]
}
