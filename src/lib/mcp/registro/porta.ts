/**
 * A porta única: todo `tools/call` que resolve no catálogo passa por aqui, na
 * ordem apelido → superfície → coerção → validação → gate → handler → moldagem.
 *
 * Os comportamentos calibrados por incidente são preservados VERBATIM:
 * - a mensagem de parâmetro desconhecido (12/08/2026) sai idêntica à do
 *   `parametrosDesconhecidos` legado;
 * - a coerção de string JSON (23/08/2026) roda ANTES do parse — senão o
 *   `.strict()` recusaria a chamada que hoje funciona quando o cliente MCP
 *   serializa um argumento composto como string.
 *
 * Módulo puro: os gates reais (assertProjetoPermitido etc.) tocam banco e
 * Clerk, então entram INJETADOS — é o que deixa `validar-registro-mcp.ts`
 * exercitar a porta sem DATABASE_URL. `CreativeError` é classe sem
 * dependências, seguro importar.
 */

import type { z } from 'zod'
import { CreativeError } from '../../creatives/errors'
import { ErroDeTool } from './tipos'
import type { McpPrincipal } from '../oauth'
import type { ResultadoMcp, Superficie, ToolPronta } from './tipos'

export interface GatesDaPorta {
  projeto: (projectId: number, principal: McpPrincipal) => Promise<void>
  curador: (projectId: number, principal: McpPrincipal) => Promise<void>
}

export interface DependenciasDaPorta {
  gates: GatesDaPorta
  /**
   * Fallback de convivência: nome que não está no catálogo cai no dispatcher
   * legado (`runMcpTool`) até a migração terminar. Sem ele, desconhecido é
   * desconhecido.
   */
  legado?: (
    nome: string,
    args: Record<string, unknown>,
    principal: McpPrincipal,
  ) => Promise<ResultadoMcp>
}

export async function executarTool(
  indice: ReadonlyMap<string, ToolPronta>,
  superficie: Superficie,
  nome: string,
  argsBrutos: Record<string, unknown> | undefined,
  principal: McpPrincipal,
  deps: DependenciasDaPorta,
): Promise<ResultadoMcp> {
  const tool = indice.get(nome)

  if (!tool) {
    if (deps.legado) return deps.legado(nome, argsBrutos ?? {}, principal)
    return erroDeTexto(`Ferramenta desconhecida: ${nome}`)
  }

  // Tool do catálogo fora desta superfície NÃO cai no legado: o nome já é do
  // registro, e responder pelo dispatcher velho seria colisão disfarçada.
  // Para quem chama, ela simplesmente não existe aqui.
  if (!tool.superficies.includes(superficie)) {
    return erroDeTexto(`Ferramenta desconhecida: ${nome}`)
  }

  const args = coagirPeloSchemaDerivado(tool.schemaJson, argsBrutos ?? {})

  const parse = tool.schema.safeParse(args)
  if (!parse.success) {
    return erroDeTexto(mensagemDeEntradaInvalida(tool, parse.error))
  }
  const validados = parse.data as Record<string, unknown>

  try {
    if (tool.acesso.tipo === 'projeto' || tool.acesso.tipo === 'curador') {
      const param = tool.acesso.param ?? 'projectId'
      const valor = validados[param]
      // Presente como número → gate; ausente (param opcional) o handler
      // resolve por hint — mesmo contrato do escolher-modelo de hoje.
      if (typeof valor === 'number') {
        const gate = tool.acesso.tipo === 'projeto' ? deps.gates.projeto : deps.gates.curador
        await gate(valor, principal)
      }
    }

    const result = await tool.handler(validados, principal)

    // Tools visuais (conferir-arte) devolvem blocos prontos — texto + imagem.
    if (
      result &&
      typeof result === 'object' &&
      Array.isArray((result as Record<string, unknown>)._mcpContent)
    ) {
      return { content: (result as { _mcpContent: Array<Record<string, unknown>> })._mcpContent }
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
  } catch (error) {
    const text =
      error instanceof ErroDeTool || error instanceof CreativeError
        ? JSON.stringify(error.toJSON(), null, 2)
        : `Erro: ${error instanceof Error ? error.message : String(error)}`
    console.error(`[mcp] tool ${tool.nome} falhou:`, error)
    return { content: [{ type: 'text' as const, text }], isError: true }
  }
}

function erroDeTexto(text: string): ResultadoMcp {
  return { content: [{ type: 'text' as const, text }], isError: true }
}

/**
 * Coerção de STRING JSON para o tipo que o schema declara — mesma lógica do
 * `coagirPeloSchema` legado (23/08/2026), lendo o schema DERIVADO. String que
 * não parseia limpo fica como veio e o parse recusa com a mensagem de campo.
 */
export function coagirPeloSchemaDerivado(
  schemaJson: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const props = schemaJson.properties as Record<string, { type?: unknown }> | undefined
  if (!props) return args
  const saida: Record<string, unknown> = { ...args }
  for (const [chave, valor] of Object.entries(saida)) {
    const tipo = props[chave]?.type
    if (typeof valor !== 'string') continue
    if (tipo !== 'array' && tipo !== 'object') continue
    const texto = valor.trim()
    if (!(tipo === 'array' ? texto.startsWith('[') : texto.startsWith('{'))) continue
    try {
      const parsed = JSON.parse(texto)
      if (tipo === 'array' ? Array.isArray(parsed) : typeof parsed === 'object' && parsed !== null) {
        saida[chave] = parsed
      }
    } catch {
      // Fica como veio — o parse recusa com a mensagem própria.
    }
  }
  return saida
}

const TIPO_EM_PT: Record<string, string> = {
  string: 'texto',
  number: 'número',
  integer: 'número inteiro',
  boolean: 'verdadeiro/falso',
  object: 'objeto',
  array: 'lista',
  null: 'nulo',
  undefined: 'nada',
  nan: 'número',
}

function tipoPt(tipo: unknown): string {
  return TIPO_EM_PT[String(tipo)] ?? String(tipo)
}

/**
 * ZodError → mensagem em PT que o modelo consegue agir em cima.
 *
 * Chave desconhecida reusa VERBATIM a mensagem do guard legado — ela foi
 * calibrada pelo incidente de 12/08/2026 e as skills/conversas já a conhecem.
 */
export function mensagemDeEntradaInvalida(tool: ToolPronta, erro: z.ZodError): string {
  const aceitos = Object.keys(
    (tool.schemaJson.properties as Record<string, unknown> | undefined) ?? {},
  ).join(', ')

  const desconhecidas = erro.issues
    .filter((i) => i.code === 'unrecognized_keys')
    .flatMap((i) => (i as { keys: string[] }).keys)
  if (desconhecidas.length > 0) {
    return (
      `A ferramenta ${tool.nome} não conhece ${desconhecidas.map((d) => `"${d}"`).join(', ')}. ` +
      `Os parâmetros aceitos são: ${aceitos}.`
    )
  }

  const problemas = erro.issues.map((issue) => {
    const campo = issue.path.join('.') || 'entrada'
    if (issue.code === 'invalid_type') {
      const it = issue as { expected: unknown; received: unknown }
      if (String(it.received) === 'undefined') return `falta "${campo}"`
      return `"${campo}" espera ${tipoPt(it.expected)}, veio ${tipoPt(it.received)}`
    }
    if (issue.code === 'invalid_enum_value') {
      const opcoes = (issue as { options: unknown[] }).options
      return `"${campo}" aceita: ${opcoes.map((o) => String(o)).join(', ')}`
    }
    return `"${campo}": ${issue.message}`
  })

  return (
    `Entrada inválida para a ferramenta ${tool.nome}: ${problemas.join('; ')}. ` +
    `Os parâmetros aceitos são: ${aceitos}.`
  )
}
