/**
 * A marca DURÁVEL de que uma entrada da base foi indexada por completo
 * (`metadata.indexadoEm`). A linha existir não prova o vetor: `criarEntradaBase`
 * grava a linha e indexa depois, e uma interrupção no meio deixa linha sem
 * vetor (PR13-11). Quem lê a marca é a retomada da migração da voz
 * (`classificarFato`) e a ativação da voz (`conferirFatosEsperados`).
 *
 * 🔴 A marca vale só enquanto os chunks e os vetores que ela atesta existem.
 * Uma REINDEXAÇÃO apaga os dois antes de refazê-los: se falhar depois das
 * exclusões (embeddings fora do ar) e a marca ficar, a retomada lê `completo`
 * e a voz é ativada sem os chunks da busca (PR13-36). Por isso `reindexEntry`
 * INVALIDA a marca antes de apagar e só a REPÕE depois de subir os vetores —
 * preservando `chaveDoFato` e o resto do metadata. Módulo PURO, sem Prisma.
 */
export const MARCA_DE_INDEXADO = 'indexadoEm'
/**
 * O CICLO de indexação em curso (`metadata.cicloDeIndexacao`): quem começa a
 * indexar (criar ou reindexar) carimba um token próprio; a marca de indexado só
 * é publicada por compare-and-set sobre ESSE token. Duas execuções sobre a mesma
 * entrada (a migração da voz e a API administrativa de reindex, que não
 * participa da trava por projeto) deixavam a marca válida sem chunks nem
 * vetores: a segunda apagava tudo e a primeira, atrasada, gravava a marca por
 * cima (PR13-39). Com o token, quem perdeu o ciclo não publica.
 */
export const CICLO_DE_INDEXACAO = 'cicloDeIndexacao'

/** O `metadata` de uma entrada como objeto (Json pode ser qualquer coisa; só objeto plano carrega a marca). */
export function metadataComoObjeto(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {}
}

/** `true` quando a entrada carrega a marca (string não vazia). */
export function temMarcaDeIndexado(metadata: unknown): boolean {
  const v = metadataComoObjeto(metadata)[MARCA_DE_INDEXADO]
  return typeof v === 'string' && v.length > 0
}

/** O metadata SEM a marca — o resto (chave do fato, origem, versão da prévia) fica intacto. */
export function semMarcaDeIndexado(metadata: unknown): Record<string, unknown> {
  const { [MARCA_DE_INDEXADO]: _marca, ...resto } = metadataComoObjeto(metadata)
  return resto
}

/** O token do ciclo de indexação em curso, ou null. */
export function cicloDeIndexacaoDe(metadata: unknown): string | null {
  const v = metadataComoObjeto(metadata)[CICLO_DE_INDEXACAO]
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** O metadata SEM a marca e COM o ciclo novo: é o que se grava ao COMEÇAR uma indexação. */
export function comCicloDeIndexacao(metadata: unknown, ciclo: string): Record<string, unknown> {
  return { ...semMarcaDeIndexado(metadata), [CICLO_DE_INDEXACAO]: ciclo }
}

/** O metadata COM a marca gravada em `em` — o resto fica intacto. */
export function comMarcaDeIndexado(metadata: unknown, em: Date): Record<string, unknown> {
  return { ...metadataComoObjeto(metadata), [MARCA_DE_INDEXADO]: em.toISOString() }
}
