/**
 * A DEFASAGEM de uma peça composta: a página foi editada depois de a arte ter
 * sido feita, e a arte que está no post continua sendo a antiga.
 *
 * Para a peça de imagem ÚNICA isso já era resolvido — o PATCH da página chama
 * `invalidateScheduledRenders`, o post volta para `PENDING` e o cron
 * `render-stories` refaz a arte. Para o SLIDE DE CARROSSEL não acontecia nada:
 * post de carrossel nasce `NOT_NEEDED` e sem `pageId` (a arte entra por
 * `mediaUrls`), justamente porque `renderPostArt` grava `mediaUrls: [url]` —
 * uma lista de UM — e um post `RENDERED` de 5 slides perderia 4 no primeiro
 * re-render. A proteção evitava o estrago e, no mesmo movimento, abandonava a
 * edição: em 04/09/2026, sete slides do projeto 8 iriam ao ar com a copy
 * anterior, sem log, aviso ou status.
 *
 * Módulo PURO (sem Prisma, sem sharp), como `troca-de-arte.ts` e
 * `page-layers.ts`: `@/lib/db` lê `DATABASE_URL` no import e LANÇA quando ela
 * falta, o que tornaria estas regras não-testáveis. Quem fala com o banco é
 * `recompor.ts`.
 *
 * Duas decisões moram aqui, e as duas custaram caro em 04/09:
 *
 * 1. **A defasagem se mede por CONTEÚDO, nunca por carimbo de hora.**
 *    `Page.updatedAt` muda em qualquer escrita — naquele dia um `update` de
 *    `order` em 30 páginas apagou o sinal de uma vez só.
 * 2. **Recompor só quando a página é a que o compositor pousou.** Recompor
 *    reconstrói TODAS as camadas a partir da spec: se alguém moveu uma caixa,
 *    escondeu um bloco ou acrescentou uma camada à mão, isso seria jogado
 *    fora em silêncio. Nesse caso a arte é só re-renderizada como está — a
 *    edição chega ao post do mesmo jeito (que é o defeito) e o trabalho
 *    manual sobrevive.
 */

import type { Layer } from '@/types/template'
import { copyDeCamadas } from '@/lib/aprendizado/diff-copy'
import { diffDeGeometria, type DiffDeGeometria } from '@/lib/aprendizado/diff-geometria'
import { lerCamadas } from '@/lib/posts/page-layers'

import { PAPEIS, type Papel, type SpecDePeca } from './spec'

/** Os papéis que uma camada de texto do compositor pode carregar. */
const PAPEIS_DA_PECA: readonly string[] = [...PAPEIS, 'headline2']

/**
 * O papel de uma camada. A fonte boa é `metadata.compositor.papel` (gravado
 * por `camadaDoPapel`); `id`/`name` são o mesmo valor e servem de reserva para
 * quem renomear a camada no editor.
 */
export function papelDaCamada(camada: Layer): Papel | 'headline2' | null {
  const meta = camada.metadata as { compositor?: { papel?: string } } | undefined
  const candidato = meta?.compositor?.papel ?? camada.id ?? camada.name
  return PAPEIS_DA_PECA.includes(String(candidato)) ? (candidato as Papel | 'headline2') : null
}

/**
 * A copy da peça por PAPEL, lida das camadas. `null` = camadas ilegíveis.
 *
 * Camada oculta fica de fora pelo mesmo motivo de `textosDaPagina`: desde
 * 13/08/2026 o campo que a copy não cobre sai invisível, e contá-lo poria na
 * peça um texto que não está na arte.
 */
export function copyDosPapeis(camadas: unknown): Record<string, string> | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const out: Record<string, string> = {}
  for (const bruta of lidas as Layer[]) {
    if (bruta?.type !== 'text' || bruta.visible === false) continue
    const papel = papelDaCamada(bruta)
    if (!papel) continue
    const conteudo = typeof bruta.content === 'string' ? bruta.content.trim() : ''
    if (conteudo) out[papel] = conteudo
  }
  return out
}

/**
 * A foto de fundo da PÁGINA — a verdade sobre a imagem da peça.
 *
 * 🔴 Nem toda spec tem foto. Duas peças de 04/09 tinham `spec.foto`
 * indefinida porque a imagem foi posta à mão no editor depois de compor;
 * recompor pela spec devolveu a peça com FUNDO PRETO, sem erro nenhum.
 */
export function fotoDaPagina(camadas: unknown): string | null {
  const { camadas: lidas, legivel } = lerCamadas(camadas)
  if (!legivel) return null
  const imagens = (lidas as Layer[]).filter((c) => c?.type === 'image')
  const fundo = imagens.find((c) => c.id === 'bg-foto') ?? imagens[0]
  if (!fundo) return null
  const daCamada = typeof fundo.fileUrl === 'string' ? fundo.fileUrl : ''
  const doEstilo = (fundo.style as { backgroundImageUrl?: unknown } | undefined)?.backgroundImageUrl
  return daCamada || (typeof doEstilo === 'string' ? doEstilo : '') || null
}

export interface Defasagem {
  /** Não deu para ler um dos lados — nunca vira "não mudou nada". */
  ilegivel: boolean
  /** O texto da página não é mais o texto com que a arte foi feita. */
  defasada: boolean
  /** Os papéis (ou nomes de camada) cujo texto mudou. */
  papeis: string[]
  /**
   * A página continua sendo a que o compositor pousou, só com texto diferente
   * — então dá para recompor sem apagar trabalho de ninguém.
   */
  soTexto: boolean
  /** O que foi mexido à mão, em português — vira aviso de quem editou. */
  mexidoNaMao: string[]
}

/**
 * A altura de uma caixa de TEXTO é derivada, não decisão de ninguém: o modo
 * Auto (`autoExpand`) a re-mede sozinho quando o texto muda — e até quando só
 * a fonte termina de carregar. Contá-la como "mexeu à mão" faria toda edição
 * de texto cair no caminho conservador, e a recomposição nunca aconteceria.
 * Tudo o mais (posição, largura, corpo da fonte, alinhamento, visibilidade,
 * camada acrescentada ou removida, e qualquer delta em camada que não é
 * texto) é decisão de gente e desliga a recomposição.
 */
export function mexeuNaMao(diff: DiffDeGeometria): string[] {
  const motivos: string[] = []
  for (const id of diff.adicionadas) motivos.push(`camada "${id}" acrescentada à mão`)
  for (const id of diff.removidas) motivos.push(`camada "${id}" removida à mão`)
  for (const d of diff.deltas) {
    const quem = d.papel ?? d.id
    if (d.dx || d.dy) {
      motivos.push(`"${quem}" foi movida (${d.dx >= 0 ? '+' : ''}${d.dx}, ${d.dy >= 0 ? '+' : ''}${d.dy}px)`)
    }
    if (d.dw) motivos.push(`a caixa de "${quem}" mudou de largura (${d.dw >= 0 ? '+' : ''}${d.dw}px)`)
    if (d.tipo !== 'text' && d.dh) motivos.push(`"${quem}" mudou de altura (${d.dh >= 0 ? '+' : ''}${d.dh}px)`)
    if (d.escalaDaFonte !== null) motivos.push(`a fonte de "${quem}" foi mudada (×${d.escalaDaFonte})`)
    if (d.alinhamento) motivos.push(`"${quem}" foi realinhada (${d.alinhamento.antes} → ${d.alinhamento.depois})`)
    if (d.visibilidade) motivos.push(d.visibilidade.depois ? `"${quem}" foi religada` : `"${quem}" foi escondida`)
  }
  return motivos
}

/**
 * A página de hoje contra o SNAPSHOT do que foi composto
 * (`Generation.fieldValues.layersSnapshot`).
 */
export function medirDefasagem(camadasDaPagina: unknown, snapshot: unknown): Defasagem {
  const agora = copyDeCamadas(camadasDaPagina)
  const antes = copyDeCamadas(snapshot)
  if (!agora || !antes) {
    return { ilegivel: true, defasada: false, papeis: [], soTexto: false, mexidoNaMao: [] }
  }

  const papeis = [...new Set([...Object.keys(antes), ...Object.keys(agora)])]
    .filter((k) => (antes[k] ?? '') !== (agora[k] ?? ''))
    .sort()

  const diff = diffDeGeometria(snapshot, camadasDaPagina)
  const motivos = diff.ilegivel ? ['não deu para comparar a geometria da página com a da arte'] : mexeuNaMao(diff)

  return {
    ilegivel: false,
    defasada: papeis.length > 0,
    papeis,
    soTexto: motivos.length === 0,
    mexidoNaMao: motivos,
  }
}

export interface SpecRecomposta {
  spec: SpecDePeca
  avisos: string[]
}

/**
 * A spec de origem com a COPY e a FOTO que estão na página hoje — o que se
 * manda de volta ao compositor para ele medir cada linha na fonte real e
 * empilhar de novo.
 *
 * Só a copy e a foto mudam. Formato, preferências, variante e os vínculos com
 * o plano ficam como estavam: quem recompõe está refazendo A MESMA peça.
 */
export function specComACopyDaPagina(spec: SpecDePeca, camadasDaPagina: unknown): SpecRecomposta {
  const avisos: string[] = []
  const copy = copyDosPapeis(camadasDaPagina)
  if (!copy) return { spec, avisos: ['não deu para ler as camadas da página; a spec ficou como estava'] }

  /**
   * A segunda voz da manchete não existe na spec: `comporPeca` a cria quando
   * a assinatura a tem e a manchete vem com 2+ linhas, pondo nela a ÚLTIMA
   * linha. Na volta as duas camadas viram de novo UMA manchete — deixar
   * `headline2` na spec faria `validarSpec` recusar a peça inteira.
   */
  const manchete = [
    ...(copy.headline ? copy.headline.split('\n') : []),
    ...(copy.headline2 ? copy.headline2.split('\n') : []),
  ].join('\n')

  const blocos = spec.blocos
    .map((b) => {
      const texto = b.papel === 'headline' ? manchete : copy[b.papel]
      if (!texto) {
        avisos.push(`o texto de "${b.papel}" não está mais na página; a peça foi refeita sem ele`)
        return null
      }
      return { papel: b.papel, linhas: texto.split('\n').filter((l) => l.trim().length > 0) }
    })
    // O cast existe porque, com `strict: false`, `z.infer` marca toda chave do
    // bloco como opcional — um type predicate sobre ele não é assinalável.
    .filter((b) => b !== null && b.linhas.length > 0) as SpecDePeca['blocos']

  const url = fotoDaPagina(camadasDaPagina)
  let foto = spec.foto
  if (url && url !== spec.foto?.url) {
    /**
     * A foto da PÁGINA vence a da spec: ou ela nunca existiu ali, ou alguém
     * trocou a imagem no editor. O `driveFileId` antigo sai junto — apontando
     * para outra foto, ele levaria o assunto errado do catálogo para o mapa
     * de calma.
     */
    avisos.push(
      spec.foto?.url
        ? 'a foto da página não é a da spec; a peça foi refeita com a da página'
        : 'a spec não tinha foto; a peça foi refeita com a que está na página',
    )
    foto = { url }
  }

  return { spec: { ...spec, blocos, ...(foto ? { foto } : {}) } as SpecDePeca, avisos }
}

export interface PostComArte {
  id: string
  pageId?: string | null
  renderStatus?: string | null
  mediaUrls?: string[] | null
}

/** Os estados de render que `invalidateScheduledRenders` alcança. */
const ALCANCADOS_PELA_INVALIDACAO = ['RENDERED', 'PENDING', 'RENDERING']

/**
 * Este post já é atendido pela invalidação — a recomposição não encosta nele.
 *
 * As duas são o mesmo remédio para públicos diferentes: a invalidação devolve
 * à fila de render o post que RENDERIZA da página (imagem única), e a
 * recomposição troca a arte congelada de quem não renderiza (o slide de
 * carrossel, a arte agendada por `generationId`). Sobrepor as duas no mesmo
 * post seria trocar a mídia de alguém que a invalidação acabou de zerar.
 */
export function alcancadoPelaInvalidacao(post: PostComArte, pageId: string): boolean {
  return post.pageId === pageId && ALCANCADOS_PELA_INVALIDACAO.includes(String(post.renderStatus ?? ''))
}

export interface SlideDefasado {
  postId: string
  /** A posição da arte antiga em `mediaUrls` (0 = a primeira). */
  indice: number
  total: number
  urlAntiga: string
}

/**
 * Onde a arte desta página está pendurada: (post, posição) para cada mídia que
 * é uma das artes conhecidas da página.
 *
 * 🔴 O casamento é por URL EXATA, nunca pelo prefixo do nome do arquivo.
 * `renderPostArt` nomeia por POST (`<postId>-<epoch>.png`) e o compositor
 * nomeia por PÁGINA (`<pageId>-<epoch>.png`); supor uma coisa só produziu 9
 * falsos "página que não existe mais" no diagnóstico de 04/09. A URL do Blob
 * carrega sufixo aleatório, então a igualdade é inequívoca — é o mesmo
 * casamento que `agendarPost` e `resolverGeracoesSoDestePost` já fazem.
 */
/**
 * A arte precisa ser refeita?
 *
 * `false` só quando dá para AFIRMAR que está tudo em dia: a página é igual à
 * que o compositor entregou, ninguém mexeu nela à mão, e todo slide já aponta
 * para a arte atual. Ilegível responde `true` — "não consegui conferir" não é
 * "está em dia", e refazer é barato perto de publicar o texto velho.
 *
 * Sem esta porta, um empurrãozinho de 1px numa caixa (que muda o JSON mas não
 * passa da tolerância do diff geométrico) gastaria um job, um render, um blob
 * novo e uma linha no histórico de cada post.
 */
export function precisaRefazer(defasagem: Defasagem, slides: SlideDefasado[], urlAtual: string): boolean {
  if (slides.length === 0) return false
  if (defasagem.ilegivel || defasagem.defasada || defasagem.mexidoNaMao.length > 0) return true
  return !slides.every((s) => s.urlAntiga === urlAtual)
}

export function slidesDaPagina(posts: PostComArte[], urls: string[], pageId: string): SlideDefasado[] {
  const conhecidas = new Set(urls.filter(Boolean))
  const achados: SlideDefasado[] = []
  for (const post of posts) {
    if (alcancadoPelaInvalidacao(post, pageId)) continue
    const midias = (post.mediaUrls ?? []).map(String)
    midias.forEach((url, indice) => {
      if (conhecidas.has(url)) achados.push({ postId: post.id, indice, total: midias.length, urlAntiga: url })
    })
  }
  return achados
}
