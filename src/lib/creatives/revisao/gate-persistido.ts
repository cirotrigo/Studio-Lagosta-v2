/**
 * CP5b § 3.3 — a ESCRITA do registro do gate: só por merge no banco (`mesclarFieldValuesDaArte`, regra 🔴 do
 * `AGENTS.md`), a chave `gateDaArte` inteira de uma vez, e só se a Generation for desta página e deste projeto e a
 * página for do projeto (`somenteSe`: vínculo + `EXISTS` por `Template.projectId`). Nunca
 * `update({ fieldValues: { ...lido } })`.
 *
 * Proveniência (Codex R13/R14): só um registro que SAIU de `decidirEMontarRegistro` — selado, congelado em
 * profundidade e no `WeakSet` do módulo — chega ao banco; um objeto coerente na forma mas montado à mão ou clonado
 * é `'sem-proveniencia'`. Exceção do banco PROPAGA: quem chama (CP5c, dentro da transação) decide o rollback.
 * Idempotente: gravar o mesmo registro duas vezes é o mesmo estado. Não dispara `invalidateScheduledRenders` nem
 * `pedirRecomposicaoDaArteCongelada` (`fieldValues` não é `Page.layers`).
 *
 * Importa `mesclar-field-values` (que importa `@/lib/db`): a lógica mora em `gate-registro.ts`; este módulo só
 * confere a proveniência, compõe o patch e chama o merge.
 */
import { mesclarFieldValuesDaArte, type ClienteDoBanco } from '@/lib/creatives/mesclar-field-values'
import { CHAVE_DO_GATE, congeladoEmProfundidade, foiSeladoPorDecidir, type RegistroSelado } from './gate-registro'

export type ResultadoDaGravacao = 'gravado' | 'sem-vinculo' | 'sem-proveniencia'

export async function gravarGateDaArte(client: ClienteDoBanco, registro: RegistroSelado): Promise<ResultadoDaGravacao> {
  if (!foiSeladoPorDecidir(registro) || !congeladoEmProfundidade(registro)) {
    console.warn('[gate] registro não gravado: não saiu de decidirEMontarRegistro (sem proveniência)')
    return 'sem-proveniencia'
  }
  const { projectId, generationId, pageId } = registro.identidade
  const linhas = await mesclarFieldValuesDaArte(client, generationId, { [CHAVE_DO_GATE]: registro }, { somenteSe: { projectId, pageId } })
  if (linhas === 0) {
    console.warn(`[gate] registro não gravado: a Generation ${generationId} não é da página ${pageId} do projeto ${projectId} (ou a página não é do projeto)`)
    return 'sem-vinculo'
  }
  return 'gravado'
}
