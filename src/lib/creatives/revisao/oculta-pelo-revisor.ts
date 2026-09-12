/**
 * A marca de uma camada que o REVISOR escondeu (ajuste `visibilidade`), para
 * o aprendizado saber que aquele texto não foi a pessoa apagando (REV-9E-01
 * da revisão FINAL do Codex sobre o PR 0, 12/09/2026).
 *
 * O defeito: `ajustarArte` protegia a decisão só dentro dele (comparava a
 * copy de ANTES dos ajustes). No agendamento, `copyDeCamadas` da página
 * exclui a camada oculta, o fechamento da dica comparava com os blocos
 * propostos e registrava REMOÇÃO com desfecho `editada`, atribuída à pessoa
 * — uma correção mecânica virava preferência humana no corpus, e ainda
 * substituía um aceite anterior.
 *
 * A marca vive em `metadata.revisao.ocultaPeloRevisor` DA PRÓPRIA CAMADA:
 * é gravada com a página, no mesmo write do ajuste (sobrevive ao render que
 * falha), e viaja com a camada por todo caminho que lê `Page.layers`. O
 * aprendizado lê as camadas por `camadasParaDecisao` (a escondida pelo
 * revisor conta como presente); o render e a cópia do post continuam lendo
 * a camada como ela está — a marca nunca muda o que a arte mostra.
 *
 * Só o efeito MECÂNICO é excluído: camada escondida SEM a marca é a pessoa
 * (editor, `ajustar-arte` sem revisão), e conta como remoção. E a marca cai
 * quando a pessoa a esconde de novo depois de tê-la mostrado
 * (`reconciliarMarcasDoRevisor`, na escrita do editor) — sem isso um
 * esconder humano posterior seria lido como mecânico para sempre.
 *
 * Módulo PURO: consumido pelo executor dos ajustes e pelo diff de copy.
 */

export interface MarcaDoRevisor {
  /** ISO de quando o ajuste escondeu a camada. */
  em: string
  /** O índice do ajuste na lista aplicada. */
  ajuste: number
}

// Tipo aberto de propósito: recebe `Layer` do editor, `PageLayer` da leitura e objetos de teste.
type CamadaComMarca = { visible?: unknown; metadata?: unknown; [chave: string]: unknown }

function metadataDe(l: CamadaComMarca): Record<string, unknown> {
  const m = l.metadata
  return m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {}
}

function revisaoDe(l: CamadaComMarca): Record<string, unknown> {
  const r = metadataDe(l).revisao
  return r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : {}
}

/** A marca da camada, se o revisor a escondeu (independe de `visible`: ver `ocultaPeloRevisor`). */
export function marcaDoRevisor(l: CamadaComMarca | null | undefined): MarcaDoRevisor | null {
  if (!l) return null
  const m = revisaoDe(l).ocultaPeloRevisor
  if (!m || typeof m !== 'object') return null
  const { em, ajuste } = m as Record<string, unknown>
  return typeof em === 'string' && typeof ajuste === 'number' ? { em, ajuste } : null
}

/** A camada está escondida POR AJUSTE MECÂNICO do revisor (e continua escondida). */
export function ocultaPeloRevisor(l: CamadaComMarca | null | undefined): boolean {
  return !!l && l.visible === false && marcaDoRevisor(l) !== null
}

function comRevisao<L extends CamadaComMarca>(l: L, revisao: Record<string, unknown>): L {
  const metadata: Record<string, unknown> = { ...metadataDe(l) }
  if (Object.keys(revisao).length > 0) metadata.revisao = revisao
  else delete metadata.revisao
  return { ...l, metadata }
}

/** A camada sem a marca do revisor (o resto de `metadata.revisao` fica). */
export function semMarcaDoRevisor<L extends CamadaComMarca>(l: L): L {
  if (!marcaDoRevisor(l)) return l
  const { ocultaPeloRevisor: _fora, ...resto } = revisaoDe(l)
  return comRevisao(l, resto)
}

/**
 * O que o ajuste `visibilidade` grava: esconder marca a camada; mostrar tira
 * a marca (a camada volta a ser o que a pessoa vê e decide).
 */
export function comVisibilidadeDoRevisor<L extends CamadaComMarca>(l: L, visivel: boolean, marca: MarcaDoRevisor): L {
  if (visivel) return { ...semMarcaDoRevisor(l), visible: true }
  return comRevisao({ ...l, visible: false }, { ...revisaoDe(l), ocultaPeloRevisor: marca })
}

/** As camadas como o APRENDIZADO as vê: a que o revisor escondeu conta como presente. Nunca use para render nem para a cópia do post. */
export function camadasParaDecisao<L extends CamadaComMarca>(camadas: L[]): L[] {
  return camadas.map((l) => (ocultaPeloRevisor(l) ? { ...l, visible: true } : l))
}

/**
 * Depois de uma escrita HUMANA das camadas (o editor), a marca só sobrevive
 * na camada que continua escondida desde o ajuste. Camada que estava VISÍVEL
 * antes desta escrita e chega escondida foi a pessoa escondendo — a marca
 * antiga sai, e a remoção passa a contar como dela.
 */
export function reconciliarMarcasDoRevisor<L extends CamadaComMarca & { id: string }>(
  antes: Array<{ id: string; visible?: unknown }> | null | undefined,
  depois: L[],
): L[] {
  const antesPorId = new Map((antes ?? []).map((l) => [l.id, l]))
  return depois.map((l) => {
    if (!marcaDoRevisor(l)) return l
    const a = antesPorId.get(l.id)
    if (l.visible === false && a && a.visible !== false) return semMarcaDoRevisor(l)
    return l
  })
}
