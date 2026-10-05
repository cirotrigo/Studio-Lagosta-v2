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
function mensagemDaFalha(e: unknown, padrao = 'a exclusão do Blob falhou sem mensagem'): string {
  const texto = (e instanceof Error ? e.message : String(e ?? '')).trim()
  return texto || padrao
}

/**
 * A decisão da prova: falhou quando houve erro (qualquer valor que não seja
 * `null`, inclusive `''`) ou sobrou URL. É o que a prova usa no lugar de
 * `if (erro)` — string vazia é falsy e passava no gate (REV-0352-01).
 */
export function limpezaFalhou(r: Pick<ResultadoDaLimpezaDeBlobs, 'erro' | 'restantes'>): boolean {
  return r.erro !== null || r.restantes.length > 0
}

export interface ResultadoDoCleanup {
  /** Mensagem da falha do cleanup do banco — `null` quando ele terminou. Nunca vazia. */
  erroDoBanco: string | null
  /**
   * As consultas que descobririam URLs e NÃO chegaram a rodar (o banco lançou
   * antes): o que elas achariam não foi apagado nem listado, e o relatório
   * precisa dizer isso em vez de parecer completo.
   */
  naoDescobertas: string[]
  blobs: ResultadoDaLimpezaDeBlobs
}

/** Quem limpa o banco anuncia cada consulta que descobre URL antes de rodá-la, e a dá por feita depois. */
export interface RegistroDeDescoberta {
  pendente(rotulo: string): void
  feita(rotulo: string): void
}

/**
 * O cleanup do banco e a exclusão do Blob são passos INDEPENDENTES (nota da
 * pré-revisão do commit 65b40096): um `delete` do banco que lança não pode
 * impedir o Blob de ser apagado nem as URLs restantes de serem listadas. `urls`
 * é lida só DEPOIS do banco — o cleanup do banco acrescenta ao conjunto as URLs
 * que ainda acha nas Generations, e o que ele já tinha juntado antes de lançar
 * entra do mesmo jeito.
 */
export async function limparBancoEBlobs(
  urls: Iterable<unknown>,
  limparBanco: (descoberta: RegistroDeDescoberta) => Promise<void>,
  apagar: (urls: string[]) => Promise<unknown>,
): Promise<ResultadoDoCleanup> {
  const pendentes = new Set<string>()
  const descoberta: RegistroDeDescoberta = {
    pendente: (rotulo) => void pendentes.add(rotulo),
    feita: (rotulo) => void pendentes.delete(rotulo),
  }
  let erroDoBanco: string | null = null
  try {
    await limparBanco(descoberta)
  } catch (e) {
    erroDoBanco = mensagemDaFalha(e, 'o cleanup do banco falhou sem mensagem')
  }
  return { erroDoBanco, naoDescobertas: [...pendentes], blobs: await apagarBlobsDaRodada(urls, apagar) }
}

/**
 * As linhas de FALHA do cleanup, cada uma dizendo o que de fato aconteceu
 * (pré-revisão do commit 400277a5): a do banco só afirma que o Blob foi
 * apagado quando ele foi; a das consultas que não rodaram lista o que ficou
 * sem descobrir; a do Blob lista as URLs que ficaram. Vazio = cleanup completo.
 */
export function falhasDoCleanup(r: ResultadoDoCleanup): string[] {
  const falhas: string[] = []
  const blobOk = !limpezaFalhou(r.blobs)
  if (r.erroDoBanco !== null) {
    falhas.push(
      `cleanup do banco NÃO terminou (conta como falha da prova): ${r.erroDoBanco} — a exclusão do Blob rodou mesmo assim com as URLs já descobertas${
        blobOk ? ` e apagou ${r.blobs.apagados} de ${r.blobs.encontrados}` : ', e também falhou (ver abaixo)'
      }`,
    )
  }
  if (r.naoDescobertas.length > 0) {
    falhas.push(`URLs NÃO descobertas — estas consultas não rodaram, e o que elas achariam não foi apagado nem listado: ${r.naoDescobertas.join('; ')}`)
  }
  if (!blobOk) {
    falhas.push(
      `blob NÃO apagado (conta como falha da prova): ${r.blobs.erro ?? 'restaram URLs no Blob'}${
        r.blobs.restantes.length ? ` — ${r.blobs.restantes.length} ficaram no Blob: ${r.blobs.restantes.join(' ')}` : ''
      }`,
    )
  }
  return falhas
}
