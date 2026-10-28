/**
 * Tipos do motor puro de grades de fotos (G0). Sem React, DOM, banco ou rede.
 * Plano: docs/research/canva-grades-de-fotos-2026-10/PLANO-GRADES-PRIORITARIO.md (§2–§4), fora do git.
 */

/** Caixa em px da página */
export interface Retangulo {
  x: number
  y: number
  w: number
  h: number
}

export type CodigoDaGrade =
  | 'ENTRADA_INVALIDA'
  | 'GRADE_DESCONHECIDA'
  | 'GRADE_PEQUENA_DEMAIS'
  | 'GRADE_INCOERENTE'
  | 'GRADE_GIRADA'
  | 'CELULA_FORA_DE_GRADE'
  | 'URL_INVALIDA'
  | 'FOTO_SEM_MEDIDA'
  | 'RECORTE_DEGENERADO'
  | 'RECORTE_NAO_REPRESENTAVEL'

export interface Diagnostico {
  codigo: CodigoDaGrade
  mensagem: string
  gradeId?: string
  camadaId?: string
}

/**
 * Ou o valor inteiro, ou só diagnóstico — nunca retorno parcial. Cada lado declara o campo do outro como ausente:
 * com `strict: false` o TypeScript não estreita a união por `ok`.
 */
export type Resultado<T> = { ok: true; valor: T; diagnosticos?: undefined } | { ok: false; diagnosticos: Diagnostico[]; valor?: undefined }

/** `metadata.grade` de cada célula: autocontido, sem lista de ids (sobrevive a colar/duplicar) */
export interface MetadadoDeGrade {
  id: string
  layout: string
  versao: number
  celula: number
  /** espaçamento EFETIVO (inteiro, já limitado) */
  espacamento: number
  /** raio pedido; o efetivo por célula fica em `style.border.radius` */
  raio: number
  caixa: Retangulo
}

/**
 * Hosts EXATOS aceitos como foto de célula. Ausente = `HOSTS_DO_BLOB_PROPRIO`; presente SUBSTITUI o padrão
 * (lista vazia não aceita nada). Nunca sufixo: sufixo prova hospedagem na Vercel, não que a loja é nossa.
 */
export interface OpcoesDeUrl {
  hostsProprios?: ReadonlyArray<string>
}

export const falhou = (diagnosticos: Diagnostico[]): { ok: false; diagnosticos: Diagnostico[]; valor?: undefined } => ({ ok: false, diagnosticos })
export const deu = <T>(valor: T): { ok: true; valor: T; diagnosticos?: undefined } => ({ ok: true, valor })
