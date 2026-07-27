/**
 * Erro de domínio das artes, com código estável legível por máquina — as rotas
 * HTTP mapeiam para status e as tools MCP devolvem como JSON estruturado.
 */
export class CreativeError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
    super(message)
    this.name = 'CreativeError'
    this.code = code
    this.status = status
    this.details = details
  }

  toJSON() {
    return { error: this.code, message: this.message, ...(this.details ?? {}) }
  }
}
