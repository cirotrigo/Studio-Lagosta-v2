/**
 * A CAUSA de uma edição de copy — e a blindagem do perfil aprendido (F2).
 *
 * O diff (`diff-copy.ts`) diz O QUE mudou. Antes de agregar qualquer coisa é
 * preciso saber POR QUE mudou, porque as três causas pedem destinos opostos:
 *
 *   fato    — a IA escreveu um preço, um horário ou uma promoção errada, e a
 *             pessoa corrigiu. Isso NÃO é preferência de escrita: é a base de
 *             conhecimento desatualizada. Vira ALERTA, e não entra no perfil.
 *   estilo  — a pessoa manteve o assunto e mudou a redação. É o único sinal que
 *             ensina como a marca fala, e o único que entra no perfil.
 *   pontual — a pessoa trocou o assunto daquela peça. Ensina sobre aquele post,
 *             não sobre a marca. Descarta.
 *
 * ── A BLINDAGEM DURA ──────────────────────────────────────────────────────
 * O perfil aprendido é PROIBIDO POR CONSTRUÇÃO de guardar preço, horário,
 * data e promoção. Não é uma diretriz: são duas travas no código.
 *
 *   1. na ESCRITA — `sanitizarParaPerfil` devolve `null` para qualquer texto
 *      que contenha um desses dados, e o perfil só guarda o que ela aprovou;
 *   2. na LEITURA — o injetor de prompt lê apenas as entradas de causa
 *      `estilo` (ver `perfil.ts`), nunca as de `fato`.
 *
 * Sem isso o perfil vira uma fonte clandestina do que só pode vir da base: o
 * preço de agosto aprendido em agosto sairia impresso na arte de dezembro, sem
 * passar por lugar nenhum onde alguém pudesse corrigi-lo. O sistema inteiro é
 * construído para que preço e horário venham da base de conhecimento, que tem
 * dono, data e como ser atualizada.
 *
 * Módulo PURO e sem dependência de modelo: a detecção é por padrão de texto.
 * Um passe de LLM aqui seria mais esperto e menos confiável — e o custo de
 * errar para o lado errado (deixar um preço entrar no perfil) é justamente o
 * que não se pode pagar.
 */

import { normalizeForComparison } from '@/lib/ai/text-comparison'
import type { CampoAlterado, DiffDeCopy } from './diff-copy'
import { semelhanca } from './diff-copy'

export type CausaDaEdicao = 'fato' | 'estilo' | 'pontual'

/** Classes de dado que o perfil não pode guardar em hipótese nenhuma. */
export type TipoProibido = 'preco' | 'horario' | 'data' | 'promocao'

/**
 * Acima desta semelhança a pessoa reescreveu MANTENDO o assunto (estilo);
 * abaixo, trocou o assunto da peça (pontual).
 *
 * 0,7 é conservador de propósito: na dúvida a alteração vira `pontual` e fica
 * FORA do perfil. Um perfil menor é melhor que um perfil que aprendeu o que
 * era conteúdo de uma peça só.
 */
export const LIMIAR_DE_ESTILO = 0.7

const PADROES: Array<{ tipo: TipoProibido; re: RegExp }> = [
  // R$ 25 / R$25,90 / 25 reais / 25,90
  { tipo: 'preco', re: /(r\$\s*\d+(?:[.,]\d{1,2})?)|(\d+(?:[.,]\d{1,2})?\s*reais)/gi },
  // 16h / 16h30 / 16:30 / das 16 às 19
  { tipo: 'horario', re: /(\d{1,2}\s*h(?:\s*\d{2})?\b)|(\d{1,2}:\d{2})|(\bdas?\s+\d{1,2}\s*(?:h\b|:\d{2})?\s*[àa]s?\s+\d{1,2})/gi },
  // 31/08 / 31 de agosto / 2026-08-31
  {
    tipo: 'data',
    re: /(\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)|(\b\d{4}-\d{2}-\d{2}\b)|(\b\d{1,2}\s+de\s+(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b)/gi,
  },
  // 10% / desconto / grátis / cortesia / leve 3 pague 2
  {
    tipo: 'promocao',
    re: /(\b\d{1,3}\s*%)|(\bdescontos?\b)|(\bgr[áa]tis\b)|(\bcortesia\b)|(\bpromo[çc][ãa]o\b)|(\bleve\s+\d+\s+pague\s+\d+\b)/gi,
  },
]

export interface DadosEncontrados {
  tipos: TipoProibido[]
  /** Os trechos exatos, normalizados — é o que se compara entre os dois lados. */
  termos: string[]
}

/** Que dados protegidos aparecem num texto. */
export function dadosProibidos(texto: string): DadosEncontrados {
  const tipos = new Set<TipoProibido>()
  const termos = new Set<string>()
  for (const { tipo, re } of PADROES) {
    // `matchAll` com /g precisa de regex sem estado compartilhado entre chamadas.
    for (const m of texto.matchAll(new RegExp(re.source, re.flags))) {
      tipos.add(tipo)
      termos.add(normalizeForComparison(m[0]).replace(/\s+/g, ''))
    }
  }
  return { tipos: [...tipos], termos: [...termos] }
}

/** `true` quando o texto carrega preço, horário, data ou promoção. */
export function contemDadoProibido(texto: string): boolean {
  return dadosProibidos(texto).tipos.length > 0
}

/**
 * A trava de ESCRITA do perfil.
 *
 * Devolve o texto quando ele é seguro para guardar, e `null` quando não é.
 * Não mascara nem reescreve de propósito: um texto com o preço apagado ainda
 * carrega a estrutura da oferta, e "quase seguro" não é um estado que valha a
 * pena existir num lugar cuja regra é "isto nunca guarda preço".
 */
export function sanitizarParaPerfil(texto: string): string | null {
  const limpo = texto.trim()
  if (!limpo) return null
  return contemDadoProibido(limpo) ? null : limpo
}

export interface AlteracaoComCausa extends CampoAlterado {
  causa: CausaDaEdicao
  /** Frase curta explicando a classificação, para quem lê o relatório. */
  evidencia: string
  /** Que classes de dado protegido mudaram (só em `fato`). */
  tiposDeFato: TipoProibido[]
}

/**
 * Classifica UMA alteração.
 *
 * A ordem das perguntas é a que importa: primeiro "mudou um dado duro?",
 * porque essa é a única resposta que não pode ter falso negativo.
 */
export function classificarAlteracao(alteracao: CampoAlterado): AlteracaoComCausa {
  const antes = dadosProibidos(alteracao.antes)
  const depois = dadosProibidos(alteracao.depois)

  const soAntes = antes.termos.filter((t) => !depois.termos.includes(t))
  const soDepois = depois.termos.filter((t) => !antes.termos.includes(t))

  if (soAntes.length > 0 || soDepois.length > 0) {
    const tipos = Array.from(new Set([...antes.tipos, ...depois.tipos]))
    return {
      ...alteracao,
      causa: 'fato',
      tiposDeFato: tipos,
      evidencia:
        soAntes.length > 0 && soDepois.length > 0
          ? `trocou ${soAntes.join(', ')} por ${soDepois.join(', ')}`
          : soDepois.length > 0
            ? `acrescentou ${soDepois.join(', ')}`
            : `tirou ${soAntes.join(', ')}`,
    }
  }

  if (alteracao.apenasFormatacao) {
    return {
      ...alteracao,
      causa: 'estilo',
      tiposDeFato: [],
      evidencia: 'só mudou a diagramação do texto (caixa, acento, separador)',
    }
  }

  const parecidos = alteracao.semelhanca >= LIMIAR_DE_ESTILO
  return {
    ...alteracao,
    causa: parecidos ? 'estilo' : 'pontual',
    tiposDeFato: [],
    evidencia: parecidos
      ? 'reescreveu mantendo o assunto'
      : 'trocou o assunto do texto — ensina sobre esta peça, não sobre a marca',
  }
}

export interface DiffComCausa {
  alteracoes: AlteracaoComCausa[]
  /** As de causa `estilo` e seguras para o perfil (já passaram pela trava). */
  paraOPerfil: AlteracaoComCausa[]
  /**
   * As de causa `fato`: viram o alerta "a base pode estar desatualizada", e
   * NUNCA entram no perfil.
   */
  alertasDeBase: AlteracaoComCausa[]
  descartadas: AlteracaoComCausa[]
}

/**
 * Classifica um diff inteiro.
 *
 * Diff ILEGÍVEL devolve tudo vazio — a regra central de `diff-copy.ts` vale
 * aqui igual: "não sei" nunca vira "nada mudou".
 */
export function classificarDiff(diff: DiffDeCopy | null | undefined): DiffComCausa {
  const vazio: DiffComCausa = { alteracoes: [], paraOPerfil: [], alertasDeBase: [], descartadas: [] }
  if (!diff || diff.ilegivel) return vazio

  const alteracoes = diff.alterados.map(classificarAlteracao)
  return {
    alteracoes,
    // Dupla trava: causa `estilo` E texto sem dado protegido. A segunda pega o
    // caso em que o preço não MUDOU mas está no texto — a alteração é de
    // estilo, e mesmo assim a frase não pode ser guardada.
    paraOPerfil: alteracoes.filter(
      (a) => a.causa === 'estilo' && sanitizarParaPerfil(a.depois) !== null,
    ),
    alertasDeBase: alteracoes.filter((a) => a.causa === 'fato'),
    descartadas: alteracoes.filter(
      (a) => a.causa === 'pontual' || (a.causa === 'estilo' && sanitizarParaPerfil(a.depois) === null),
    ),
  }
}

/** A frase do alerta de base desatualizada, pronta para a tela. */
export function alertaDeBaseDesatualizada(alertas: AlteracaoComCausa[]): string | null {
  if (alertas.length === 0) return null
  const tipos = Array.from(new Set(alertas.flatMap((a) => a.tiposDeFato)))
  const nomes: Record<TipoProibido, string> = {
    preco: 'preço',
    horario: 'horário',
    data: 'data',
    promocao: 'promoção',
  }
  const lista = tipos.map((t) => nomes[t]).join(', ')
  return `Alguém corrigiu ${lista} na copy ${alertas.length === 1 ? 'de uma peça' : `de ${alertas.length} peças`}. Isso costuma significar que a base de conhecimento está desatualizada — o sistema não aprende esses dados, ele os lê da base.`
}

/** Semelhança reexportada para quem monta um `CampoAlterado` na mão. */
export { semelhanca }
