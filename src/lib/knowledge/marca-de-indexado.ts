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
 * A indexação que ficou PENDENTE depois de uma edição já GRAVADA (PR13-45): a reindexação da edição tomou um
 * conflito de arrendamento. Não é recusa — a edição vale —, e por isso quem responde nunca diz "nada foi salvo".
 * - `INDEXACAO_EM_ANDAMENTO`: outra execução adquiriu a entrada DEPOIS da edição, e a aquisição lê o conteúdo da
 *   linha — ela indexa o texto novo;
 * - `INDEXACAO_PERDIDA`: a posse não se confirmou (token trocado, ou cinco conflitos seguidos de compare-and-set):
 *   não prova que outra execução vá concluir (PR13-46);
 * - `INDEXACAO_SUPERADA`: a linha mudou de novo por fora (script, SQL direto) no meio: ninguém indexa a versão atual.
 * `null` para qualquer outro erro, que segue como erro.
 */
export interface IndexacaoPendente {
  code: 'INDEXACAO_EM_ANDAMENTO' | 'INDEXACAO_PERDIDA' | 'INDEXACAO_SUPERADA'
  aviso: string
}
export function indexacaoPendenteDe(erro: unknown): IndexacaoPendente | null {
  if (ehIndexacaoEmAndamento(erro)) {
    // Há um arrendamento VIGENTE de outra execução, adquirido depois da edição: ela leu o texto novo.
    return {
      code: 'INDEXACAO_EM_ANDAMENTO',
      aviso: 'A edição foi salva. Outra execução está indexando esta entrada para a busca agora, já com o texto novo: ela aparece nas buscas quando essa indexação terminar.',
    }
  }
  if (erro instanceof ArrendamentoPerdido || temCodigo(erro, 'INDEXACAO_PERDIDA')) {
    // PR13-46: `ArrendamentoPerdido` também sai de cinco conflitos seguidos de compare-and-set com o token AINDA desta
    // execução (edições de campo não indexado no meio) — não prova que outra execução exista. Sem promessa.
    return {
      code: 'INDEXACAO_PERDIDA',
      aviso: 'A edição foi salva, mas a indexação para a busca não foi concluída: a entrada pode ficar fora da busca ou com o texto anterior até ser reindexada.',
    }
  }
  if (erro instanceof IndexacaoSuperada || temCodigo(erro, 'INDEXACAO_SUPERADA')) {
    return {
      code: 'INDEXACAO_SUPERADA',
      aviso: 'A edição foi salva, mas a entrada foi alterada de novo por fora enquanto era indexada: ela pode ficar fora da busca até ser reindexada.',
    }
  }
  return null
}

/**
 * O aviso de uma resposta 202 de edição da base (`indexacao: 'pendente'`), para a TELA mostrar sem bloquear — a
 * edição vale e o fluxo segue (PR13-50 da revisão final do Codex, 18/09/2026: o chat e a página de edição do admin
 * liam o JSON só no erro e engoliam o aviso). `null` quando a indexação não ficou pendente.
 */
export function avisoDaIndexacaoPendente(resposta: unknown): string | null {
  const r = resposta as { indexacao?: unknown; aviso?: unknown } | null | undefined
  if (r?.indexacao !== 'pendente') return null
  return typeof r.aviso === 'string' && r.aviso.trim()
    ? r.aviso
    : 'A edição foi salva, mas a busca pode continuar desatualizada até a entrada ser reindexada.'
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

/**
 * O `metadata` de uma entrada da base tem TRÊS donos (PR13-47), e todo escritor mexe só no que é seu:
 * - a IDENTIDADE do sistema (`CHAVES_DE_IDENTIDADE`): `chaveDoFato` — a ÚNICA forma de a retomada da migração da voz
 *   reencontrar o fato (`estadoDoFatoNaBase` consulta por ela) — e a procedência gravada junto (`origem`,
 *   `versaoDaPrevia`). Nasce com a entrada, nunca vem de uma edição da pessoa e SOBREVIVE a toda edição, inclusive a
 *   que troca o conteúdo. Apagá-la fazia a reaplicação ler o fato como ausente e criar outra entrada — ou recriar o
 *   texto anterior à correção da pessoa em vez de bloquear pela divergência;
 * - as marcas TRANSITÓRIAS da indexação (`CHAVES_TRANSITORIAS`: marca de indexado, token, prazo): só o ciclo as
 *   escreve (`arrendamento.ts`, `marcarFatoIndexado`), e a edição que muda o índice as tira;
 * - o resto é da PESSOA: é o que a edição substitui (`metadataDaPessoa`).
 */
export const CHAVE_DO_FATO = 'chaveDoFato'
export const CHAVES_DE_IDENTIDADE = [CHAVE_DO_FATO, 'origem', 'versaoDaPrevia'] as const
export const CHAVES_TRANSITORIAS = [MARCA_DE_INDEXADO, CICLO_DE_INDEXACAO, EXPIRACAO_DO_CICLO] as const
export const CHAVES_DO_SISTEMA = [...CHAVES_DE_IDENTIDADE, ...CHAVES_TRANSITORIAS] as const

function soAsChaves(metadata: unknown, chaves: readonly string[]): Record<string, unknown> {
  const obj = metadataComoObjeto(metadata)
  return Object.fromEntries(chaves.filter((k) => k in obj).map((k) => [k, obj[k]]))
}
function semAsChaves(metadata: unknown, chaves: readonly string[]): Record<string, unknown> {
  const resto = { ...metadataComoObjeto(metadata) }
  for (const k of chaves) delete resto[k]
  return resto
}
/**
 * A identidade do sistema presente no metadata (`chaveDoFato`, `origem`, `versaoDaPrevia`) — e SÓ num fato da
 * migração, isto é, com `chaveDoFato`. Sem ela, `origem` e `versaoDaPrevia` são da pessoa: uma entrada comum
 * com `origem: 'importacao-planilha'` a preserva na criação e a edita como qualquer campo (C13-01 da revisão final
 * do Codex, 18/09/2026 — a proteção valia para toda entrada e descartava a procedência de quem não é fato).
 */
export function identidadeDo(metadata: unknown): Record<string, unknown> {
  return CHAVE_DO_FATO in metadataComoObjeto(metadata) ? soAsChaves(metadata, CHAVES_DE_IDENTIDADE) : {}
}
/**
 * O que é da PESSOA: o metadata sem as chaves do sistema — é o que um pedido externo pode escrever. `chaveDoFato`
 * e as marcas transitórias saem sempre; `origem`/`versaoDaPrevia` saem só quando o pedido traz `chaveDoFato` (é a
 * identidade de um fato sendo FORJADA). Num fato de verdade a identidade da linha vence de todo jeito.
 */
export function metadataDaPessoa(metadata: unknown): Record<string, unknown> {
  const forjaIdentidade = CHAVE_DO_FATO in metadataComoObjeto(metadata)
  return semAsChaves(metadata, forjaIdentidade ? CHAVES_DO_SISTEMA : [CHAVE_DO_FATO, ...CHAVES_TRANSITORIAS])
}
/** O metadata sem as marcas transitórias da indexação: quem CRIA nunca chega com marca, token ou prazo prontos. */
export function semChavesTransitorias(metadata: unknown): Record<string, unknown> {
  return semAsChaves(metadata, CHAVES_TRANSITORIAS)
}

/**
 * O `metadata` que uma EDIÇÃO grava (PR13-42/47), ou `undefined` para não escrever metadata:
 * - a IDENTIDADE vem sempre da linha lida e fica mesmo quando o índice muda — o pedido não a apaga nem a forja;
 * - as marcas TRANSITÓRIAS vêm da linha lida quando o índice não muda, e SAEM quando muda: a marca atestava os chunks
 *   do conteúdo anterior, e sem o token a marca que um ciclo anterior publicaria DEPOIS do retorno
 *   (`marcarFatoIndexado`) é recusada;
 * - o metadata do pedido substitui só o que é da pessoa (`null` o limpa).
 */
export function metadataDaEdicao(atual: unknown, pedido: unknown, mudaIndice: boolean): unknown {
  const transitoriasAtuais = soAsChaves(atual, CHAVES_TRANSITORIAS)
  const doSistema = { ...identidadeDo(atual), ...(mudaIndice ? {} : transitoriasAtuais) }
  if (pedido === undefined) return mudaIndice && Object.keys(transitoriasAtuais).length > 0 ? semChavesTransitorias(atual) : undefined
  if (pedido === null) return Object.keys(doSistema).length > 0 ? doSistema : null
  return { ...metadataDaPessoa(pedido), ...doSistema }
}
