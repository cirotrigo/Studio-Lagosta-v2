/**
 * A PORTA DA REFERÊNCIA — a peça avulsa quando a bancada tem uma arte
 * escolhida a seguir. O modelo recebe DUAS imagens (a foto e a arte aprovada)
 * e um prompt de cinco linhas.
 *
 * É o vencedor da medição de 07-08/09/2026 (`docs/PLANO-2026-09-05-ARTES-COMO-
 * O-CHATGPT.md`, estratégias A/B/C/D nos nove clientes, duas rodadas): foto +
 * referência + copy, sem manual, sem prancha, sem âncora, sem planejador. O
 * Ciro descreveu a receita antes de medir — "o correto é enviar a arte
 * escolhida de referência e a copy que o usuário escreveu" — e a medição
 * confirmou: cada imagem a mais e cada regra a mais deixaram a peça pior.
 *
 * O que o prompt tem, e por quê:
 *  - A foto é a Image 1 e "exactly as it is": a Image 1 é a base que o
 *    `images.edit` preserva, e é essa frase que segura a cena (o modo livre
 *    apagou as pessoas de um salão quando ela faltou, 07/09).
 *  - "Only the photograph and the words change": a arte de referência manda
 *    em tipografia, cor, ornamento, logo E layout. Modo livre (`modelo-livre`)
 *    tira o layout da lista.
 *  - TRAVA DUPLA sobre a referência: o texto dela é de um post antigo e a cena
 *    dela não é conteúdo. Medido em 17/08 e de novo em 07/09: sem a trava o
 *    horário e o endereço do post antigo vazam para a peça nova.
 *  - A copy por ÚLTIMO, cada bloco entre aspas numa linha: string literal
 *    vence regra (lei da caixa, 16-17/08), então a caixa já vem decidida na
 *    string (`copyComCaixaDaMarca`), nunca em prosa.
 *  - Sem proibição além das duas travas. "Já erramos antes em enviar várias
 *    proibições e negativas no prompt" (Ciro, 07/09).
 *
 * Em inglês porque é o idioma em que o gpt-image foi medido nesta casa; o
 * prompt do MANUAL (`prompt-do-manual.ts`) é em português porque quem o lê e
 * edita é gente, e ele nasceu de um texto do Ciro.
 *
 * Módulo PURO (sem Prisma), mesma razão de `art-direction.ts`.
 */

export interface PromptDaReferenciaArgs {
  /** Nome da marca como aparece para o cliente. */
  marca: string
  /** Blocos da copy, já na caixa da marca (`copyComCaixaDaMarca`). */
  copy: string[]
  formato?: 'story' | 'feed' | 'quadrado'
  /**
   * A logo é COLADA pelo sistema depois (`logoMode: 'compor'`): a da
   * referência não entra na lista do que se herda, e a trava diz que ela
   * pertence ao post antigo. O canto reservado vem no bloco de logo do
   * runner (`instrucaoAreaReservada`), colado logo depois deste prompt.
   */
  logoColadaDepois?: boolean
  /** Modo livre: a referência manda no estilo, e a posição é do modelo lendo a foto. */
  layoutLivre?: boolean
  /** Alteração pedida na FOTO — a única exceção ao "exactly as it is". */
  instrucaoImagem?: string | null
  /** Observação livre de quem pediu a peça. */
  pedido?: string | null
  /** Índice (1-based) da imagem em que a FOTO chega ao modelo. */
  indiceDaFoto?: number
  /** Índice (1-based) da imagem em que a REFERÊNCIA chega ao modelo. */
  indiceDaReferencia?: number
}

const PECA = {
  story: { tamanho: '1080x1920 Instagram Story', nome: 'Story' },
  feed: { tamanho: '1080x1350 Instagram feed post', nome: 'feed post' },
  quadrado: { tamanho: '1080x1080 Instagram square post', nome: 'square post' },
} as const

export function montarPromptDaReferencia({
  marca,
  copy,
  formato = 'story',
  logoColadaDepois = false,
  layoutLivre = false,
  instrucaoImagem,
  pedido,
  indiceDaFoto = 1,
  indiceDaReferencia = 2,
}: PromptDaReferenciaArgs): string {
  const peca = PECA[formato] ?? PECA.story
  const blocos = copy.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const ajuste = instrucaoImagem?.trim()
  const nota = pedido?.trim()

  const foto = ajuste
    ? `Image ${indiceDaFoto} is the photograph for a ${peca.tamanho} of ${marca}. Use it as the background. The ONLY change allowed to the photograph is this one, requested by the client: ${ajuste}. Everything else in it stays exactly as it is.`
    : `Image ${indiceDaFoto} is the photograph for a ${peca.tamanho} of ${marca}. Use it as the background, exactly as it is.`

  const herdado = [
    'typography',
    'colours',
    'ornaments',
    ...(logoColadaDepois ? [] : ['logo']),
    ...(layoutLivre ? [] : ['layout']),
  ]
  const lista = `${herdado.slice(0, -1).join(', ')} and ${herdado[herdado.length - 1]}`
  const referencia = layoutLivre
    ? `Image ${indiceDaReferencia} is an approved ${marca} ${peca.nome} — the design model. Give the new piece the same ${lista} as Image ${indiceDaReferencia}; compose the layout for THIS photograph, placing the text where the image is calm and never over its subject. Nothing from Image ${indiceDaReferencia}'s scene or text appears here.`
    : `Image ${indiceDaReferencia} is an approved ${marca} ${peca.nome} — the design model. Give the new piece the same ${lista} as Image ${indiceDaReferencia}. Only the photograph and the words change: nothing from Image ${indiceDaReferencia}'s scene or text appears here.`

  const trava =
    `Two hard limits on Image ${indiceDaReferencia}: every word, number, price, date or headline lettered in it belongs to that OLD post — never copy, adapt or echo any of it; and nothing from its photo, dish, people or objects appears here.` +
    (logoColadaDepois
      ? ` Its logo is not content either: this piece carries NO brand mark at all — the official file is placed by the system afterwards.`
      : '')

  const observacao = nota ? `Note from the client, to honour without breaking the model: ${nota}` : null

  const copyBloco =
    `Render exactly ${blocos.length === 1 ? 'this copy block' : `these ${blocos.length} copy blocks`}, each once, and nothing else — the piece letters EXCLUSIVELY these lines:\n` +
    blocos.map((b) => `"${b}"`).join('\n')

  return [foto, referencia, trava, observacao, copyBloco].filter((s): s is string => !!s).join('\n')
}
