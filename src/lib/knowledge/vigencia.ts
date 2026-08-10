/**
 * Vigência de entrada da base de conhecimento (F0.1).
 *
 * `KnowledgeBaseEntry.expiresAt` já existia — com dois índices e um cron
 * diário de arquivamento (`archive-expired-knowledge`) — e ficou dormindo:
 * NINGUÉM escrevia e NINGUÉM lia. O efeito visível era campanha encerrada
 * continuando a alimentar copy e sugestão de post. Este módulo é o par de
 * pontas: o filtro que toda LEITURA aplica e o parse que toda ESCRITA usa.
 *
 * Sem dependência nenhuma de propósito: o MCP local (`scripts/mcp-server.ts`)
 * importa daqui por caminho relativo, fora do alias `@/`.
 */

/** Fuso de Brasília: é nele que os prazos são combinados com o cliente. */
const OFFSET_BRT = '-03:00'

/**
 * Filtro Prisma para "ainda vale": entrada sem prazo, ou com prazo à frente da
 * referência.
 *
 * `ref` é a data em que o conteúdo VAI SER USADO, não necessariamente agora —
 * planejamento mira slot futuro, e campanha que vence antes do slot não pode
 * entrar na copy daquele slot.
 *
 * O `gt` é o espelho do `lte` do cron de arquivamento: o instante gravado em
 * `expiresAt` é o último em que a entrada ainda vale.
 */
export function vigenteEm(ref: Date = new Date()) {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: ref } }] }
}

/** Mesma regra do filtro, para linha já carregada do banco. */
export function estaVigente(expiresAt: Date | null | undefined, ref: Date = new Date()): boolean {
  return !expiresAt || expiresAt.getTime() > ref.getTime()
}

/**
 * Normaliza a validade recebida de fora (tool do MCP, corpo de rota, campo de
 * formulário).
 *
 * Contrato dos três estados, que os chamadores propagam tal e qual:
 * - `undefined` → não veio no pedido, não mexe no que está gravado;
 * - `null` → veio vazio de propósito, LIMPA o prazo (volta a valer para sempre);
 * - `Date` → o prazo.
 *
 * Data pura (`AAAA-MM-DD`) vira o FIM daquele dia em Brasília: "vale até 31/08"
 * inclui o dia 31 inteiro. Cravar 00:00 encerraria a campanha um dia antes do
 * combinado — e no fuso errado, já que a meia-noite UTC cai às 21h de BRT.
 */
export function parseValidade(valor: unknown, campo = 'validade'): Date | null | undefined {
  if (valor === undefined) return undefined
  if (valor === null) return null

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) throw new Error(`${campo} inválida.`)
    return valor
  }

  if (typeof valor !== 'string') {
    throw new Error(`${campo} deve ser uma data em texto (AAAA-MM-DD) ou null.`)
  }

  const texto = valor.trim()
  if (!texto) return null

  const somenteData = /^\d{4}-\d{2}-\d{2}$/.test(texto)
  if (somenteData) {
    // Dia que não existe NÃO vira Invalid Date: o `Date` do V8 rola a data
    // para frente em silêncio ("2026-02-31" vira 3 de março), o que
    // estenderia a campanha por dias sem ninguém notar. Só a conferência
    // componente a componente pega isso.
    const [ano, mes, dia] = texto.split('-').map(Number)
    const teste = new Date(Date.UTC(ano, mes - 1, dia))
    if (
      teste.getUTCFullYear() !== ano ||
      teste.getUTCMonth() !== mes - 1 ||
      teste.getUTCDate() !== dia
    ) {
      throw new Error(
        `${campo} inválida: "${texto}" não é um dia que existe. Use AAAA-MM-DD (ex: 2026-08-31).`,
      )
    }
    return new Date(`${texto}T23:59:59.999${OFFSET_BRT}`)
  }

  const data = new Date(texto)
  if (Number.isNaN(data.getTime())) {
    throw new Error(
      `${campo} inválida: "${texto}". Use AAAA-MM-DD (ex: 2026-08-31) ou uma data e hora ISO.`,
    )
  }
  return data
}

/** Categoria em que prazo é a regra, não a exceção. */
export const CATEGORIA_COM_PRAZO = 'CAMPANHAS'

/**
 * Aviso — NUNCA veto. Campanha sem prazo é quase sempre esquecimento, mas há
 * campanha permanente ("Quinta do Vinho, toda quinta") e recusar a gravação
 * deixaria a pessoa sem saída.
 */
export function avisoValidadeAusente(
  category: string,
  expiresAt: Date | null | undefined,
): string | undefined {
  if (category !== CATEGORIA_COM_PRAZO || expiresAt) return undefined
  return (
    'Esta entrada é de CAMPANHAS e ficou SEM data de fim — vai alimentar textos e sugestões para ' +
    'sempre, inclusive depois que a campanha acabar. Se houver data de encerramento, pergunte à ' +
    'pessoa e grave a validade (é o que faz a campanha sair de cena sozinha).'
  )
}

/** Data em pt-BR no fuso de Brasília, para mensagens ao usuário. */
export function formatarValidade(data: Date): string {
  return data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
