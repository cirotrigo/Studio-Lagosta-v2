/**
 * CANDIDATOS DE ARQUÉTIPO (CP-T6 preflight, 24/10/2026) — contrato PURO e local: para uma spec, quais arquétipos do
 * catálogo passam nas guardas que já existem e por que os outros não passam. Não escolhe, não ordena por estilo, não
 * persiste e não está ligado a fluxo nenhum: a escolha autônoma (diretor/Dot) e o lugar onde guardá-la (`ItemDePlano`)
 * continuam pendentes de decisão e de migração.
 *
 * "Compatível" aqui é ESTRUTURAL — resolução, disponibilidade, formato, foto, preferências, papéis, logo e linhas
 * máximas. Medida, geometria HARD e contraste só se sabem no medir-copy / compor: compatível NÃO é peça APTA.
 *
 * Pedido explícito (`spec.arquetipo`) é preservado: avalia-se só ele, com versão e impressão, e uma recusa dele NÃO
 * cai em outro candidato.
 *
 * ENTRADA: a spec JÁ normalizada por `validarSpec` (`spec.ts`), com `blocos`/`camadasExtras` derivados — como fazem
 * `fila.ts` e `compor.ts` antes de `prepararArquetipo`. O pedido público bruto que traz só `copyAutoral` não tem
 * `blocos` e daria falsa incompatibilidade (papel obrigatório ausente). Quem ligar isto no futuro normaliza antes.
 */
import { CreativeError } from '@/lib/creatives/errors'
import { listarArquetipos } from './catalogo'
import { conferirLinhas, conferirLogo, prepararArquetipo, type SpecComArquetipo } from './na-spec'

export interface RecusaDoCandidato {
  codigo: string
  mensagem: string
  detalhes?: Record<string, unknown>
}

export interface CandidatoDeArquetipo {
  id: string
  /** `null` quando o pedido não trouxe versão explícita e a avaliação recusou (a recusa pode ter vindo antes ou depois de resolver). */
  versao: number | null
  /** Passou em TODAS as guardas estruturais. Não é APTO: a medida e o contraste vêm depois. */
  compativel: boolean
  recusa?: RecusaDoCandidato
}

export interface CandidatosDeArquetipo {
  /** `explicito`: a spec já pediu um arquétipo e só ele foi avaliado. `catalogo`: a mais recente de cada id publicado. */
  origem: 'explicito' | 'catalogo'
  /** Na ordem do catálogo — NÃO é ranking. */
  candidatos: CandidatoDeArquetipo[]
}

function avaliar(spec: SpecComArquetipo, pedido: { id: string; versao?: number; impressao?: string }, temLogo: boolean): CandidatoDeArquetipo {
  try {
    const arq = prepararArquetipo({ ...spec, arquetipo: pedido })!
    conferirLogo(arq.definicao, temLogo)
    conferirLinhas(arq.definicao, arq.formato, spec)
    const { id, versao } = arq.resolvido
    return { id, versao, compativel: true }
  } catch (e) {
    if (!(e instanceof CreativeError)) throw e
    // Só a versão que o pedido trouxe: o erro não carrega a resolvida, e a recusa pode ter vindo antes ou depois dela.
    return { id: pedido.id, versao: pedido.versao ?? null, compativel: false, recusa: { codigo: e.code, mensagem: e.message, ...(e.details ? { detalhes: e.details } : {}) } }
  }
}

export function candidatosDeArquetipo(spec: SpecComArquetipo, opcoes: { temLogo: boolean }): CandidatosDeArquetipo {
  if (spec.arquetipo) {
    return { origem: 'explicito', candidatos: [avaliar(spec, spec.arquetipo as { id: string }, opcoes.temLogo)] }
  }
  // A mais recente de cada id: o pedido público sem versão resolve assim (`resolverArquetipo`).
  const ids = [...new Set(listarArquetipos().map((a) => a.id))]
  return { origem: 'catalogo', candidatos: ids.map((id) => avaliar(spec, { id }, opcoes.temLogo)) }
}
