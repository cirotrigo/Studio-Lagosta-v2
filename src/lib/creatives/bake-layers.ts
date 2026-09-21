/**
 * O preenchimento dos slots e da foto nas camadas de um modelo — módulo PURO.
 *
 * Mora aqui, e não em `arte-rapida.ts`, porque aquele importa o Prisma
 * (`@/lib/db` lança no import sem `DATABASE_URL`) e esta é a decisão que o
 * contrato da copy precisa conferir sem banco: o que a camada passa a mostrar
 * e o que ela declara sobre si depois de receber conteúdo novo.
 */
import { semPrefixoHerdado } from '@/lib/copy-autoral'
import { semMarcaDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'

/**
 * Bake slot values and the background image into a copy of the source layers.
 *
 * Image placement: an explicit `fileUrl` slot always wins. Otherwise the photo
 * goes to the first empty dynamic image layer (the common case); if every
 * candidate already carries a static image, it replaces the first one — without
 * that fallback, templates with a hardcoded background silently ignore the photo.
 */
export function bakeLayers(
  sourceLayers: any[],
  slotValues: Record<string, unknown>,
  imageUrl: string | null,
): { layers: any[]; imageApplied: boolean; changedTextIds: string[] } {
  const explicitFileUrl = new Set<string>()
  const changedTextIds: string[] = []

  const layers = sourceLayers.map((layer: any) => {
    const slot = slotValues[layer.id] ?? slotValues[layer.name]
    const updated = { ...layer }

    // 🔴 Conteúdo NOVO não herda a declaração de prefixo da camada anterior: ela
    // descreve o ornamento que o compositor desenhou, e o preenchimento escreve
    // o texto tal e qual. Herdada, a leitura descontava do contrato um "→ " que
    // agora é texto do autor — a arte mostrava "→ Venha hoje" e o contrato
    // gravava "Venha hoje" (PR5-12).
    const trocouConteudo = (novo: string) => {
      if (novo === layer.content) return
      Object.assign(updated, semPrefixoHerdado(updated))
    }

    if (typeof slot === 'string') {
      updated.content = slot
      trocouConteudo(slot)
      if (layer.type === 'text') changedTextIds.push(layer.id)
    } else if (slot && typeof slot === 'object') {
      const slotObj = slot as Record<string, unknown>
      if (typeof slotObj.content === 'string') {
        updated.content = slotObj.content
        trocouConteudo(slotObj.content)
        if (layer.type === 'text') changedTextIds.push(layer.id)
      }
      if (typeof slotObj.fileUrl === 'string') {
        updated.fileUrl = slotObj.fileUrl
        explicitFileUrl.add(layer.id)
      }
      // O render pula `visible === false` — e o editor mostra a camada como
      // oculta, então quem abrir a arte consegue religá-la. `hidden: true` é
      // instrução HUMANA explícita: uma marca antiga de "escondida pelo
      // revisor" não pode encobri-la (REV-8AD-02).
      if (slotObj.hidden === true) Object.assign(updated, semMarcaDoRevisor({ ...updated, visible: false }))
      // F1: o papel e o bloco do contrato ficam na camada — é o que deixa a
      // copy efetiva da página ser relida bloco a bloco (`papelDaCamada`,
      // `vincularExtras`).
      if (typeof slotObj.papel === 'string' || typeof slotObj.bloco === 'string') {
        const meta = (updated.metadata && typeof updated.metadata === 'object' ? { ...updated.metadata } : {}) as Record<string, unknown>
        const compositor = (meta.compositor && typeof meta.compositor === 'object' ? { ...(meta.compositor as Record<string, unknown>) } : {}) as Record<string, unknown>
        if (typeof slotObj.papel === 'string') compositor.papel = slotObj.papel
        if (typeof slotObj.bloco === 'string') compositor.bloco = slotObj.bloco
        updated.metadata = { ...meta, compositor }
      }
    }
    return updated
  })

  if (!imageUrl) return { layers, imageApplied: false, changedTextIds }

  const isImageTarget = (layer: any) =>
    layer.type === 'image' && (layer.isDynamic || layer.id === 'bg-img') && !explicitFileUrl.has(layer.id)

  const target =
    layers.find((l: any) => isImageTarget(l) && !l.fileUrl) ?? layers.find(isImageTarget)

  if (!target) return { layers, imageApplied: false, changedTextIds }

  target.fileUrl = imageUrl
  return { layers, imageApplied: true, changedTextIds }
}
