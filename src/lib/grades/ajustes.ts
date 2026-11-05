/**
 * G3 · ajustar a grade (puro: sem React, DOM, banco, rede ou env). Espaçamento, cantos, caixa e layout passam pelo
 * `refazerGrade` do G0 (medida por URL EXATA de cada foto, enquadramento pelo `cropForResizedBox`, recusa atômica);
 * mover é translação pura (mesmo tamanho ⇒ mesmo recorte, sem medir); desvincular tira `grade` e o `groupId` dela de
 * todos os membros. Nada de regra de geometria ou de recorte refeita aqui.
 *
 * O ALVO (grade + assinatura de todos os membros, a do G2) é decidido antes da medida e conferido de novo sobre o estado
 * atual (dentro do updater do editor): mudou qualquer membro ⇒ nada aplicado, a edição concorrente fica.
 */
import type { DesignData, Layer } from '@/types/template'
import { layoutDoCatalogo } from './catalogo'
import { celulaVazia, conferirGrade, metadadoDeGrade } from './conferir'
import { MIN_CELULA, celulasDaGrade } from './geometria'
import { refazerGrade, type MudancaDeGrade } from './operacoes'
import { assinaturaDaGrade, gradeDaSelecao, membrosDaGrade } from './preenchimento'
import type { CodigoDaGrade, Retangulo } from './tipos'

export type CodigoDoAjuste = CodigoDaGrade | 'SEM_GRADE' | 'ALVO_MUDOU' | 'CANCELADO' | 'EM_ANDAMENTO' | 'SEM_MUDANCA' | 'CELULA_TRAVADA'

export interface AlvoDoAjuste {
  gradeId: string
  assinatura: string
  /** URLs EXATAS das fotos da grade, sem repetição: cada uma precisa da medida natural dela */
  urls: string[]
  /** O editor prende aqui página, documento e geração da carga do instante do plano (este módulo não lê) */
  chave?: { pagina: string | null; documento: string; geracao: number }
}

export type PlanoDoAjuste = { tipo: 'grade'; alvo: AlvoDoAjuste } | { tipo: 'recusa'; codigo: CodigoDoAjuste; mensagem: string }

export type DesfechoDoAjuste =
  | { ok: true; layers: Layer[]; selecionar: string[]; aviso?: string; codigo?: undefined; mensagem?: undefined }
  | { ok: false; codigo: CodigoDoAjuste; mensagem: string; layers?: undefined; selecionar?: undefined; aviso?: undefined }

export const MENSAGEM_AJUSTE_FORA_DO_ALVO = 'A grade ou a página mudou enquanto as fotos eram medidas: nada foi aplicado e as suas edições ficaram.'
export const MENSAGEM_ALINHAR_GRADE = 'Alinhar e distribuir ainda não valem para grade: mova a grade inteira arrastando ou pelas setas.'

const POR_QUE: Partial<Record<CodigoDoAjuste, string>> = {
  FOTO_SEM_MEDIDA: 'não deu para medir todas as fotos da grade (espere elas carregarem e tente de novo)',
  RECORTE_NAO_REPRESENTAVEL: 'o enquadramento de uma foto não cabe no tamanho novo sem deformar (use "Remover" no recorte dela ou outro valor)',
  RECORTE_DEGENERADO: 'o recorte de uma foto não mostra área nenhuma (use "Remover" no recorte dela)',
  GRADE_PEQUENA_DEMAIS: `a grade ficaria pequena demais (cada célula precisa de pelo menos ${MIN_CELULA} px)`,
  GRADE_GIRADA: 'há célula girada nesta grade: desvincule da grade para editar as fotos soltas',
  GRADE_INCOERENTE: 'a grade está quebrada: desvincule da grade para editar as fotos soltas',
  GRADE_DESCONHECIDA: 'layout fora do catálogo',
  URL_INVALIDA: 'uma foto da grade não está no armazenamento do Studio',
  ENTRADA_INVALIDA: 'valor inválido',
}
const recusa = (codigo: CodigoDoAjuste, mensagem?: string): Extract<DesfechoDoAjuste, { ok: false }> => ({
  ok: false,
  codigo,
  mensagem: mensagem ?? `Nada mudou: ${POR_QUE[codigo] ?? 'a grade recusou o ajuste'}.`,
})

const idDaGrade = (l: Layer) => {
  const id = metadadoDeGrade(l)?.id
  return typeof id === 'string' && id ? id : undefined
}

/** Célula girada ou grade quebrada: nenhum ajuste (mover, refazer) é aplicado nela; desvincular continua possível */
function impedimento(membros: Layer[]) {
  const diag = conferirGrade(membros)
  if (diag.some((d) => d.codigo === 'GRADE_GIRADA')) return recusa('GRADE_GIRADA')
  return diag.length ? recusa('GRADE_INCOERENTE', `Nada mudou: a grade está quebrada (${diag[0].mensagem}). Desvincule da grade para editar as fotos soltas.`) : undefined
}

/** Alvo do ajuste da grade `gradeId`, decidido sobre o design DESTE instante (antes da medida das fotos) */
export function planoDoAjuste(design: DesignData, gradeId: string): PlanoDoAjuste {
  const membros = membrosDaGrade(design.layers, gradeId)
  if (membros.length === 0) return { tipo: 'recusa', codigo: 'SEM_GRADE', mensagem: 'Selecione uma grade para ajustar.' }
  const imp = impedimento(membros)
  if (imp) return { tipo: 'recusa', codigo: imp.codigo, mensagem: imp.mensagem }
  const urls = [...new Set(membros.filter((c) => !celulaVazia(c.fileUrl)).map((c) => c.fileUrl as string))]
  return { tipo: 'grade', alvo: { gradeId, assinatura: assinaturaDaGrade(design.layers, gradeId), urls } }
}

/**
 * Aplica `mudanca` (espaçamento, raio, caixa ou layout) na grade do `alvo` sobre ESTE design. Assinatura diferente da do
 * plano ⇒ ALVO_MUDOU. `dimensoes` por URL exata (o chamador confere com `dimensoesDaFotoCarregada`); foto sem medida,
 * recorte que não cabe ou caixa pequena demais ⇒ recusa inteira, com o motivo. Células ficam onde estavam na pilha; as
 * que o layout novo cria entram logo depois da última; células vazias que sobram saem; fotos que sobram ficam AVULSAS no
 * mesmo lugar, selecionadas, com aviso. `idsNovos`: ids para as células que o layout novo criar.
 */
export function ajustarGradeNoDesign(
  design: DesignData,
  alvo: AlvoDoAjuste,
  mudanca: MudancaDeGrade,
  dimensoes: ReadonlyMap<string, { width: number; height: number }>,
  idsNovos: string[],
): DesfechoDoAjuste {
  if (assinaturaDaGrade(design.layers, alvo.gradeId) !== alvo.assinatura) return recusa('ALVO_MUDOU', MENSAGEM_AJUSTE_FORA_DO_ALVO)
  const membros = membrosDaGrade(design.layers, alvo.gradeId)
  if (membros.length === 0) return recusa('ALVO_MUDOU', MENSAGEM_AJUSTE_FORA_DO_ALVO)
  const imp = impedimento(membros)
  if (imp) return imp
  const r = refazerGrade(membros, mudanca, dimensoes, { idsNovos })
  if (!r.ok) return recusa(r.diagnosticos[0]?.codigo ?? 'GRADE_INCOERENTE')

  const ids = new Set(membros.map((c) => c.id))
  const celulas = new Map(r.valor.celulas.map((c) => [c.id, c]))
  const avulsas = new Map(r.valor.avulsas.map((c) => [c.id, c]))
  const novas = r.valor.celulas.filter((c) => !ids.has(c.id))
  const ultima = design.layers.reduce((u, l, i) => (ids.has(l.id) ? i : u), -1)
  const layers: Layer[] = []
  design.layers.forEach((l, i) => {
    const nova = celulas.get(l.id) ?? avulsas.get(l.id)
    if (nova) layers.push(nova)
    else if (!ids.has(l.id)) layers.push(l)
    if (i === ultima) layers.push(...novas)
  })

  if (avulsas.size === 0 && assinaturaDaGrade(layers, alvo.gradeId) === alvo.assinatura) return recusa('SEM_MUDANCA', '')
  const diag = conferirGrade(membrosDaGrade(layers, alvo.gradeId))
  if (diag.length) return recusa('GRADE_INCOERENTE', `Nada mudou: a grade ficaria quebrada (${diag[0].mensagem}).`)
  const n = avulsas.size
  return {
    ok: true,
    layers,
    selecionar: n ? [...avulsas.keys()] : r.valor.celulas.map((c) => c.id),
    aviso: n ? `${n === 1 ? '1 foto não coube' : `${n} fotos não couberam`} no layout novo e ${n === 1 ? 'ficou solta, selecionada' : 'ficaram soltas, selecionadas'}.` : undefined,
  }
}

/**
 * Move `ids` por (dx, dy): toda grade que a seleção toca anda INTEIRA (caixa + todas as células, geometria refeita pela
 * caixa nova, tamanho e recorte intactos, sem medir); as outras camadas da lista andam como no `moveLayer` (posição
 * arredondada). Grade com célula travada, girada ou quebrada ⇒ recusa inteira com motivo. Entrada não mutada.
 */
export function moverNoDesign(design: DesignData, ids: readonly string[], dx: number, dy: number): DesfechoDoAjuste {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return recusa('ENTRADA_INVALIDA')
  if (dx === 0 && dy === 0) return recusa('SEM_MUDANCA', '')
  const sel = new Set(ids)
  const grades = new Set(design.layers.filter((l) => sel.has(l.id)).map(idDaGrade).filter((g): g is string => !!g))
  const novas = new Map<string, Layer>()
  for (const gradeId of grades) {
    const membros = membrosDaGrade(design.layers, gradeId)
    if (membros.some((c) => c.locked)) return recusa('CELULA_TRAVADA', 'Nada mudou: a grade tem célula travada (destrave para mover a grade).')
    const imp = impedimento(membros)
    if (imp) return imp
    const meta = metadadoDeGrade(membros[0])!
    const caixa: Retangulo = { x: meta.caixa.x + dx, y: meta.caixa.y + dy, w: meta.caixa.w, h: meta.caixa.h }
    const geo = celulasDaGrade(layoutDoCatalogo(meta.layout, meta.versao)!, caixa, meta.espacamento)
    if (!geo.ok) return recusa(geo.diagnosticos[0].codigo)
    for (const c of membros) {
      const m = metadadoDeGrade(c)!
      const alvo = geo.valor.celulas[m.celula]
      novas.set(c.id, { ...c, position: { x: alvo.x, y: alvo.y }, metadata: { ...c.metadata, grade: { ...m, caixa: { ...caixa } } } })
    }
  }
  const layers = design.layers.map(
    (l) =>
      novas.get(l.id) ??
      (sel.has(l.id) ? { ...l, position: { x: Math.round((l.position?.x ?? 0) + dx), y: Math.round((l.position?.y ?? 0) + dy) } } : l),
  )
  for (const gradeId of grades) {
    const diag = conferirGrade(membrosDaGrade(layers, gradeId))
    if (diag.length) return recusa('GRADE_INCOERENTE', `Nada mudou: a grade ficaria quebrada (${diag[0].mensagem}).`)
  }
  return { ok: true, layers, selecionar: [...ids] }
}

/**
 * "Desvincular da grade": `grade` sai de todos os membros e o `groupId` igual ao id da grade sai de todas as camadas
 * (grupo alheio fica). Foto, recorte, cantos, cover, posição e tamanho intactos; células vazias ficam (nada é apagado).
 * Vale também para grade girada ou quebrada — é a saída delas.
 */
export function desvincularNoDesign(design: DesignData, gradeId: string): DesfechoDoAjuste {
  const membros = membrosDaGrade(design.layers, gradeId)
  if (membros.length === 0) return recusa('SEM_GRADE', 'Selecione uma grade para desvincular.')
  const layers = design.layers.map((l) => {
    const membro = idDaGrade(l) === gradeId
    const doGrupo = l.metadata?.groupId === gradeId
    if (!membro && !doGrupo) return l
    const metadata = { ...l.metadata }
    if (membro) delete metadata.grade
    if (doGrupo) delete metadata.groupId
    return { ...l, metadata }
  })
  return { ok: true, layers, selecionar: membros.map((c) => c.id) }
}

/**
 * O que a seleção é para a grade: nenhuma célula; UMA grade inteira e nada mais (inclusive a de 1 célula); ou parcial
 * (célula, subconjunto ou mistura com outras camadas/grades). A grade inteira ganha barra e alças; a parcial, nada.
 */
export function modoDaSelecao(layers: readonly Layer[], ids: readonly string[]): { modo: 'nenhuma' | 'inteira' | 'parcial'; gradeId?: string } {
  if (!selecaoTocaGrade(layers, ids)) return { modo: 'nenhuma' }
  const sel = gradeDaSelecao(layers, ids)
  if (sel && (!sel.celulaId || membrosDaGrade(layers, sel.gradeId).length === 1)) return { modo: 'inteira', gradeId: sel.gradeId }
  return { modo: 'parcial', gradeId: sel?.gradeId }
}

export const selecaoTocaGrade = (layers: readonly Layer[], ids: readonly string[]) => layers.some((l) => ids.includes(l.id) && !!idDaGrade(l))

/** Quem anda junto no arraste: a seleção mais as grades INTEIRAS que ela toca, na ordem da pilha */
export function participantesDoArraste(layers: readonly Layer[], ids: readonly string[]): string[] {
  const grades = new Set(layers.filter((l) => ids.includes(l.id)).map(idDaGrade).filter(Boolean))
  return layers.filter((l) => ids.includes(l.id) || grades.has(idDaGrade(l))).map((l) => l.id)
}

/**
 * Caixa nova da grade depois do gesto do Transformer: todos os nós sofreram a MESMA transformação afim (escala +
 * translação, sem rotação), e a caixa sofre a mesma: origem = nó − escala × (onde o nó estava − origem da caixa), tamanho
 * = caixa × escala. `antes` é a posição do nó no estado. Nas grades que preenchem a caixa o nó mais à esquerda/acima
 * está colado nela (desconto 0, igual a antes do Q2); nas quadradas a margem entre caixa e nós escala junto. Sem
 * `antes`, desconto 0. Arredondada em px.
 */
export function caixaPeloTransformer(
  caixa: Retangulo,
  nos: ReadonlyArray<{ x: number; y: number; scaleX: number; scaleY: number; antes?: { x: number; y: number } }>,
): Retangulo | undefined {
  if (nos.length === 0) return undefined
  const { scaleX, scaleY } = nos[0]
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return undefined
  const origem = (eixo: 'x' | 'y', escala: number) => {
    const n = nos.reduce((m, k) => (k[eixo] < m[eixo] ? k : m))
    return n[eixo] - escala * ((n.antes?.[eixo] ?? caixa[eixo]) - caixa[eixo])
  }
  return { x: Math.round(origem('x', scaleX)), y: Math.round(origem('y', scaleY)), w: Math.round(caixa.w * scaleX), h: Math.round(caixa.h * scaleY) }
}

/** Piso do lado do nó no editor: célula de grade respeita o mínimo do G0 (8 px); o resto, os 20 px de sempre */
export const ladoMinimoNoEditor = (layer: Layer) => (metadadoDeGrade(layer) ? MIN_CELULA : 20)

/** Geometria de célula vinculada nunca é gravada pelo nó sozinho (transform/arraste): quem grava é a operação da grade */
export const celulaVinculada = (layer: Layer) => metadadoDeGrade(layer) !== undefined
