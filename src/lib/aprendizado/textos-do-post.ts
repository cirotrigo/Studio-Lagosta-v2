/**
 * O que um post tem de TEXTO para ser classificado.
 *
 * ⚠️ A descoberta que manda neste módulo (medida em 11/08/2026, produção):
 * **a maior parte das publicações não tem texto nenhum no banco.** Nos nove
 * clientes ativos, entre 10% e 26% dos posts publicados nos últimos 180 dias
 * têm caption legível; o resto é story cuja copy existe apenas dentro do PNG,
 * porque a peça foi montada fora do Studio. `slotValues` está preenchido em 13
 * posts no banco inteiro.
 *
 * A consequência de desenho é a diferença entre `outro` e `sem-texto`: um post
 * sem texto NÃO é um post de tema desconhecido, é um post que ninguém mediu.
 * Confundir os dois faria "outro" ser o maior pilar de todo cliente.
 *
 * Deliberadamente NÃO se olha a imagem. Classificar por visão custaria uma
 * chamada de modelo por post (milhares deles) e traria a mesma classe de erro
 * que fez a revisão visual ser desligada em 10/08. O que este módulo faz é
 * juntar honestamente o texto que existe e dizer quando não existe.
 *
 * Módulo PURO: quem carrega as linhas do banco é o serviço.
 */

/** A TAG de verificação de story (`SL-abc123-DEAD`) — não é conteúdo. */
const TAG_VERIFICACAO = /\bSL-[A-Za-z0-9]{4,10}-[A-Za-z0-9]{3,6}\b/g
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu
const URL = /https?:\/\/\S+/g
const ARROBA = /(^|\s)@[\p{L}\p{N}_.]+/gu

/** Abaixo disto não há o que classificar. */
export const MINIMO_DE_TEXTO = 15

/** De onde o texto veio — entra no registro para explicar a cobertura. */
export type FonteDeTexto = 'caption' | 'slotValues' | 'pagina' | 'generation' | 'lembrete'

export interface TextoDoPost {
  /** O texto reunido, já limpo. Vazio quando não há nada. */
  texto: string
  fontes: FonteDeTexto[]
  /** `true` quando não sobrou texto suficiente para classificar. */
  semTexto: boolean
}

/** Tira tag de verificação, hashtag, @menção e URL; colapsa espaço. */
export function limparTexto(bruto: string | null | undefined): string {
  if (!bruto) return ''
  return bruto
    .replace(TAG_VERIFICACAO, ' ')
    .replace(URL, ' ')
    .replace(HASHTAG, ' ')
    .replace(ARROBA, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Valores de texto de um objeto tipo `slotValues` (ignora chaves internas). */
export function textosDeObjeto(valor: unknown): string[] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return []
  const out: string[] = []
  for (const [campo, v] of Object.entries(valor as Record<string, unknown>)) {
    // `_driveImageId` / `_imageUrl` são reservados do slotValues, não são copy.
    if (campo.startsWith('_')) continue
    if (typeof v !== 'string') continue
    const limpo = v.trim()
    if (limpo) out.push(limpo)
  }
  return out
}

export interface PostParaTexto {
  caption?: string | null
  slotValues?: unknown
  reminderExtraInfo?: string | null
  /** Textos das camadas da página, quando a arte saiu de uma (`textosDaPagina`). */
  textosDaPagina?: Record<string, string> | null
  /** `Generation.fieldValues` do post, quando existe. */
  fieldValues?: unknown
}

/**
 * Chaves de `fieldValues` que guardam COPY ou o assunto pedido.
 *
 * `userRequest` fica de fora de propósito: nas melhorias com IA ele é a
 * instrução de ARTE ("deixe o título maior"), não o assunto do post — entraria
 * como se fosse tema e ensinaria pilar errado.
 */
const CAMPOS_DE_COPY = ['slotValues', 'texts', 'textos', 'textosLivres'] as const
const CAMPOS_DE_ASSUNTO = ['pedido', 'tema'] as const

/**
 * Reúne o texto disponível, na ordem em que ele é confiável.
 *
 * A deduplicação é por FRAGMENTO, não por bloco: a mesma headline costuma estar
 * na caption E nos slots da arte, e juntar os blocos inteiros repetiria a frase
 * — o que não muda a classificação, mas engorda um prompt que roda uma vez por
 * post do histórico.
 */
export function textoDoPost(post: PostParaTexto): TextoDoPost {
  const fragmentos: string[] = []
  const fontes: FonteDeTexto[] = []
  const vistos = new Set<string>()

  const acrescentar = (fonte: FonteDeTexto, textos: string[]): void => {
    let entrou = false
    for (const bruto of textos) {
      const limpo = limparTexto(bruto)
      if (!limpo) continue
      const chave = limpo.toLowerCase()
      if (vistos.has(chave)) continue
      vistos.add(chave)
      fragmentos.push(limpo)
      entrou = true
    }
    // A fonte só é registrada quando trouxe algo NOVO — dizer que a arte
    // contribuiu quando ela só repetiu a caption seria mentir sobre a origem.
    if (entrou) fontes.push(fonte)
  }

  acrescentar('caption', [post.caption ?? ''])
  acrescentar('slotValues', textosDeObjeto(post.slotValues))
  acrescentar('pagina', textosDeObjeto(post.textosDaPagina))

  const fv = (post.fieldValues ?? null) as Record<string, unknown> | null
  if (fv && typeof fv === 'object') {
    const daGeneration: string[] = []
    for (const campo of CAMPOS_DE_COPY) {
      const v = fv[campo]
      if (Array.isArray(v)) {
        daGeneration.push(...v.filter((x): x is string => typeof x === 'string'))
      } else {
        daGeneration.push(...textosDeObjeto(v))
      }
    }
    for (const campo of CAMPOS_DE_ASSUNTO) {
      const v = fv[campo]
      if (typeof v === 'string') daGeneration.push(v)
    }
    acrescentar('generation', daGeneration)
  }

  acrescentar('lembrete', [post.reminderExtraInfo ?? ''])

  const texto = fragmentos.join(' · ').slice(0, 600)
  return { texto, fontes, semTexto: texto.length < MINIMO_DE_TEXTO }
}
