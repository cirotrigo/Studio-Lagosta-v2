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

/**
 * CP4.2b — a recusa dos `slotValues` (formato 400 / endereço 422): código do primeiro erro,
 * a lista inteira em `details.erros`. Mora aqui, e não em arte-rapida.ts, para os handlers
 * do MCP a usarem sem importar o serviço (que os testes das guardas mockam por inteiro).
 */
export function erroDeValores(erros: Array<{ codigo: string; [k: string]: unknown }>, status: number): CreativeError {
  const chaveDe = (e: Record<string, unknown>): string | undefined => {
    const origem = e.origem as { chave?: string } | undefined
    return origem?.chave ?? (e.chave as string | undefined) ?? (e.campo as string | undefined) ?? (e.layerId as string | undefined)
  }
  const DICA: Record<string, string> = {
    VALOR_INVALIDO: 'aceito: texto (string) ou objeto só com content, fileUrl, hidden: true, papel, bloco',
    CHAVE_DESCONHECIDA: 'não é id nem nome de camada do modelo, nem um controle _driveImageId/_imageUrl/_slots/_papeis',
  }
  const partes = erros.map((e) => {
    const chave = chaveDe(e as Record<string, unknown>)
    const tipo = ((e as Record<string, unknown>).origem as { tipo?: string } | undefined)?.tipo
    // Pelos controles `_slots`/`_papeis` o valor semântico aceita só texto ou { content, fileUrl } (Codex R2).
    const dica = e.codigo === 'VALOR_INVALIDO' && (tipo === 'slotId' || tipo === 'semanticRole') ? 'aceito por _slots/_papeis: texto (string) ou objeto só com content, fileUrl' : DICA[e.codigo]
    return `${e.codigo}${chave ? ` em "${chave}"` : ''}${dica ? ` (${dica})` : ''}`
  })
  return new CreativeError(erros[0].codigo, `Os valores de slotValues não puderam ser aplicados: ${partes.join('; ')}.`, status, { erros: erros as unknown as Record<string, unknown>[] })
}
