/**
 * O contrato do registro único de tools MCP (PR 1 do plano do registro).
 *
 * Uma tool é declarada UMA vez — schema zod, gate, annotations, superfícies,
 * handler — e tudo o mais deriva dela: a validação real na porta do conector,
 * o `tools/list` das duas superfícies e a verificação da documentação.
 *
 * Este módulo é PURO de propósito (só tipos + uma classe de erro sem
 * dependências): `scripts/validar-registro-mcp.ts` roda sem DATABASE_URL, e
 * `@/lib/db` lança no import quando ela falta. Import de runtime pesado aqui
 * quebraria a validação de CI — e é por isso que os handlers do catálogo usam
 * `await import()` para alcançar db e serviços.
 */

import type { z } from 'zod'
import type { McpPrincipal } from '../oauth'

export type Superficie = 'remoto' | 'local'

/**
 * Quem pode chamar a tool. Declarado, não convencionado: a porta aplica o
 * gate ANTES do handler, e tool sem `acesso` não registra.
 *
 * - `autenticado`: basta o Bearer válido do conector (ex.: listar-clientes).
 * - `projeto`: `assertProjetoPermitido(args[param ?? 'projectId'])` quando o
 *   valor está presente como número; ausente (param opcional, tool resolve por
 *   hint), o handler assume — mesmo comportamento do escolher-modelo de hoje.
 * - `curador`: idem com `assertCuradorDoProjeto` (marcar-como-modelo).
 * - `proprio`: o handler resolve sozinho; o motivo é obrigatório e auditável
 *   em teste — é o que impede "proprio" de virar o default preguiçoso.
 */
export type Acesso =
  | { tipo: 'autenticado' }
  | { tipo: 'projeto'; param?: string }
  | { tipo: 'curador'; param?: string }
  | { tipo: 'proprio'; motivo: string }

/**
 * Hints que o cliente MCP usa na UX de permissão (ver-agenda flui,
 * postar-agora pede confirmação). `readOnlyHint` e `destructiveHint` são
 * obrigatórios no registro: decidir os dois faz parte de declarar a tool.
 */
export interface AnnotationsDaTool {
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

/** O que quem registra escreve. */
export interface ToolDoStudio<S extends z.ZodRawShape = z.ZodRawShape> {
  /** Nome canônico, PT, no formato portátil do MCP: ^[a-z0-9-]{1,64}$ */
  nome: string
  /**
   * Nomes antigos (os ingleses do servidor local, renomeações). Resolvem na
   * CHAMADA — cliente com lista velha continua funcionando — mas NÃO aparecem
   * no tools/list, senão o catálogo dobraria de tamanho para o modelo.
   */
  apelidos?: string[]
  descricao: string
  /** O construtor aplica `.strict()` — chave desconhecida é erro, nunca descarte. */
  schema: z.ZodObject<S>
  annotations: AnnotationsDaTool
  acesso: Acesso
  superficies: Superficie[]
  handler: (
    args: z.infer<z.ZodObject<S>>,
    principal: McpPrincipal,
  ) => Promise<unknown>
}

/** O que sai de `definirTool`: a declaração + o JSON Schema derivado e cacheado. */
export interface ToolPronta {
  readonly nome: string
  readonly apelidos: readonly string[]
  readonly descricao: string
  readonly schema: z.ZodObject<z.ZodRawShape>
  /** Derivado do zod no load, uma vez — é o que o tools/list serve. */
  readonly schemaJson: Record<string, unknown>
  readonly annotations: AnnotationsDaTool
  readonly acesso: Acesso
  readonly superficies: readonly Superficie[]
  readonly handler: (
    args: Record<string, unknown>,
    principal: McpPrincipal,
  ) => Promise<unknown>
}

/** A forma que `tools/call` devolve — a mesma do `runMcpTool` de hoje. */
export interface ResultadoMcp {
  content: Array<Record<string, unknown>>
  isError?: boolean
}

/** Entrada do tools/list. */
export interface ToolParaLista {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

/**
 * A taxonomia fechada de erros da porta. `CreativeError` continua valendo
 * (vira o mesmo JSON de sempre); esta classe existe para o handler que quiser
 * um envelope estável com instrução de recuperação — `comoResolver` é o que o
 * modelo lê para se corrigir na conversa.
 */
export type CodigoDeErro =
  | 'FERRAMENTA_DESCONHECIDA'
  | 'ENTRADA_INVALIDA'
  | 'SEM_ACESSO'
  | 'CONFIRMACAO_NECESSARIA'
  | 'REGRA_DE_NEGOCIO'
  | 'ERRO_INTERNO'

export class ErroDeTool extends Error {
  readonly codigo: CodigoDeErro
  readonly detalhes?: Record<string, unknown>
  readonly comoResolver?: string

  constructor(options: {
    codigo: CodigoDeErro
    mensagem: string
    detalhes?: Record<string, unknown>
    comoResolver?: string
  }) {
    super(options.mensagem)
    this.name = 'ErroDeTool'
    this.codigo = options.codigo
    this.detalhes = options.detalhes
    this.comoResolver = options.comoResolver
  }

  toJSON() {
    return {
      codigo: this.codigo,
      mensagem: this.message,
      ...(this.detalhes ? { detalhes: this.detalhes } : {}),
      ...(this.comoResolver ? { comoResolver: this.comoResolver } : {}),
    }
  }
}
