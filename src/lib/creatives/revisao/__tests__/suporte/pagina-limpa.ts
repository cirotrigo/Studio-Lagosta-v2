/**
 * CP5b — uma PÁGINA real para a decisão autônoma nos testes: camadas = a peça limpa do gate (com o papel do serviço
 * declarado), copy que reconcilia como `sem-mudanca`, formato story pelos dois classificadores. Sem `expect`.
 */
import type { Layer } from '@/types/template'
import type { EntradaDoGate } from '../../gate'
import { POLITICA_DO_ASSUNTO_DO_GATE } from '@/lib/lotes/agendamento'
import { decidirEMontarRegistro } from '../../gate-registro'
import { identidadeDaPagina } from '../../versao'
import { medida, pecaLimpa } from './corpus-do-gate'

export const COPY_DA_PECA_LIMPA = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  revisoes: [],
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Texto headline'] },
    { id: 'apoio', funcao: 'apoio', ordem: 1, linhas: ['Texto apoio'] },
    { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Texto servico'] },
  ],
}
export const camadasDaPaginaLimpa = (): Layer[] => pecaLimpa().camadas.map((l) => (l.id === 'servico' ? ({ ...l, metadata: { compositor: { papel: 'servico' } } } as Layer) : l))
export const PAGINA_LIMPA = { id: 'pg-1', name: 'Qua 14/10 · 10:00 · story', tags: ['story'], width: 1080, height: 1920, background: '#000000', layers: camadasDaPaginaLimpa() as unknown, copyAutoral: COPY_DA_PECA_LIMPA as unknown }
export type PaginaDeTeste = typeof PAGINA_LIMPA
export const VINCULO = { projectId: 8, generationId: 'gen-1', postType: 'STORY' as const }
export const AGORA = () => new Date('2026-10-16T03:00:00.000Z')

export function entradaDa(page: PaginaDeTeste, parcial: Partial<EntradaDoGate['medida']> = {}): Omit<EntradaDoGate, 'copy'> {
  const id = identidadeDaPagina(page)
  const camadas = Array.isArray(page.layers) ? (page.layers as Layer[]) : camadasDaPaginaLimpa()
  return { medida: medida({ camadas, ...parcial }), identidade: { pageVersion: id.pageVersion, copyVersion: id.copyVersion }, politicaDoAssunto: POLITICA_DO_ASSUNTO_DO_GATE } // a política EFETIVA: é com ela que os leitores (gate-resumo, ver-geracao, auditar) comparam
}

/** Decide e exige `ok` — lança (não é asserção) quando o vínculo falha. */
export function decidirOk(page: PaginaDeTeste = PAGINA_LIMPA, extra: Partial<Parameters<typeof decidirEMontarRegistro>[0]> = {}) {
  const r = decidirEMontarRegistro({ entrada: entradaDa(page), page, vinculo: VINCULO, origem: 'piloto', agora: AGORA, ...extra })
  if (r.decisao !== 'ok') throw new Error(`esperava ok, veio sem-vinculo: ${r.motivo}`)
  return r
}
