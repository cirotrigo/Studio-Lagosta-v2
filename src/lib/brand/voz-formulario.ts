/**
 * O FORMULÁRIO da voz compacta (módulo PURO, sem Prisma — a aba Marca é
 * client). Converte a `VozCompacta` do contrato para o que a equipe edita e
 * de volta, SEM validar: quem valida é `lerVoz`, na gravação — o formulário
 * nunca inventa nem descarta nada, e devolve `unknown` para o contrato dizer
 * o que está errado.
 *
 * 🔴 Listas e reescritas são campos ESTRUTURADOS (um item por campo), nunca
 * texto serializado por delimitador (PR14-01 da revisão do Codex, 12/09/2026):
 * "uma reescrita por linha, `antes → depois — motivo`" partia um `depois`
 * que carregasse travessão, juntava exemplos com quebra interna e tirava um
 * marcador literal "- " no começo do item — campos que a pessoa NÃO editou
 * saíam mudados ao salvar, e a consulta seguinte do conector recebia conteúdo
 * corrompido. O valor de cada item viaja LITERAL; só o espaço das pontas sai.
 */
import { VERSAO_DA_VOZ, type EscopoDaRegra, type RegraDaVoz, type VozCompacta } from './voz'

export interface RegraNoFormulario {
  id: string
  texto: string
  motivo: string
  em: string
  escopo: EscopoDaRegra
  substitui?: string
  ativa: boolean
}

export interface ReescritaNoFormulario {
  antes: string
  depois: string
  motivo: string
}

export interface FormularioDaVoz {
  descricao: string
  tratamento: string
  /** Um item por campo, literal. */
  exemplos: string[]
  antesDepois: ReescritaNoFormulario[]
  termos: string[]
  proibicoes: string[]
  regras: RegraNoFormulario[]
}

export const FORMULARIO_VAZIO: FormularioDaVoz = { descricao: '', tratamento: '', exemplos: [], antesDepois: [], termos: [], proibicoes: [], regras: [] }

export const REESCRITA_VAZIA: ReescritaNoFormulario = { antes: '', depois: '', motivo: '' }

/** Só o espaço das pontas sai; o miolo (quebra, travessão, marcador) é conteúdo. Item vazio sai da lista. */
function itensLimpos(itens: string[]): string[] {
  return itens.map((i) => i.trim()).filter((i) => i.length > 0)
}

export function vozParaFormulario(voz: VozCompacta | null | undefined): FormularioDaVoz {
  if (!voz) return { ...FORMULARIO_VAZIO, exemplos: [], antesDepois: [], termos: [], proibicoes: [], regras: [] }
  return {
    descricao: voz.descricao ?? '',
    tratamento: voz.tratamento ?? '',
    exemplos: [...(voz.exemplos ?? [])],
    antesDepois: (voz.antesDepois ?? []).map((r) => ({ antes: r.antes ?? '', depois: r.depois ?? '', motivo: r.motivo ?? '' })),
    termos: [...(voz.termos ?? [])],
    proibicoes: [...(voz.proibicoes ?? [])],
    regras: (voz.regras ?? []).map((r) => ({ id: r.id, texto: r.texto, motivo: r.motivo, em: r.em, escopo: r.escopo ?? 'ambas', ...(r.substitui ? { substitui: r.substitui } : {}), ativa: r.ativa !== false })),
  }
}

/**
 * O objeto que vai para `lerVoz`/`gravarVoz`. Campo vazio vira AUSENTE (o
 * contrato tem `default([])`), nunca `""` — `tratamento` vazio sai; regra sem
 * `substitui` não carrega a chave. Reescrita totalmente em branco sai da
 * lista; reescrita pela metade FICA (o contrato recusa e a pessoa vê onde).
 */
export function formularioParaVoz(form: FormularioDaVoz): unknown {
  const regras = form.regras.map((r) => {
    const regra: Record<string, unknown> = { id: r.id.trim(), texto: r.texto.trim(), motivo: r.motivo.trim(), em: r.em.trim(), escopo: r.escopo, ativa: r.ativa }
    if (r.substitui) regra.substitui = r.substitui
    return regra
  })
  const antesDepois = form.antesDepois
    .map((r) => ({ antes: r.antes.trim(), depois: r.depois.trim(), motivo: r.motivo.trim() }))
    .filter((r) => r.antes || r.depois || r.motivo)
  return {
    versao: VERSAO_DA_VOZ,
    descricao: form.descricao.trim(),
    ...(form.tratamento.trim() ? { tratamento: form.tratamento.trim() } : {}),
    exemplos: itensLimpos(form.exemplos),
    antesDepois,
    termos: itensLimpos(form.termos),
    proibicoes: itensLimpos(form.proibicoes),
    regras,
  }
}

/** Uma regra nova em branco para a lista, datada de hoje (Brasília) e com id provisório único no formulário. */
export function regraEmBranco(regrasExistentes: RegraNoFormulario[], hoje: string): RegraNoFormulario {
  const base = `regra-${hoje}`
  let n = 1
  const ids = new Set(regrasExistentes.map((r) => r.id))
  while (ids.has(`${base}-${n}`)) n++
  return { id: `${base}-${n}`, texto: '', motivo: '', em: hoje, escopo: 'ambas', ativa: true }
}

/**
 * SUBSTITUIR uma regra pelo formulário: a antiga fica inativa (histórico) e a
 * nova nasce apontando para ela — a mesma semântica de `aplicarRegraNaVoz`,
 * só que sem o detector de conflito (a pessoa está decidindo à vista).
 */
export function substituirRegraNoFormulario(regras: RegraNoFormulario[], idAntiga: string, nova: Omit<RegraNoFormulario, 'id' | 'substitui' | 'ativa'>): RegraNoFormulario[] {
  const antiga = regras.find((r) => r.id === idAntiga)
  if (!antiga || !antiga.ativa) return regras
  const id = regraEmBranco(regras, nova.em).id
  return [...regras.map((r) => (r.id === idAntiga ? { ...r, ativa: false } : r)), { ...nova, id, substitui: idAntiga, ativa: true }]
}

/** A regra ATIVA que substitui esta (a cadeia pode ter mais de um elo: devolve a última ativa). */
export function substituidaPor(regras: RegraNoFormulario[], id: string): RegraNoFormulario | null {
  return regras.find((r) => r.substitui === id) ?? null
}

/**
 * Uma regra inativa só pode ser REATIVADA se nenhuma outra a substitui: com a
 * substituição no lugar, `problemasDeCoerenciaDaVoz` recusa a voz ("a
 * substituída continua ativa") e a tela oferecia uma operação que não podia
 * ser salva (PR14-03). Regra apenas DESATIVADA (sem substituta) volta.
 */
export function podeReativar(regras: RegraNoFormulario[], id: string): boolean {
  const regra = regras.find((r) => r.id === id)
  if (!regra || regra.ativa) return false
  return substituidaPor(regras, id) === null
}

export function reativarRegraNoFormulario(regras: RegraNoFormulario[], id: string): RegraNoFormulario[] {
  if (!podeReativar(regras, id)) return regras
  return regras.map((r) => (r.id === id ? { ...r, ativa: true } : r))
}

/** O mesmo formulário duas vezes é o mesmo conteúdo? (para o botão Salvar só acender quando há mudança) */
export function formulariosIguais(a: FormularioDaVoz, b: FormularioDaVoz): boolean {
  return JSON.stringify(formularioParaVoz(a)) === JSON.stringify(formularioParaVoz(b))
}

export type { RegraDaVoz }
