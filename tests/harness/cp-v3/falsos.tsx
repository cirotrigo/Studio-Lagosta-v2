/**
 * Falsos do harness do CP-V3: SÓ a rede da marca e a página multipágina. O spec redireciona para cá
 * `@/hooks/use-brand-colors`, `@/hooks/use-project` e `@/contexts/multi-page-context`. O `TemplateEditorProvider`, o
 * `ShapeControls`, o `BrandColorSwatches`, o `estadoDaInsercao` e o `cores-da-forma` são os REAIS.
 *
 * - A marca de cada projeto mora em `window.__cp3.marca[projectId]`: `modo` da paleta (`ok`, `erro`, `html`, `sem-hex`,
 *   `pendente`) e do projeto (`ok`, `erro`, `sem-assinatura`, `pendente`). `html` e `sem-hex` viram ERRO na consulta
 *   estrita, como o `buscarPaletaEstrita` real; na não estrita (`useBrandColors`), `html` vira `[]`, como o real.
 * - A releitura (`refetch`) resolve na hora ou fica presa até `soltarReleituras()`, e devolve o estado do momento em
 *   que é SOLTA (com o dado anterior preservado no erro, como o TanStack). Conta as chamadas.
 */
import * as React from 'react'

type ModoPaleta = 'ok' | 'erro' | 'html' | 'sem-hex' | 'pendente'
type ModoProjeto = 'ok' | 'erro' | 'sem-assinatura' | 'pendente'
interface MarcaFalsa {
  paleta: { modo: ModoPaleta; cores: Array<{ id: number; name: string; hexCode: string; projectId: number }> }
  projeto: { modo: ModoProjeto; assinatura: unknown }
}
interface Consulta {
  status: 'pending' | 'error' | 'success'
  data: unknown
}
export interface EstadoFalso {
  marca: Record<number, MarcaFalsa>
  prender: boolean
  releituras: number
  /** releituras por consulta: `paleta` e `projeto` */
  releiturasPor: Record<'paleta' | 'projeto', number>
  pagina: { modo: 'multi'; currentPageId: string } | null
  soltar: Array<() => void>
}

declare global {
  interface Window {
    __falsos: EstadoFalso
  }
}

const ouvintes = new Set<() => void>()
let versao = 0
export function avisar() {
  versao += 1
  for (const o of ouvintes) o()
}
const assinar = (o: () => void) => {
  ouvintes.add(o)
  return () => ouvintes.delete(o)
}
function useVersao() {
  return React.useSyncExternalStore(assinar, () => versao)
}

/** O último resultado de cada consulta (o `data` sobrevive a uma falha, como no TanStack). */
const ultimos = new Map<string, Consulta>()
function resolver(chave: string, calcular: () => Consulta): Consulta {
  const agora = calcular()
  const anterior = ultimos.get(chave)
  const r = agora.status === 'error' ? { status: 'error' as const, data: anterior?.data } : agora
  ultimos.set(chave, r)
  return r
}

function paletaEstrita(projectId: number): Consulta {
  const m = window.__falsos.marca[projectId]?.paleta
  if (!m || m.modo === 'pendente') return { status: 'pending', data: undefined }
  if (m.modo !== 'ok') return { status: 'error', data: undefined }
  return { status: 'success', data: { projectId, cores: m.cores } }
}
function projeto(projectId: number): Consulta {
  const m = window.__falsos.marca[projectId]?.projeto
  if (!m || m.modo === 'pendente') return { status: 'pending', data: undefined }
  if (m.modo === 'erro') return { status: 'error', data: undefined }
  return { status: 'success', data: m.modo === 'sem-assinatura' ? { id: projectId } : { id: projectId, assinatura: m.assinatura } }
}

function releitura(chave: string, calcular: () => Consulta): Promise<Consulta> {
  window.__falsos.releituras += 1
  window.__falsos.releiturasPor[chave.startsWith('paleta') ? 'paleta' : 'projeto'] += 1
  return new Promise((ok) => {
    const soltar = () => {
      const r = resolver(chave, calcular)
      avisar()
      ok(r)
    }
    if (window.__falsos.prender) window.__falsos.soltar.push(soltar)
    else queueMicrotask(soltar)
  })
}

export function useBrandColorsEstrita(projectId: number) {
  useVersao()
  const chave = `paleta:${projectId}`
  const atual = ultimos.get(chave) ?? resolver(chave, () => paletaEstrita(projectId))
  return { ...atual, refetch: () => releitura(chave, () => paletaEstrita(projectId)) }
}
/** A não estrita, como a real: HTML 200 e não-lista viram `[]` em sucesso (só o M4 a usa na forma). */
export function useBrandColors(projectId: number | null | undefined) {
  useVersao()
  if (typeof projectId !== 'number' || projectId <= 0) return { status: 'pending', data: undefined, refetch: async () => ({}) }
  const m = window.__falsos.marca[projectId]?.paleta
  if (!m || m.modo === 'pendente') return { status: 'pending', data: undefined, refetch: async () => ({}) }
  if (m.modo === 'erro') return { status: 'error', data: undefined, refetch: async () => ({}) }
  return { status: 'success', data: m.modo === 'html' ? [] : m.cores, refetch: async () => ({}) }
}
export function useProject(projectId: number | null) {
  useVersao()
  const id = projectId ?? 0
  const chave = `projeto:${id}`
  const atual = ultimos.get(chave) ?? resolver(chave, () => projeto(id))
  return { ...atual, refetch: () => releitura(chave, () => projeto(id)) }
}
/** Recalcula o que a tela mostra (sem contar como releitura): o "dado chegou" de uma consulta montada. */
export function recarregarTela() {
  for (const chave of [...ultimos.keys()]) {
    const [tipo, id] = chave.split(':')
    resolver(chave, () => (tipo === 'paleta' ? paletaEstrita(Number(id)) : projeto(Number(id))))
  }
  avisar()
}
export function zerarConsultas() {
  ultimos.clear()
}
export const useProjectLogo = () => ({ data: undefined })
export const useProjects = () => ({ data: [] })
export const useUpdateProjectSettings = () => ({ mutate: () => {}, mutateAsync: async () => {} })

export function useMultiPageOpcional() {
  useVersao()
  const p = window.__falsos?.pagina
  return React.useMemo(() => (p ? { currentPageId: p.currentPageId, currentPage: null } : null), [p?.currentPageId])
}
export function useMultiPage() {
  return useMultiPageOpcional() as never
}
export function MultiPageProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
