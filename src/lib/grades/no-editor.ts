/**
 * G4.3 · as operações GENÉRICAS do editor diante da grade (§4 do plano). Puro: sem React, DOM, banco ou rede. O
 * contexto chama estas funções dentro dos seus `applyDesign` — um gesto, um desfazer — e a foto avulsa segue pelo
 * caminho de sempre (estas funções devolvem `undefined` para ela, e o chamador faz o que fazia).
 *
 * - excluir (em lote, uma operação): grade INTEIRA entre os ids sai inteira; célula sem as irmãs é ESVAZIADA (a
 *   geometria não fura); o resto sai como sempre;
 * - copiar/colar/duplicar: grade inteira vira grade NOVA (ids, `grade.id`/`groupId` novos, um deslocamento só, caixa
 *   junto); célula solta vira foto avulsa (sem `grade` e sem o `groupId` da grade) — nunca grade fantasma;
 * - agrupar com célula: recusado (a grade já é a unidade); desagrupar a grade = desvincular (G3), de todos os membros;
 * - edição genérica de UMA camada (`updateLayer` e o que passa por ele: propriedades, painéis, gerador de criativo):
 *   geometria, cantos, ajuste, máscara e vínculo da célula não mudam; foto nova entra por `preencherCelula`.
 */
import type { DesignData, Layer } from '@/types/template'
import { layoutDoCatalogo } from './catalogo'
import { celulaVazia, conferirGrade, metadadoDeGrade } from './conferir'
import { desvincularNoDesign } from './ajustes'
import { preencherCelula } from './operacoes'
import { membrosDaGrade } from './preenchimento'
import { vinculadaAGrade } from './presenca'

export const MENSAGEM_AGRUPAR_GRADE = 'Grade de fotos não entra em grupo: ela já se move inteira. Para agrupar uma foto, desvincule-a da grade antes.'
export const MENSAGEM_CELULA_PROTEGIDA =
  'Célula de grade: posição, tamanho, cantos e ajuste da foto mudam pela barra da grade (ou desvincule a célula da grade).'

const idDaGrade = (l: Layer) => {
  const id = metadadoDeGrade(l)?.id
  return typeof id === 'string' && id ? id : undefined
}
export { vinculadaAGrade }

/**
 * Excluir os `ids` (a seleção, ou a camada da lixeira da linha) num resultado só — o editor aplica num `applyDesign`,
 * um desfazer. Grade com TODAS as células entre os ids sai inteira; célula sem as irmãs é esvaziada (`fileUrl ''`,
 * sem recorte); o resto (foto avulsa, texto…) sai como sempre. `null` = nada muda (só células já vazias ou ids que
 * não existem). `celulaSoEsvazia` (a lixeira de UMA linha): célula nunca sai, nem a única de uma grade `1-celula` —
 * a intenção é limpar a foto.
 */
export function removerNoDesign(
  design: DesignData,
  ids: readonly string[],
  opcoes: { celulaSoEsvazia?: boolean } = {},
): { layers: Layer[]; removidas: string[] } | null {
  const pedidos = new Set(ids)
  const inteiras = new Set<string>()
  const removidas = new Set<string>()
  const esvaziar = new Set<string>()
  for (const camada of design.layers) {
    if (!pedidos.has(camada.id)) continue
    const gradeId = idDaGrade(camada)
    if (!gradeId) removidas.add(camada.id)
    else if (!opcoes.celulaSoEsvazia && (inteiras.has(gradeId) || membrosDaGrade(design.layers, gradeId).every((c) => pedidos.has(c.id)))) {
      inteiras.add(gradeId)
      removidas.add(camada.id)
    } else if (!celulaVazia(camada.fileUrl)) esvaziar.add(camada.id)
  }
  if (removidas.size === 0 && esvaziar.size === 0) return null
  const layers = design.layers
    .filter((l) => !removidas.has(l.id))
    .map((l) => {
      if (!esvaziar.has(l.id)) return l
      const style = { ...l.style }
      delete style.crop
      return { ...l, fileUrl: '', style }
    })
  return { layers, removidas: [...removidas] }
}

/** A cópia de UMA célula fora da grade: foto avulsa, sem `grade` e sem o `groupId` da grade (grupo alheio fica). */
export function semVinculoDeGrade<T extends Layer>(camada: T): T {
  if (!vinculadaAGrade(camada)) return camada
  const gradeId = idDaGrade(camada)
  const metadata = { ...camada.metadata }
  delete metadata.grade
  if (gradeId && metadata.groupId === gradeId) delete metadata.groupId
  return { ...camada, metadata }
}

/** As grades INTEIRAS (todas as células do layout, coerentes) de uma lista — a do clipboard, por exemplo. */
export function gradesInteirasEm(camadas: readonly Layer[]): Set<string> {
  const porGrade = new Map<string, Layer[]>()
  for (const c of camadas) {
    const g = idDaGrade(c)
    if (g) porGrade.set(g, [...(porGrade.get(g) ?? []), c])
  }
  const inteiras = new Set<string>()
  for (const [g, membros] of porGrade) {
    const meta = metadadoDeGrade(membros[0])!
    const layout = layoutDoCatalogo(meta.layout, meta.versao)
    if (layout && membros.length === layout.celulas.length && conferirGrade(membros).length === 0) inteiras.add(g)
  }
  return inteiras
}

/**
 * Uma célula da grade copiada: id novo, a grade nova e UM deslocamento para posição e caixa, exato (a geometria
 * fracionária da grade não é arredondada, senão `conferirGrade` a acusaria quebrada).
 */
export function celulaDaGradeCopiada<T extends Layer>(camada: T, novos: { idDaCelula: string; idDaGrade: string }, dx: number, dy: number): T {
  const meta = metadadoDeGrade(camada)!
  return {
    ...camada,
    id: novos.idDaCelula,
    position: { x: (camada.position?.x ?? 0) + dx, y: (camada.position?.y ?? 0) + dy },
    metadata: {
      ...camada.metadata,
      grade: { ...meta, id: novos.idDaGrade, caixa: { ...meta.caixa, x: meta.caixa.x + dx, y: meta.caixa.y + dy } },
      groupId: novos.idDaGrade,
    },
  }
}

/** Duplicar a grade INTEIRA (+16 px, a regra do duplicar), logo depois da última célula na pilha. `null` = não é inteira. */
export function duplicarGradeNoDesign(
  design: DesignData,
  gradeId: string,
  novos: { idDaGrade: string; idDaCelula: () => string },
): { layers: Layer[]; selecionar: string[] } | null {
  const membros = membrosDaGrade(design.layers, gradeId)
  if (!gradesInteirasEm(membros).has(gradeId)) return null
  const copias = membros.map((c) => celulaDaGradeCopiada({ ...structuredClone(c), name: `${c.name} Copy`, locked: false }, { idDaCelula: novos.idDaCelula(), idDaGrade: novos.idDaGrade }, 16, 16))
  const ultima = Math.max(...membros.map((c) => design.layers.indexOf(c)))
  const layers = [...design.layers.slice(0, ultima + 1), ...copias, ...design.layers.slice(ultima + 1)]
  return { layers, selecionar: copias.map((c) => c.id) }
}

/** Agrupar (Cmd+G) com célula de grade na seleção: recusado no MVP (a grade já é a unidade). */
export const agruparTocaGrade = (layers: readonly Layer[], ids: readonly string[]) => layers.some((l) => ids.includes(l.id) && vinculadaAGrade(l))

/**
 * Desagrupar (Cmd+Shift+G): o grupo que é uma GRADE é desvinculado em todos os membros (sai `grade` e `groupId`, num
 * gesto); o grupo comum perde o `groupId` como sempre. `null` = a seleção não toca grupo nenhum.
 */
export function desagruparNoDesign(design: DesignData, ids: readonly string[]): Layer[] | null {
  const grupos = new Set<string>()
  for (const l of design.layers) {
    const g = l.metadata?.groupId
    if (ids.includes(l.id) && typeof g === 'string' && g) grupos.add(g)
    const daGrade = ids.includes(l.id) ? idDaGrade(l) : undefined
    if (daGrade) grupos.add(daGrade)
  }
  if (grupos.size === 0) return null
  const grades = new Set(design.layers.map(idDaGrade).filter((g): g is string => !!g && grupos.has(g)))
  let layers = design.layers
  for (const g of grades) {
    const r = desvincularNoDesign({ ...design, layers }, g)
    if (r.ok) layers = r.layers
  }
  return layers.map((l) => {
    const g = l.metadata?.groupId
    if (typeof g !== 'string' || !grupos.has(g) || grades.has(g)) return l
    const metadata = { ...l.metadata }
    delete metadata.groupId
    return { ...l, metadata }
  })
}

const mesmo = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * A edição genérica de UMA camada (`updateLayer`) diante da grade. Camada sem vínculo: passa, a não ser que ganhe
 * `metadata.grade` ou o `groupId` de uma grade da página. Célula: posição, tamanho, rotação, tipo, `objectFit`,
 * máscara, borda/cantos e o vínculo (`grade`, `groupId`) ficam como estavam; foto nova passa por `preencherCelula`
 * (host próprio, cover, recorte limpo) e a retirada da foto esvazia a célula (sem recorte). Opacidade, filtros,
 * espelhos, recorte da foto, nome, visibilidade e trava seguem livres.
 */
export function edicaoDaCamada(
  antes: Layer,
  depois: Layer,
  layers: readonly Layer[],
): { ok: true; camada: Layer; motivo?: undefined } | { ok: false; motivo: string; camada?: undefined } {
  if (!vinculadaAGrade(antes)) {
    const grades = new Set(layers.map(idDaGrade).filter(Boolean))
    const g = depois.metadata?.groupId
    const entra = vinculadaAGrade(depois) || (typeof g === 'string' && grades.has(g) && g !== antes.metadata?.groupId)
    return entra ? { ok: false, motivo: 'Só a seção Grades cria célula de grade: a camada não entrou na grade.' } : { ok: true, camada: depois }
  }
  const s0 = antes.style ?? {}
  const s1 = depois.style ?? {}
  const geometria =
    depois.type !== antes.type ||
    !mesmo(depois.position, antes.position) ||
    !mesmo(depois.size, antes.size) ||
    (depois.rotation ?? 0) !== (antes.rotation ?? 0) ||
    !mesmo(depois.metadata?.grade, antes.metadata?.grade) ||
    !mesmo(depois.metadata?.groupId, antes.metadata?.groupId) ||
    !mesmo(s1.objectFit, s0.objectFit) ||
    !mesmo(s1.mask, s0.mask) ||
    !mesmo(s1.border, s0.border)
  if (geometria) return { ok: false, motivo: MENSAGEM_CELULA_PROTEGIDA }
  if ((depois.fileUrl ?? '') === (antes.fileUrl ?? '')) return { ok: true, camada: depois }
  if (celulaVazia(depois.fileUrl)) {
    const style = { ...depois.style }
    delete style.crop
    return { ok: true, camada: { ...depois, fileUrl: '', style } }
  }
  const r = preencherCelula(depois, depois.fileUrl!)
  if (r.ok) return { ok: true, camada: r.valor }
  return {
    ok: false,
    motivo: r.diagnosticos.some((d) => d.codigo === 'URL_INVALIDA')
      ? 'Foto de célula só do armazenamento do Studio (nunca data:, blob: ou link do Drive): a célula ficou como estava.'
      : `A grade está quebrada (${r.diagnosticos[0]?.mensagem ?? 'célula incoerente'}): desvincule da grade para trocar a foto.`,
  }
}
