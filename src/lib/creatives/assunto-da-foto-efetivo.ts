/**
 * O ASSUNTO EFETIVO de uma foto (F2b, 02/11/2026): o resolvedor único entre a caixa da VISÃO, que mora no JSON do
 * catálogo, e a decisão HUMANA, que mora na tabela `PhotoAssunto` (a tool `marcar-assunto`). A composição, a seleção, a
 * aprovação da referência e o acervo leem por aqui, nunca `lerCaixaDoAssunto(entrada.assunto)`: `assunto` é TEXTO.
 *
 * Módulo PURO: quem lê os dois insumos é `assuntosEfetivosDoProjeto` (`acervo.ts`).
 */
import { lerCaixaDoAssunto, type AssuntoNormalizado, type FonteDaFoto } from '@/lib/compositor/assunto-da-foto'
import { CreativeError } from '@/lib/creatives/errors'

export interface AssuntoEfetivo {
  caixa: AssuntoNormalizado | null
  origem: 'humano' | 'visao' | 'nenhuma'
  estado: 'localizada' | 'sem-assunto' | 'nao-analisada' | 'fonte-nao-coerente'
  /** Só em `fonte-nao-coerente`: por que a caixa não vale sobre a imagem desenhada (`fonteDaFoto`). */
  motivo?: FonteDaFoto['motivo']
}

/** Foto sem entrada, sem análise da caixa e sem decisão humana: segue pelo estimado. */
export const ASSUNTO_NAO_ANALISADO: AssuntoEfetivo = { caixa: null, origem: 'nenhuma', estado: 'nao-analisada' }

export interface DecisaoHumanaDoAssunto {
  decisao: string
  caixa: unknown
  revogadoEm?: Date | null
}

export function assuntoEfetivoDaFoto(
  entrada: { caixaDoAssunto?: unknown; caixaAnalisadaEm?: string } | null | undefined,
  humana: DecisaoHumanaDoAssunto | null | undefined,
): AssuntoEfetivo {
  if (humana && !humana.revogadoEm) {
    if (humana.decisao === 'sem-assunto') return { caixa: null, origem: 'humano', estado: 'sem-assunto' }
    const caixa = lerCaixaDoAssunto(humana.caixa)
    if (caixa) return { caixa, origem: 'humano', estado: 'localizada' }
  }
  if (entrada?.caixaDoAssunto === null && entrada.caixaAnalisadaEm) return { caixa: null, origem: 'visao', estado: 'sem-assunto' }
  const caixa = lerCaixaDoAssunto(entrada?.caixaDoAssunto)
  return caixa ? { caixa, origem: 'visao', estado: 'localizada' } : ASSUNTO_NAO_ANALISADO
}

/** Quem lê a caixa perdida num aviso precisa saber de onde ela veio: a correção é `marcar-assunto`, não a copy. */
export function descreverCaixaDoAssunto(efetivo: AssuntoEfetivo): string {
  return `A caixa do assunto desta foto veio ${efetivo.origem === 'humano' ? 'de uma decisão humana' : 'da visão'} (origem ${efetivo.origem}, estado ${efetivo.estado}): se ela estiver errada, a correção é \`marcar-assunto\`, não a copy.`
}

/**
 * A semântica de falha da leitura, a mesma na composição e na seleção. `SEM_CATALOGO` não chega aqui (é "sem anotação",
 * `assuntosEfetivosDoProjeto` a trata). Qualquer outro erro é o catálogo INDISPONÍVEL: sem arquétipo, segue sem a caixa,
 * como sempre; com arquétipo (`exigir`), a região protegida é hard constraint e a posição não é escolhida — nem
 * reproduzida — sem ela (CP2B, Codex R2): recusa transitória, a fila tenta de novo.
 */
export async function assuntosOuRecusa(ler: () => Promise<Map<string, AssuntoEfetivo>>, ids: string[], exigir: boolean): Promise<Map<string, AssuntoEfetivo>> {
  try {
    return await ler()
  } catch (erro) {
    if (!exigir) return new Map(ids.map((id) => [id, ASSUNTO_NAO_ANALISADO]))
    throw new CreativeError(
      'CATALOGO_INDISPONIVEL',
      'Não deu para ler o catálogo de fotos do projeto agora. Com arquétipo, a região protegida da foto (o que o catálogo marcou) é obrigatória: a posição não é escolhida sem ela. Tente de novo em instantes.',
      503,
      { ids, causa: erro instanceof Error ? erro.message : String(erro) },
    )
  }
}
