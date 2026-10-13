/**
 * Os valores de um post (`SocialPost.slotValues`) aplicados sobre as camadas de uma página — o helper PURO que o
 * render e a leitura da peça compartilham (B1d, checkpoint b).
 *
 * - **Sem contrato novo** (sem as chaves `_slots`/`_papeis`): exatamente o legado do render — `aplicarSlotNaCamada`
 *   em cada camada, com o mesmo diagnóstico de chave sem camada. Nada de `bakeLayers`: os dois divergem na string
 *   vazia, e o legado do render continua o dele.
 * - **Com contrato novo**: `validarEntradaSemantica` + `resolverValoresSemanticos` UMA vez (sem segundo resolvedor);
 *   qualquer erro devolve as camadas INTACTAS com `erros` estruturados — quem chama decide (o render falha). Sem
 *   erro, aplica por ÍNDICE no MESMO array recebido, antes de qualquer ordenação: a camada resolvida recebe o efeito
 *   semântico (o mesmo da criação: string ou `{ content }` troca o texto, inclusive por vazio; `{ fileUrl }` troca a
 *   imagem); as demais seguem o legado. O resolvedor já recusou fonte legada divergente na mesma camada.
 *
 * Módulo puro (sem banco): o array recebido não é mutado.
 */
import { CHAVES_DO_CONTRATO_SEMANTICO, temContratoSemantico } from './copy-segue-a-pagina'
import { aplicarSlotNaCamada, findUnmatchedSlotKeys } from './page-to-design-data'
import {
  resolverValoresSemanticos,
  validarEntradaSemantica,
  type AvisoDeValor,
  type ErroDeValor,
  type ValorSemantico,
} from '@/lib/semantica/resolver-valores'
import type { Layer } from '@/types/template'

type CamadaAplicavel = { id?: string; name?: string; content?: unknown; fileUrl?: unknown }

export type AvisoDoPost = { codigo: 'CHAVE_SEM_CAMADA'; chaves: string[] } | AvisoDeValor

export interface ValoresAplicados<T> {
  camadas: T[]
  /** O post usa o contrato novo (presença de `_slots`/`_papeis`). */
  semantico: boolean
  /** Recusas do contrato novo — sem texto nem URL pedidos. Com erro, `camadas` é o array recebido, intacto. */
  erros: ErroDeValor[]
  avisos: AvisoDoPost[]
  /**
   * Só no sucesso do contrato novo: ids das camadas `text` que receberam conteúdo — semântico (string ou
   * `{ content }`, inclusive igual ao original — o precedente do `bakeLayers`) ou, num post misto, legado pelo
   * critério de hoje do render (`(slots[id] ?? slots[name]) !== undefined`). É a fonte do reflow; `{ fileUrl }` não
   * entra. No post puramente legado o render mantém o cálculo de sempre.
   */
  changedTextIds?: string[]
}

function aplicarSemantico<T extends CamadaAplicavel>(camada: T, valor: ValorSemantico): T {
  if (typeof valor === 'string') return { ...camada, content: valor }
  return {
    ...camada,
    ...(valor.content !== undefined ? { content: valor.content } : {}),
    ...(valor.fileUrl !== undefined ? { fileUrl: valor.fileUrl } : {}),
  }
}

export function aplicarValoresDoPost<T extends CamadaAplicavel>(
  camadas: T[],
  slotValues: Record<string, unknown> | null | undefined,
): ValoresAplicados<T> {
  if (!slotValues) return { camadas, semantico: false, erros: [], avisos: [] }

  const semChave = findUnmatchedSlotKeys(camadas as Array<Pick<Layer, 'id' | 'name'>>, slotValues)
  const avisos: AvisoDoPost[] = semChave.length > 0 ? [{ codigo: 'CHAVE_SEM_CAMADA', chaves: semChave }] : []

  if (!temContratoSemantico(slotValues)) {
    return { camadas: camadas.map((c) => aplicarSlotNaCamada(c, slotValues)), semantico: false, erros: [], avisos }
  }

  // A chave presente É o contrato (checkpoint a); valor ausente nela é contrato malformado — o resolvedor o
  // trataria como "não fornecido" e o post passaria em silêncio pelo legado.
  const chavesVazias: ErroDeValor[] = CHAVES_DO_CONTRATO_SEMANTICO.filter(
    (campo) => Object.prototype.hasOwnProperty.call(slotValues, campo) && slotValues[campo] == null,
  ).map((campo) => ({ codigo: 'ENTRADA_INVALIDA', campo }))
  const errosDeEntrada = [...chavesVazias, ...validarEntradaSemantica(slotValues)]
  if (errosDeEntrada.length > 0) return { camadas, semantico: true, erros: errosDeEntrada, avisos }

  // Checkpoint g (Codex): com o contrato, a copy VISUAL da arte é registrada das camadas (copyVisualDasCamadas, chave
  // `name ?? id`) — texto visível numa chave `_…` cairia onde os leitores descartam, mesmo num pedido só de imagem.
  // Aqui (o helper que admissão, render, recuperação e leitura compartilham) a regra vale em todos os caminhos.
  const reservadas: ErroDeValor[] = camadas
    .filter((c) => {
      const l = c as { type?: unknown; visible?: unknown; name?: unknown; id?: unknown }
      return (l.type === 'text' || l.type === 'rich-text') && l.visible !== false && String(l.name ?? l.id).startsWith('_')
    })
    .map((c) => ({ codigo: 'CHAVE_VISUAL_RESERVADA' as const, layerId: String(c.id) }))
  if (reservadas.length > 0) return { camadas, semantico: true, erros: reservadas, avisos }

  const r = resolverValoresSemanticos(camadas as unknown as Layer[], slotValues)
  if (r.erros.length > 0) return { camadas, semantico: true, erros: r.erros, avisos: [...avisos, ...r.avisos] }

  const changedTextIds: string[] = []
  const aplicadas = camadas.map((c, i) => {
    const resolvido = r.valores.get(i)
    if (!resolvido) {
      // Post MISTO: o texto legado de outra camada também cresce e precisa de reflow (Codex, checkpoint d) —
      // pelo MESMO critério que o render usa no legado.
      const legado = (c.id !== undefined ? slotValues[c.id] : undefined) ?? (c.name !== undefined ? slotValues[c.name] : undefined)
      if ((c as { type?: unknown }).type === 'text' && legado !== undefined && c.id) changedTextIds.push(c.id)
      return aplicarSlotNaCamada(c, slotValues)
    }
    const v = resolvido.valor
    if ((c as { type?: unknown }).type === 'text' && (typeof v === 'string' || v.content !== undefined) && c.id) changedTextIds.push(c.id)
    return aplicarSemantico(c, v)
  })
  return { camadas: aplicadas, semantico: true, erros: [], avisos: [...avisos, ...r.avisos], changedTextIds }
}
