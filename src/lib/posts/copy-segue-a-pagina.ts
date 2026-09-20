/**
 * A copy que o post carrega — e quando ela manda na arte.
 *
 * `SocialPost.slotValues` tem duas origens com semânticas opostas:
 *
 * - Na via de TEMPLATE (plan-week, `create-post`, later-scheduler) a página é um
 *   LAYOUT compartilhado com texto de espelho, e cada post carrega a sua copy
 *   em `slotValues`. O render aplica `slotValues` por cima da página — e é
 *   isso que faz N posts saírem de UMA página. Ali a página NÃO manda.
 * - Na via de CONTEÚDO (compositor, arte-rapida, agendar por pageId, troca de
 *   arte por página) a página É a peça, e o que se grava em `slotValues` é uma
 *   CÓPIA do texto dela — para o corpus de aprendizado e para a conferência de
 *   texto da melhoria. Ali a página manda, e a cópia nunca volta para a arte.
 *
 * 🔴 Até 10/09/2026 o render não distinguia as duas e aplicava as duas por
 * cima da página. O remendo de 03/09 fazia a cópia "seguir" a página no PATCH
 * do editor, mas só quando ela ainda era IGUAL ao texto anterior da página.
 * Bastava UMA escrita de camadas por outro caminho (ajuste de arte pelo chat,
 * reverter, recomposição) para as duas divergirem, e dali em diante NENHUMA
 * edição feita no editor chegava mais à arte: a Real Gelateria editou três
 * stories do Dia do Milk-shake e a agenda seguiu com o texto da manhã — no de
 * sexta, sobreposto à linha de serviço. Converter uma linha para rich text
 * rompia do mesmo jeito, porque ela sumia da leitura de copy.
 *
 * Por isso a semântica é gravada NA ESCRITA, por quem sabe: quem copia o texto
 * da página marca a cópia com `_copiaDaPagina` (chave de controle — os leitores
 * de copy já ignoram o prefixo `_`), e o render desenha a página como ela está.
 *
 * 🔴 E a marca não é o ÚNICO guarda-costas, desde 20/09/2026: um `true`
 * esquecido em um dos seis escritores de `slotValues` reintroduzia o defeito
 * inteiro, em silêncio. Quem decide sem depender dela é `slotValuesParaRender`,
 * pelo que a página É — modelo ou peça. Leia o comentário dela.
 */

/** Chave de controle: este `slotValues` é uma cópia do texto da página, não copy própria do post. */
export const COPIA_DA_PAGINA = '_copiaDaPagina'

/** A copy da página, marcada como cópia — o formato que o agendamento grava. */
export function comoCopiaDaPagina(copy: Record<string, unknown>): Record<string, unknown> {
  return { ...copy, [COPIA_DA_PAGINA]: true }
}

/** O post carrega uma cópia da página? Só o `true` literal conta. */
export function ehCopiaDaPagina(slotValues: unknown): boolean {
  return (
    !!slotValues &&
    typeof slotValues === 'object' &&
    !Array.isArray(slotValues) &&
    (slotValues as Record<string, unknown>)[COPIA_DA_PAGINA] === true
  )
}

/**
 * O que o render aplica por cima da página.
 *
 * 🔴 A MARCA NÃO BASTA, e isso foi medido. `slotValues` é escrito por seis
 * caminhos, e o que ficou de 10/09/2026 era "sem a marca, os slots vencem a
 * página" — ou seja, um `true` esquecido em QUALQUER um deles volta a publicar
 * o texto velho, em silêncio, que é o defeito que a marca veio corrigir. Em
 * 20/09/2026 a Real Gelateria editou o feed do Dia Nacional do Sorvete
 * (template 466), salvou, a invalidação funcionou, o cron re-renderizou — e a
 * arte saiu com a manchete anterior, porque aquele post estava sem a marca.
 * Varredura da carteira no mesmo dia: 35 posts com página PRÓPRIA e sem marca,
 * 7 deles já com a copy divergindo da página (2 ainda por publicar).
 *
 * Por isso a decisão passou a ser ESTRUTURAL, derivada do que a página É:
 *
 * - Página MODELO (`isTemplate`) é layout compartilhado — N posts saem dela e
 *   cada um carrega a sua copy. Ali os slots vencem, como sempre venceram.
 * - Página de CONTEÚDO é a peça, de um post só. Ali a página manda, marca ou
 *   não: o que estiver em `slotValues` é cópia do texto dela.
 *
 * Confere com os dados: dos 90 posts com página e `slotValues` em produção,
 * os 9 da via de template são todos `isTemplate` (abril/2026, `plan-week`) e
 * os 81 da via de conteúdo, nenhum. `applySlotValues` só troca o conteúdo de
 * camada que já existe, então página sem camada de texto renderiza igual dos
 * dois lados — não há caso em que ignorar os slots apague texto da arte.
 *
 * A marca continua valendo e é o sinal mais forte: ela recusa os slots até em
 * página modelo. O que ela deixou de ser é OBRIGATÓRIA.
 */
export function slotValuesParaRender(
  slotValues: unknown,
  paginaEhModelo: boolean,
): Record<string, unknown> | undefined {
  if (!slotValues || typeof slotValues !== 'object' || Array.isArray(slotValues)) return undefined
  if (ehCopiaDaPagina(slotValues)) return undefined
  // A página é a peça: nada dela vem do post.
  if (!paginaEhModelo) return undefined
  return Object.keys(slotValues).length > 0 ? (slotValues as Record<string, unknown>) : undefined
}

/** Só os valores de TEXTO de um `slotValues` (string, ou objeto com `content`). */
export function textosDoSlot(slotValues: unknown): Record<string, string> | null {
  if (!slotValues || typeof slotValues !== 'object' || Array.isArray(slotValues)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(slotValues as Record<string, unknown>)) {
    // `_driveImageId`, `_copiaDaPagina` e afins são metadado do slot, não texto de camada.
    if (k.startsWith('_')) continue
    if (typeof v === 'string') out[k] = v
    else if (v && typeof v === 'object' && typeof (v as { content?: unknown }).content === 'string') {
      out[k] = (v as { content: string }).content
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizar(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * A copy do post é a copy da página? Mesmas chaves de texto, mesmos textos
 * (espaço em branco colapsado). Chave que só um dos lados tem já é diferença.
 */
export function copyIgual(
  a: Record<string, string> | null,
  b: Record<string, string> | null,
): boolean {
  if (!a || !b) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && normalizar(a[k]) === normalizar(b[k]))
}

/**
 * O `slotValues` novo: os textos passam a ser os da página; o que não é
 * texto (`_driveImageId`, a marca `_copiaDaPagina`, objeto com `fileUrl`) fica
 * como estava. Texto cujo papel sumiu da página sai junto.
 */
export function slotValuesSeguindo(
  slotValues: unknown,
  copyDepois: Record<string, string>,
): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  if (slotValues && typeof slotValues === 'object' && !Array.isArray(slotValues)) {
    for (const [k, v] of Object.entries(slotValues as Record<string, unknown>)) {
      const ehTexto =
        !k.startsWith('_') &&
        (typeof v === 'string' ||
        (v && typeof v === 'object' && typeof (v as { content?: unknown }).content === 'string'))
      if (!ehTexto) base[k] = v
    }
  }
  return { ...base, ...copyDepois }
}
