/**
 * A limpeza dos PNGs que uma prova de integração subiu ao Blob de PRODUÇÃO
 * (PR 0, `scripts/validar-revisor-da-arte.ts`) — sem Prisma e sem o SDK do Blob:
 * quem chama passa a função que apaga.
 *
 * Só entram URLs do Blob; a falha ao apagar é FALHA da prova (REV-9E-03), e as
 * URLs que ficaram voltam para o relatório. Toda URL que a prova viu entra no
 * conjunto — inclusive a do PNG que o próprio `persist` já tentou apagar
 * (REV-90AA-01): tentar de novo um arquivo que já sumiu não custa nada, e é o
 * que pega a exclusão que falhou e virou só aviso.
 */

export interface ResultadoDaLimpezaDeBlobs {
  /** URLs do Blob no conjunto (fora do Blob não entram). */
  encontrados: number
  apagados: number
  /** Mensagem da falha — `null` quando tudo foi apagado. */
  erro: string | null
  /** As URLs que ficaram quando a exclusão falhou. */
  restantes: string[]
}

export function urlsDoBlob(urls: Iterable<unknown>): string[] {
  return [...new Set([...urls].filter((u): u is string => typeof u === 'string' && u.includes('blob.vercel-storage.com')))]
}

export async function apagarBlobsDaRodada(urls: Iterable<unknown>, apagar: (urls: string[]) => Promise<unknown>): Promise<ResultadoDaLimpezaDeBlobs> {
  const doBlob = urlsDoBlob(urls)
  if (doBlob.length === 0) return { encontrados: 0, apagados: 0, erro: null, restantes: [] }
  try {
    await apagar(doBlob)
    return { encontrados: doBlob.length, apagados: doBlob.length, erro: null, restantes: [] }
  } catch (e) {
    return { encontrados: doBlob.length, apagados: 0, erro: mensagemDaFalha(e), restantes: doBlob }
  }
}

/**
 * A mensagem nunca sai VAZIA: `new Error('')` ou `throw ''` viravam `erro: ''`,
 * e o `if (erro)` da prova passava com URLs no Blob de produção
 * (REV-0352-01).
 */
function mensagemDaFalha(e: unknown): string {
  const texto = (e instanceof Error ? e.message : String(e ?? '')).trim()
  return texto || 'a exclusão do Blob falhou sem mensagem'
}

/**
 * A decisão da prova: falhou quando houve erro (qualquer valor que não seja
 * `null`, inclusive `''`) ou sobrou URL. É o que a prova usa no lugar de
 * `if (erro)` — string vazia é falsy e passava no gate (REV-0352-01).
 */
export function limpezaFalhou(r: Pick<ResultadoDaLimpezaDeBlobs, 'erro' | 'restantes'>): boolean {
  return r.erro !== null || r.restantes.length > 0
}
