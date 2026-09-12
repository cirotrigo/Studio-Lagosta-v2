/**
 * O FORMULÁRIO da voz compacta (módulo PURO, sem Prisma — a aba Marca é
 * client). Converte a `VozCompacta` do contrato para campos de texto que a
 * equipe edita (uma linha por item) e de volta, SEM validar: quem valida é
 * `lerVoz`, na gravação — o formulário nunca inventa nem descarta nada, e
 * devolve `unknown` para o contrato dizer o que está errado.
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

export interface FormularioDaVoz {
  descricao: string
  tratamento: string
  /** Uma frase por linha. */
  exemplos: string
  /** Uma reescrita por linha: `antes → depois — motivo`. */
  antesDepois: string
  /** Um termo por linha. */
  termos: string
  /** Uma proibição por linha. */
  proibicoes: string
  regras: RegraNoFormulario[]
}

export const FORMULARIO_VAZIO: FormularioDaVoz = { descricao: '', tratamento: '', exemplos: '', antesDepois: '', termos: '', proibicoes: '', regras: [] }

const SETA = /\s*(?:→|->|=>)\s*/
const TRACO = /\s+(?:—|–|--)\s+/

export function linhasParaLista(texto: string): string[] {
  return texto
    .split('\n')
    .map((l) => l.replace(/^\s*[-*•]\s+/, '').trim())
    .filter((l) => l.length > 0)
}

export function listaParaLinhas(itens: string[]): string {
  return itens.join('\n')
}

/** `antes → depois — motivo`; sem o motivo, o traço fica de fora. Linha sem seta volta como `antes` só (o contrato recusa, e a pessoa vê). */
export function antesDepoisParaLinhas(itens: Array<{ antes?: string; depois?: string; motivo?: string }>): string {
  return itens.map((r) => `${r.antes ?? ''} → ${r.depois ?? ''}${r.motivo ? ` — ${r.motivo}` : ''}`).join('\n')
}

export function linhasParaAntesDepois(texto: string): Array<{ antes: string; depois: string; motivo: string }> {
  return linhasParaLista(texto).map((linha) => {
    const [antes, resto = ''] = linha.split(SETA, 2)
    const [depois, motivo = ''] = resto.split(TRACO, 2)
    return { antes: antes.trim(), depois: depois.trim(), motivo: motivo.trim() }
  })
}

export function vozParaFormulario(voz: VozCompacta | null | undefined): FormularioDaVoz {
  if (!voz) return { ...FORMULARIO_VAZIO, regras: [] }
  return {
    descricao: voz.descricao ?? '',
    tratamento: voz.tratamento ?? '',
    exemplos: listaParaLinhas(voz.exemplos ?? []),
    antesDepois: antesDepoisParaLinhas(voz.antesDepois ?? []),
    termos: listaParaLinhas(voz.termos ?? []),
    proibicoes: listaParaLinhas(voz.proibicoes ?? []),
    regras: (voz.regras ?? []).map((r) => ({ id: r.id, texto: r.texto, motivo: r.motivo, em: r.em, escopo: r.escopo ?? 'ambas', ...(r.substitui ? { substitui: r.substitui } : {}), ativa: r.ativa !== false })),
  }
}

/**
 * O objeto que vai para `lerVoz`/`gravarVoz`. Campo vazio vira AUSENTE (o
 * contrato tem `default([])`), nunca `""` — `tratamento` vazio sai; regra sem
 * `substitui` não carrega a chave.
 */
export function formularioParaVoz(form: FormularioDaVoz): unknown {
  const regras = form.regras.map((r) => {
    const regra: Record<string, unknown> = { id: r.id.trim(), texto: r.texto.trim(), motivo: r.motivo.trim(), em: r.em.trim(), escopo: r.escopo, ativa: r.ativa }
    if (r.substitui) regra.substitui = r.substitui
    return regra
  })
  return {
    versao: VERSAO_DA_VOZ,
    descricao: form.descricao.trim(),
    ...(form.tratamento.trim() ? { tratamento: form.tratamento.trim() } : {}),
    exemplos: linhasParaLista(form.exemplos),
    antesDepois: linhasParaAntesDepois(form.antesDepois),
    termos: linhasParaLista(form.termos),
    proibicoes: linhasParaLista(form.proibicoes),
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

/** O mesmo formulário duas vezes é o mesmo conteúdo? (para o botão Salvar só acender quando há mudança) */
export function formulariosIguais(a: FormularioDaVoz, b: FormularioDaVoz): boolean {
  return JSON.stringify(formularioParaVoz(a)) === JSON.stringify(formularioParaVoz(b))
}

export type { RegraDaVoz }
