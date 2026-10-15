/**
 * O preenchimento dos slots e da foto nas camadas de um modelo — módulo PURO.
 *
 * Mora aqui, e não em `arte-rapida.ts`, porque aquele importa o Prisma
 * (`@/lib/db` lança no import sem `DATABASE_URL`) e esta é a decisão que o
 * contrato da copy precisa conferir sem banco: o que a camada passa a mostrar
 * e o que ela declara sobre si depois de receber conteúdo novo.
 */
import { semPrefixoHerdado } from '@/lib/copy-autoral'
import { ocultaPeloRevisor, semMarcaDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { temTextoVisivel } from '@/lib/creatives/revisao/texto-visivel'
import type { OrigemDoValor, ValorResolvido } from '@/lib/semantica/resolver-valores'

/** Um texto com conteúdo que o bake ESCONDEU ou ESVAZIOU — por qual endereço (id, nome, slot, papel) o pedido chegou. */
export interface CopyRemovida {
  layerId: string
  /** O nome da camada (ou o id), para a pessoa saber qual texto. */
  chave: string
  operacao: 'escondido' | 'esvaziado'
  /** Por onde o pedido chegou: a MESMA precedência do bake (id > _slots/_papeis > nome). */
  endereco: OrigemDoValor
  /** O texto existia antes (sempre true aqui — a lista só tem textos com conteúdo). */
  tinhaConteudo: true
}

/**
 * CP4.1 (15/10/2026): o que o bake fez com a copy EXISTENTE da peça — texto (`text`/`rich-text`) com conteúdo não
 * vazio, visível (ou escondido pelo revisor, que o aprendizado conta como presente) que saiu ESCONDIDO
 * (`hidden: true`) ou ESVAZIADO (`''`, só espaço, `{ content: '' }`, inclusive por `_slots`/`_papeis`). Protege o
 * RESULTADO, não a sintaxe. Puro; compara por índice (o bake preserva a posição). No perfil draft-only isso é recusa
 * (ajustar-arte não apaga copy); no perfil humano é auditoria (`copyRemovida` no retorno e na Generation).
 */
export function copyRemovidaDoBake(
  sourceLayers: any[],
  bakedLayers: any[],
  slotValues: Record<string, unknown>,
  valores?: ReadonlyMap<number, ValorResolvido>,
): CopyRemovida[] {
  const saida: CopyRemovida[] = []
  sourceLayers.forEach((src: any, i: number) => {
    if (!src || (src.type !== 'text' && src.type !== 'rich-text')) return
    // "Tem conteúdo" é texto VISÍVEL (não só `trim`): copy feita de zero-width é copy apagada (revisor A).
    if (!temTextoVisivel(src.content)) return
    const dst = bakedLayers[i]
    if (!dst) return
    const endereco: OrigemDoValor =
      slotValues[src.id] != null ? { tipo: 'layerId', chave: String(src.id) } : (valores?.get(i)?.origem ?? { tipo: 'name', chave: String(src.name ?? src.id) })
    const base = { layerId: String(src.id), chave: String(src.name ?? src.id), endereco, tinhaConteudo: true as const }
    // ESVAZIAR destrói conteúdo seja a camada visível, escondida pela pessoa ou pelo revisor (revisor A3).
    if (!temTextoVisivel(dst.content)) saida.push({ ...base, operacao: 'esvaziado' })
    // ESCONDER: a camada visível que some — ou a escondida pelo REVISOR que `hidden: true` assume como escondida pela
    // pessoa (o bake lava a marca; no draft-only não há pessoa: conta como esconder — revisor A2). As duas operações
    // na mesma chamada (`{ content: '', hidden: true }`) são DUAS entradas (revisor B).
    if (dst.visible === false && (src.visible !== false || (ocultaPeloRevisor(src) && !ocultaPeloRevisor(dst)))) saida.push({ ...base, operacao: 'escondido' })
  })
  return saida
}

/**
 * Bake slot values and the background image into a copy of the source layers.
 *
 * Image placement: an explicit `fileUrl` slot always wins. Otherwise the photo
 * goes to the first empty dynamic image layer (the common case); if every
 * candidate already carries a static image, it replaces the first one — without
 * that fallback, templates with a hardcoded background silently ignore the photo.
 *
 * `valores` (B1c): os valores de `_slots`/`_papeis` já resolvidos por ÍNDICE do
 * mesmo array (`resolverValoresSemanticos`). Entram entre a chave legada pelo id
 * e a chave pelo nome; quem resolveu já recusou fontes divergentes.
 */
export function bakeLayers(
  sourceLayers: any[],
  slotValues: Record<string, unknown>,
  imageUrl: string | null,
  valores?: ReadonlyMap<number, ValorResolvido>,
): { layers: any[]; imageApplied: boolean; changedTextIds: string[]; explicitFileUrlIds: string[]; imageBloqueadaPeloSemantico: boolean } {
  const explicitFileUrl = new Set<string>()
  /** Índices cujo `fileUrl` explícito veio de _slots/_papeis (não do legado por id/nome). */
  const fileUrlSemantico = new Set<number>()
  const changedTextIds: string[] = []

  const layers = sourceLayers.map((layer: any, i: number) => {
    const semantico = slotValues[layer.id] == null ? valores?.get(i)?.valor : undefined
    const slot = slotValues[layer.id] ?? semantico ?? slotValues[layer.name]
    const updated = { ...layer }

    // 🔴 Camada que RECEBE conteúdo não herda a declaração de prefixo: ela
    // descreve o ornamento que o compositor desenhou, e o preenchimento escreve
    // o texto tal e qual. Herdada, a leitura descontava do contrato um "→ " que
    // agora é texto do autor — a arte mostrava "→ Venha hoje" e o contrato
    // gravava "Venha hoje" (PR5-12).
    //
    // 🔴 O fato é TER VINDO conteúdo, nunca "o conteúdo mudou" (PR5-12-R2): com
    // a guarda por igualdade, o contrato que pedia literalmente "→ Reserve já"
    // numa camada de mesmo texto mantinha a declaração, e a leitura descontava
    // do autor a seta que ele escreveu — a mesma transformação fictícia, agora
    // onde os caracteres coincidem. Só a camada SEM preenchimento continua
    // declarando o prefixo.
    const recebeuConteudo = () => Object.assign(updated, semPrefixoHerdado(updated))

    if (typeof slot === 'string') {
      updated.content = slot
      recebeuConteudo()
      if (layer.type === 'text') changedTextIds.push(layer.id)
    } else if (slot && typeof slot === 'object') {
      const slotObj = slot as Record<string, unknown>
      if (typeof slotObj.content === 'string') {
        updated.content = slotObj.content
        recebeuConteudo()
        if (layer.type === 'text') changedTextIds.push(layer.id)
      }
      if (typeof slotObj.fileUrl === 'string') {
        updated.fileUrl = slotObj.fileUrl
        explicitFileUrl.add(layer.id)
        if (semantico != null) fileUrlSemantico.add(i)
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

  const explicitFileUrlIds = [...explicitFileUrl]
  if (!imageUrl) return { layers, imageApplied: false, changedTextIds, explicitFileUrlIds, imageBloqueadaPeloSemantico: false }

  /**
   * Contrato NOVO estrito (opção C do #208): se o alvo NATURAL da foto — o que esta regra escolheria sem nenhum valor
   * explícito — recebeu `fileUrl` por _slots/_papeis, a foto genérica não escorre para outra imagem. O legado por
   * id/nome segue tolerante: a foto cai na próxima vaga dinâmica, como sempre.
   */
  const vaga = (layer: any) => layer.type === 'image' && (layer.isDynamic || layer.id === 'bg-img')
  const vazia = sourceLayers.findIndex((l: any) => vaga(l) && !l.fileUrl)
  const natural = vazia !== -1 ? vazia : sourceLayers.findIndex(vaga)
  if (natural !== -1 && fileUrlSemantico.has(natural)) {
    return { layers, imageApplied: false, changedTextIds, explicitFileUrlIds, imageBloqueadaPeloSemantico: true }
  }

  const isImageTarget = (layer: any) =>
    layer.type === 'image' && (layer.isDynamic || layer.id === 'bg-img') && !explicitFileUrl.has(layer.id)

  const target =
    layers.find((l: any) => isImageTarget(l) && !l.fileUrl) ?? layers.find(isImageTarget)

  if (!target) return { layers, imageApplied: false, changedTextIds, explicitFileUrlIds, imageBloqueadaPeloSemantico: false }

  target.fileUrl = imageUrl
  return { layers, imageApplied: true, changedTextIds, explicitFileUrlIds, imageBloqueadaPeloSemantico: false }
}
