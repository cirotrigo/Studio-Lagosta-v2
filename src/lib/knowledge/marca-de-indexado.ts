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

/**
 * O ARRENDAMENTO da entrada (PR13-41): o token do ciclo só protegia a
 * PUBLICAÇÃO da marca. A execução que perdeu o ciclo ainda apagava chunks e
 * vetores que a vencedora tinha acabado de recuperar, e sobrava marca válida
 * sem vetor. Hoje quem indexa ADQUIRE a entrada por um prazo
 * (`metadata.cicloExpiraEm`, ISO), renova antes de cada passo destrutivo ou de
 * publicação e libera ao terminar. Quem encontra arrendamento VIGENTE de outro
 * token não toca em nada (`IndexacaoEmAndamento`); quem descobre, ao renovar,
 * que o token não é mais o seu para sem escrever (`ArrendamentoPerdido`).
 *
 * Liberar tira SÓ o prazo: o token fica como "o último ciclo", e é contra ele
 * que `marcarFatoIndexado` publica a marca depois do retorno (PR13-40) — outra
 * execução que adquirir no meio troca o token e a publicação atrasada é recusada.
 */
export const EXPIRACAO_DO_CICLO = 'cicloExpiraEm'
/**
 * Duração do arrendamento: bem maior que o prazo de UM passo, para que a
 * chamada abortada no prazo nunca termine depois do fim do arrendamento que a
 * autorizou (a folga cobre também relógios de processos diferentes, até ~4 min
 * de desvio). Preço: uma execução morta segura a entrada por até 5 minutos.
 */
export const DURACAO_DO_ARRENDAMENTO_MS = 5 * 60_000
/** Prazo de cada passo destrutivo ou de publicação depois de renovar (apagar chunks, apagar vetores, gravar chunks, subir vetores, repor a marca). */
export const PRAZO_DO_PASSO_MS = 60_000

/** O token do arrendamento VIGENTE (token + prazo no futuro), ou null — token sem prazo é ciclo encerrado, não arrendamento. */
export function arrendamentoVigenteDe(metadata: unknown, agora: number): string | null {
  const ciclo = cicloDeIndexacaoDe(metadata)
  const expira = metadataComoObjeto(metadata)[EXPIRACAO_DO_CICLO]
  if (!ciclo || typeof expira !== 'string') return null
  const fim = Date.parse(expira)
  return Number.isFinite(fim) && fim > agora ? ciclo : null
}

/** Ao ADQUIRIR: sem a marca, com o token e o prazo novos. */
export function comArrendamento(metadata: unknown, ciclo: string, expiraEm: number): Record<string, unknown> {
  return { ...comCicloDeIndexacao(metadata, ciclo), [EXPIRACAO_DO_CICLO]: new Date(expiraEm).toISOString() }
}

/** Ao RENOVAR: o mesmo metadata com o prazo estendido. */
export function comPrazoRenovado(metadata: unknown, expiraEm: number): Record<string, unknown> {
  return { ...metadataComoObjeto(metadata), [EXPIRACAO_DO_CICLO]: new Date(expiraEm).toISOString() }
}

/** Ao LIBERAR: sem o prazo; o token fica como o último ciclo (é contra ele que a marca é publicada depois). */
export function semPrazoDoArrendamento(metadata: unknown): Record<string, unknown> {
  const { [EXPIRACAO_DO_CICLO]: _prazo, ...resto } = metadataComoObjeto(metadata)
  return resto
}

/** Outra execução detém o arrendamento vigente da entrada: nada foi tocado. A API responde 409; a migração bloqueia o cliente. */
export class IndexacaoEmAndamento extends Error {
  readonly code = 'INDEXACAO_EM_ANDAMENTO' as const
  constructor(readonly entryId: string, readonly expiraEm: string | null) {
    super(`a entrada ${entryId} está sendo indexada por outra execução${expiraEm ? ` (arrendamento vigente até ${expiraEm})` : ''}: nada foi tocado, tente de novo depois`)
    this.name = 'IndexacaoEmAndamento'
  }
}

/** A execução perdeu o arrendamento no meio (expirou e outra o tomou, ou a linha sumiu): parou antes de escrever, sem compensar nada. */
export class ArrendamentoPerdido extends Error {
  readonly code = 'INDEXACAO_PERDIDA' as const
  constructor(readonly entryId: string, readonly etapa: string) {
    super(`outra indexação assumiu a entrada ${entryId} antes de "${etapa}": esta execução parou sem escrever mais nada`)
    this.name = 'ArrendamentoPerdido'
  }
}

/**
 * A linha mudou POR BAIXO do ciclo (PR13-42): o conteúdo, a categoria ou o status que a indexação leu ao adquirir
 * não são mais os da linha. O ciclo parou antes de publicar (chunks, vetores ou marca) uma versão superada, sem
 * compensar nada. Só acontece com escrita que não passa por `editarEntradaCoordenada` (script, SQL direto): a
 * edição coordenada é recusada enquanto o arrendamento vale.
 */
export class IndexacaoSuperada extends Error {
  readonly code = 'INDEXACAO_SUPERADA' as const
  constructor(readonly entryId: string, readonly etapa: string) {
    super(`o conteúdo da entrada ${entryId} mudou durante a indexação, antes de "${etapa}": esta execução parou sem publicar a versão antiga`)
    this.name = 'IndexacaoSuperada'
  }
}

function temCodigo(erro: unknown, code: string): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === code
}
export function ehIndexacaoEmAndamento(erro: unknown): erro is IndexacaoEmAndamento {
  return erro instanceof IndexacaoEmAndamento || temCodigo(erro, 'INDEXACAO_EM_ANDAMENTO')
}
/** O ciclo perdeu a posse: outra execução tomou o arrendamento, ou a linha indexada mudou por baixo dele (PR13-42). Nos dois casos a linha não é mais deste ciclo — nada se compensa. */
export function perdeuOArrendamento(erro: unknown): erro is ArrendamentoPerdido | IndexacaoSuperada {
  return erro instanceof ArrendamentoPerdido || erro instanceof IndexacaoSuperada || temCodigo(erro, 'INDEXACAO_PERDIDA') || temCodigo(erro, 'INDEXACAO_SUPERADA')
}

/**
 * Os campos da linha que ENTRAM no índice (PR13-42): `content` vira os chunks; `category` e `status` vão no metadata
 * de cada vetor (a busca filtra por eles). O título não entra em nenhum dos dois.
 */
export const CAMPOS_INDEXADOS = ['content', 'category', 'status'] as const
export type CamposIndexados = { content: string; category: string; status: string }

/** A versão do que a linha indexa: o ciclo a lê ao adquirir e confere antes de cada publicação. */
export function versaoIndexadaDe(linha: CamposIndexados): string {
  return JSON.stringify([linha.content, linha.category, linha.status])
}

/** A edição troca algum campo indexado (campo ausente na edição não conta). */
export function edicaoMudaIndice(atual: CamposIndexados, edicao: Partial<CamposIndexados>): boolean {
  return CAMPOS_INDEXADOS.some((campo) => edicao[campo] !== undefined && edicao[campo] !== atual[campo])
}

const CHAVES_DO_SISTEMA = [MARCA_DE_INDEXADO, CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO] as const

/**
 * O `metadata` que uma EDIÇÃO grava (PR13-42), ou `undefined` para não escrever metadata:
 * - as chaves do SISTEMA (marca, token, prazo) vêm sempre da linha lida — o metadata que a pessoa manda substitui o
 *   dela, nunca apaga nem forja um arrendamento em curso;
 * - quando a edição muda o índice, as três saem: a marca atestava os chunks do conteúdo anterior, e sem o token a
 *   marca que um ciclo anterior publicaria DEPOIS do retorno (`marcarFatoIndexado`) é recusada.
 */
export function metadataDaEdicao(atual: unknown, pedido: unknown, mudaIndice: boolean): unknown {
  const obj = metadataComoObjeto(atual)
  const temSistema = CHAVES_DO_SISTEMA.some((k) => k in obj)
  const sistema = Object.fromEntries(CHAVES_DO_SISTEMA.filter((k) => k in obj).map((k) => [k, obj[k]]))
  const semSistema = (m: unknown) => {
    const resto = { ...metadataComoObjeto(m) }
    for (const k of CHAVES_DO_SISTEMA) delete resto[k]
    return resto
  }
  if (pedido === undefined) return mudaIndice && temSistema ? semSistema(atual) : undefined
  if (pedido === null) return !mudaIndice && temSistema ? sistema : null
  return { ...semSistema(pedido), ...(mudaIndice ? {} : sistema) }
}
