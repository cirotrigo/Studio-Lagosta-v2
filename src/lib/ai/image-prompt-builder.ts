/**
 * Montagem e validação de prompts para a GERAÇÃO de arte do zero (Fase 1 do
 * plano docs/PLANO-2026-08-09-GERACAO-IA-E-BANCADA.md).
 *
 * Duas trilhas que nunca se misturam — a divisão veio das skills human-* e do
 * insta-automatico, os dois sistemas que produzem a melhor imagem hoje:
 *
 * - `imagem` (Trilha A): fotografia/cena SEM texto nenhum. Prompt em inglês,
 *   denso e físico (Kelvin, graus, IRE), escrito por um LLM "diretor de
 *   fotografia" e validado aqui. Vai para o Gemini (nano-banana).
 * - `arte` (Trilha B): peça com lettering integrado. Prompt em português no
 *   estilo do insta-automatico (que roda em produção há meses para exatamente
 *   este caso), com a copy verbatim. Vai para o gpt-image-2 `images.edit`.
 *
 * A regra-mãe das referências (aprendida a caro no Espeto Gaúcho, 07/08/2026):
 * A ÂNCORA MANDA, O PROMPT SÓ DESCREVE A AÇÃO. Descrever arquitetura por
 * texto faz o modelo inventar um lugar genérico — o prompt manda COPIAR as
 * fotos-âncora e gasta as palavras na ação, nunca no cenário.
 */

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { BrandContext } from '@/lib/brand/brand-context'
import { CAIXA_DA_MANCHETE, paraCaixaAlta, paraCaixaNatural } from '@/lib/ai/caixa-da-copy'
import { elementosQueFazemSentido, instrucaoDeServico } from '@/lib/ai/blocos-de-servico'
import { modeloLivre } from '@/lib/ai/modelo-livre'

export type GenerationTrack = 'imagem' | 'arte'

/**
 * Papel de cada imagem de referência. A ordem de envio é SEMPRE
 * subject → âncoras → style → brand-card → type-specimen → logo
 * (ver `orderReferences`).
 */
export type ArtReferenceRole =
  | 'subject' // a foto do prato/produto — é a cena final da arte
  | 'anchor-ambient' // foto real do ambiente: a cena acontece NESTE lugar
  | 'anchor-dish' // segunda foto real do prato (outro ângulo/detalhe)
  | 'style' // referência de estilo/tonalidade (arte já aprovada, grid do feed)
  | 'style-guide' // MODELO escolhido à mão: manda no look E na diagramação
  | 'series-guide' // slide-guia do carrossel: define o look de toda a série
  | 'brand-card' // carta de identidade renderizada (logo + paleta + fontes)
  | 'type-specimen' // prancha com o alfabeto completo das fontes reais (type-specimen.ts)
  | 'logo' // logo em alta, para a trilha `arte`

/** Tetos por papel — "várias refs competindo causam deriva visual". */
export const MAX_SUBJECT_REFS = 1
export const MAX_ANCHOR_REFS = 3
export const MAX_STYLE_REFS = 2

export interface ArtReferenceDescriptor {
  /**
   * Elementos a NÃO reproduzir desta referência (A3). Ex.: "garrafa de molho",
   * "lata de refrigerante" — marca de terceiro que aparece na foto e não pode
   * ir para a peça.
   */
  excluir?: string[]
  role: ArtReferenceRole
  label?: string
  /**
   * Só em `style-guide`: o modelo passa o ESTILO e deixa o layout livre
   * (`modelo-livre.ts`). Muda o preâmbulo — o texto estrito promete "same
   * placement... in the same minute", que é exatamente o que o modo livre
   * revoga; prometer as duas coisas seria ordem contraditória.
   */
  estiloLivre?: boolean
}

/**
 * Buzzwords banidas (skills human-image §2.1): o modelo responde a física,
 * não a adjetivo — cada uma dessas palavras é ruído que empurra para o
 * genérico. O validador reprova o prompt que as contém.
 */
export const BANNED_BUZZWORDS = [
  'cinematic',
  'epic',
  'beautiful',
  'dramatic',
  'stunning',
  'moody',
  'ethereal',
  'perfect composition',
  'gorgeous',
  'breathtaking',
  'masterpiece',
  'award-winning quality',
  'best quality',
  '4k',
  '8k',
  'hyperrealistic',
  'ultra detailed',
] as const

/**
 * Termos que o filtro de conteúdo dos modelos lê como carne crua e bloqueia
 * (falso positivo recorrente, documentado nas runs do Espeto Gaúcho). A regra
 * prática: comida sempre "fully roasted, deeply browned".
 */
export const RISKY_FOOD_TERMS = ['rare meat', 'raw meat', 'pink center', 'bloody', 'juicy pink'] as const

/**
 * Teto de tamanho do prompt da trilha `imagem`.
 *
 * Era 1500, herdado da regra editorial das skills ("denso, não longo"), e
 * produzia o pior dos dois mundos: quem LIA a descrição da tool se limitava e
 * cortava as proibições — que são justamente o que segura o DNA —, enquanto
 * quem ignorava passava, porque isto NUNCA bloqueou nada. `validateImagePrompt`
 * só devolve `issues`, e o runner apenas loga `console.warn`.
 *
 * 4000 é o tamanho em que uma direção de fotografia COMPLETA cabe: câmera,
 * lente, luz em Kelvin, ação, fundo, tratamento e a lista de proibições. Os
 * prompts reais da produção do By Rock tinham ~2.900.
 *
 * ⚠️ Continua sendo AVISO, não bloqueio — e a descrição da tool agora diz isso.
 * Prompt longo demais é problema de qualidade, não de segurança: quem escreve
 * mal desperdiça a própria geração.
 */
export const IMAGE_PROMPT_MAX_CHARS = 4000

const REQUIRED_IMAGE_PARAGRAPHS = ['CAMERA:', 'LIGHT:', 'SUBJECT:', 'POST BEHAVIOR:'] as const

export interface PromptValidationResult {
  ok: boolean
  issues: string[]
}

/**
 * Valida o prompt da trilha `imagem` (o da trilha `arte` é montado por
 * template determinístico e não precisa de validação).
 */
export function validateImagePrompt(prompt: string): PromptValidationResult {
  const issues: string[] = []
  const lower = prompt.toLowerCase()

  for (const word of BANNED_BUZZWORDS) {
    // \b não pega "4k"/"8k" isolado de números; a busca simples com fronteira
    // manual cobre os dois casos.
    const re = new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i')
    if (re.test(lower)) issues.push(`buzzword banida: "${word}"`)
  }

  for (const term of RISKY_FOOD_TERMS) {
    if (lower.includes(term)) {
      issues.push(`termo de comida que dispara o filtro de conteúdo: "${term}" (use "fully roasted, deeply browned")`)
    }
  }

  if (prompt.length > IMAGE_PROMPT_MAX_CHARS + 300) {
    // Folga de 300: o preâmbulo de referências é somado depois e não conta
    // no orçamento criativo do LLM.
    issues.push(`prompt longo demais (${prompt.length} chars; teto ${IMAGE_PROMPT_MAX_CHARS})`)
  }

  for (const paragraph of REQUIRED_IMAGE_PARAGRAPHS) {
    if (!prompt.includes(paragraph)) issues.push(`parágrafo obrigatório ausente: ${paragraph}`)
  }

  return { ok: issues.length === 0, issues }
}

/** Ordena as referências no contrato fixo: subject → âncoras → style → brand-card → type-specimen → logo. */
export function orderReferences<T extends ArtReferenceDescriptor>(refs: T[]): T[] {
  const rank: Record<ArtReferenceRole, number> = {
    subject: 0,
    'anchor-dish': 1,
    'anchor-ambient': 2,
    style: 3,
    'style-guide': 4,
    'series-guide': 5,
    'brand-card': 6,
    'type-specimen': 7,
    logo: 8,
  }
  return [...refs].sort((a, b) => rank[a.role] - rank[b.role])
}

/**
 * Preâmbulo que declara o papel de cada imagem — prefixado pelo BACKEND, nunca
 * deixado a cargo do LLM (padrão do prompt_with_reference_rules da human-social:
 * confiar que o modelo lembre o papel das refs é como as peças derivam).
 *
 * Em inglês nas duas trilhas: é a língua dos modelos de imagem, e o preâmbulo
 * fala com o modelo de imagem mesmo quando o corpo do prompt é PT.
 */
export function buildReferencePreamble(refs: ArtReferenceDescriptor[]): string {
  if (refs.length === 0) return ''
  const ordered = orderReferences(refs)
  const lines: string[] = []
  let n = 1
  for (const ref of ordered) {
    const idx = `Image ${n++}`
    /**
     * Exclusões declaradas nesta referência (A3).
     *
     * Existe porque dizer "não copie a garrafa" DENTRO do pedido não funcionou:
     * na produção do By Rock a garrafa de Tabasco da foto de referência vazou
     * para a mesa final em 2 de 6 peças, nítida e com rótulo legível, apesar da
     * instrução explícita. Marca de terceiro em destaque é limite de DNA.
     *
     * A linha entra colada à referência de que ela fala — e não num bloco geral
     * de proibições — porque o modelo precisa saber de QUAL imagem tirar o
     * objeto. Escrita depois da descrição do papel, para ser a última coisa
     * lida sobre aquela imagem.
     */
    const excluir = (ref.excluir ?? []).map((e) => e.trim()).filter(Boolean)
    const linhaDeExclusao = excluir.length
      ? ` DO NOT reproduce these elements from ${idx}, even if they are clearly visible in it: ${excluir.join('; ')}. Remove them from the scene entirely — do not replace them with similar objects.`
      : ''
    switch (ref.role) {
      case 'subject':
        lines.push(
          `${idx} is the REAL photo of the dish/product${ref.label ? ` (${ref.label})` : ''}. It is the FINAL SCENE of the piece: do not recreate, replace or "improve" it. The owner must recognize their own dish.${linhaDeExclusao}`,
        )
        break
      case 'anchor-dish':
        lines.push(
          `${idx} is a second REAL photo of the same dish${ref.label ? ` (${ref.label})` : ''} — use it only to stay faithful to the dish's true appearance.${linhaDeExclusao}`,
        )
        break
      case 'anchor-ambient':
        // Referência de LUGAR, nunca de ENQUADRAMENTO. A redação anterior
        // ("reproduce ... EXACTLY as they appear") foi lida pelo modelo como
        // ordem de recriar a FOTO: saíam cenas em grande-angular, com o teto
        // no quadro e a comida da própria referência incorporada à composição,
        // com o prato novo colado por cima. Os dois limites abaixo (a) e (b)
        // são o que separa "preservar o salão" de "copiar a fotografia".
        lines.push(
          `${idx} is a REAL photograph of the restaurant environment${ref.label ? ` (${ref.label})` : ''}. Use it to keep the PLACE truthful: architecture, furniture, table-top material (its colour, texture and finish), wall and floor materials, fixtures, and the quality, direction and colour of the light. Two hard limits. (a) It is a reference of PLACE, never of FRAMING — do not copy its camera height, angle, focal length or composition, and never feel obliged to show the ceiling or the whole room. Choose the camera that serves the dish. (b) Any food, plate, glass or tableware visible in it is NOT part of the new scene: ignore it entirely as content. Every dish in the final image comes from the dish reference and belongs to the menu being photographed. Preserve the physical geometry of the room: a table stays at its real height and on the same spatial plane as the other tables, perspective lines stay coherent, and the scale between table, chairs, people and objects stays realistic. Never re-material a surface — a stone, metal or laminate top must not become wood.${linhaDeExclusao}`,
        )
        break
      case 'style':
        // Limites DUROS no molde da âncora de ambiente. "NOT its content"
        // sozinho não segurava: a referência de estilo é uma PEÇA PRONTA cheia
        // de texto, e o modelo copiava headline/serviço dela para a arte nova
        // em vez de seguir só a copy verbatim (relatado pelo Ciro em
        // 13/08/2026, na fila da bancada com arte de referência escolhida).
        // A regra vai COLADA à imagem — dizer "nada a mais" no bloco de copy
        // não bastou, mesma lição da garrafa de Tabasco.
        lines.push(
          `${idx} is a STYLE reference${ref.label ? ` (${ref.label})` : ''} — an earlier piece from this brand's feed. Match the GRAPHIC LAYER: same tonal register, same level of stylization, same graphic mood. This never licenses regrading the photo you were given — its exposure, contrast and colour stay exactly as they are, even if this reference is lighter or darker. Two hard limits. (a) Its TEXT is not content: every word, number, price, date or headline lettered in it belongs to that OLD post. Never copy, adapt or echo any text from this image — the new piece letters EXCLUSIVELY the copy blocks listed in this prompt, and if none is listed, no text at all. (b) Its photo, dish, people and objects are not content: nothing from this image appears in the new scene. Whenever this reference conflicts with the copy list or with the real photo provided, the copy list and the real photo win.${linhaDeExclusao}`,
        )
        break
      // A referência ESCOLHIDA À MÃO na bancada. Papel próprio, e não `style`,
      // porque as duas coisas são pedidos diferentes: `style` combina clima e
      // deixa a diagramação livre; aqui a pessoa apontou uma peça e disse
      // "faça parecida com esta" — e o preâmbulo de `style`, que fala só em
      // "tonal register, luminosity and graphic mood", nunca prometeu layout.
      // Relatado pelo Ciro em 16/08/2026 na Real Gelateria: modelo escolhido,
      // arte saindo com outra diagramação e a headline em caixa alta contra o
      // Title Case do modelo.
      case 'style-guide':
        lines.push(
          ref.estiloLivre
            ? // Modo livre (`modelo-livre.ts`): o modelo veste o texto; o
              // layout é do gerador, lendo a foto. Mesmos dois limites duros.
              `${idx} is the STYLE MODEL${ref.label ? ` (${ref.label})` : ''} — an approved piece from this brand. Match how its text is DRESSED: the same typefaces per level, the same case per level, the same colour per level, the same size proportions between levels, the same ornaments and overall restraint. Do NOT copy its layout: WHERE each block sits in the new piece is your decision, made by reading the new photo — the subject of the photo is never covered by text. Two hard limits. (a) Its TEXT is not content: every word, number, price, date or headline lettered in it belongs to that OLD post. Never copy, adapt or echo any text from this image — the new piece letters EXCLUSIVELY the copy blocks listed in this prompt. (b) Its photo, dish, people and objects are not content: nothing from this image appears in the new scene.${linhaDeExclusao}`
            : `${idx} is the MODEL to follow${ref.label ? ` (${ref.label})` : ''} — an approved piece from this brand, hand-picked for this job. Side by side with it, the new piece must look laid out by the SAME designer, in the same minute: same placement of the text block, same alignment, same typographic case per level, same colour per level, same ornaments, same reading veil. Two hard limits. (a) Its TEXT is not content: every word, number, price, date or headline lettered in it belongs to that OLD post. Never copy, adapt or echo any text from this image — the new piece letters EXCLUSIVELY the copy blocks listed in this prompt. (b) Its photo, dish, people and objects are not content: nothing from this image appears in the new scene. Copy its LAYOUT, never its content.${linhaDeExclusao}`,
        )
        break
      case 'series-guide':
        lines.push(
          `${idx} is the APPROVED GUIDE SLIDE of this carousel${ref.label ? ` (${ref.label})` : ''}. Side by side with it, this slide must look shot in the SAME session and laid out by the SAME designer.`,
        )
        break
      case 'brand-card':
        lines.push(
          `${idx} is the brand identity card: it shows the official logo, color palette and typography samples. It is the ONLY source for fonts and graphic-layer colors. The logo in it is there so you RECOGNIZE the brand — never redraw or reproduce it in the piece.`,
        )
        break
      case 'type-specimen':
        lines.push(
          `${idx} is the official TYPE SPECIMEN sheet${ref.label ? ` (${ref.label})` : ''}: the complete alphabet — uppercase, lowercase, accents and numerals — of each official font of this brand, rendered from the real font files. When lettering ANY text in the piece, shape every glyph EXACTLY as it appears here: same skeleton, same contrast, same terminals. Together with the identity card, it is the ONLY source of letterforms. Never copy this sheet's layout, background, colors or sample strings into the piece.`,
        )
        break
      case 'logo':
        // O papel `logo` só entra no image[] quando o modo é `modelo` — no modo
        // `compor` a logo nem chega ao modelo. Por isso aqui o texto MANDA
        // reproduzir: um preâmbulo que proibisse desenhar, junto de um bloco de
        // prompt que manda desenhar, é ordem contraditória.
        //
        // Soletração e ligadura explícitas desde 14/08/2026: a ligadura E+R do
        // TERO foi "desdobrada" pelo modelo e a arte saiu "TERRO" com tagline
        // "BRASAL E VINHO" — copiar a FORMA não basta como instrução quando a
        // marca é um wordmark com letras emendadas.
        lines.push(
          `${idx} is the OFFICIAL LOGO file${ref.label ? ` (${ref.label})` : ''}. Reproduce it in the piece EXACTLY as it appears here — same shape, same proportions, same letterforms, same colors. Never redraw, restyle or simplify it, and never letter the brand name in a different typeface. SPELLING IS SACRED: copy the wordmark and its tagline letter-for-letter as they appear in this file — never add, double, swap or drop a single letter; check your lettering against the file before finishing. Where two letters share a stroke (a ligature), draw them as ONE fused shape exactly like the file — never expand a ligature into separate or repeated letters.`,
        )
        break
    }
  }
  return lines.join('\n')
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trilha A — `imagem`: prompt de diretor de fotografia via LLM
 * ──────────────────────────────────────────────────────────────────────────── */

/** Modelo de texto que escreve o prompt de imagem. */
const PROMPT_WRITER_MODEL = process.env.OPENAI_PROMPT_MODEL || 'gpt-4o'

const IMAGE_PROMPT_SYSTEM = `Você é um Diretor de Fotografia. Escreve prompts de geração de imagem para modelos modernos (Gemini image / gpt-image), em INGLÊS, seguindo religiosamente esta anatomia — cada parágrafo abre com o header em CAPS e dois pontos, nesta ordem:

CAMERA: corpo, ISO, posição física da câmera (baixa, hip-level, oblíqua — nunca altura-dos-olhos neutra sem motivo).
LENS: modelo, focal, T-stop, distância, comportamento do foco.
LIGHT: fonte motivada, temperatura em Kelvin, direção em graus, comportamento da sombra, IRE aproximado.
SUBJECT: o sujeito e a ação. Quando houver fotos de referência, referencie-as ("from the reference photos") em vez de descrever o que elas já mostram.
FOREGROUND: zona próxima, textura, dissolução do foco.
MIDGROUND: zona do sujeito.
BACKGROUND: profundidade, bokeh.
MATERIAL PHYSICS: como superfícies e materiais reagem à luz (vapor, brilho do molho, condensação no copo, gordura caramelizada).
POST BEHAVIOR: tratamento final — grão (sempre visível/orgânico, nunca "subtle"), curva de contraste, saturação, prioridade de midtone.
COMPOSITIONAL GEOMETRY: peso visual, assimetria, espaço negativo (deixe área calma para texto quando pedido).
MOOD & ART DIRECTION: Composition and art direction inspired in the work of award-winning directors.

REGRAS DURAS:
- Física, não adjetivo: Kelvin, IRE, graus, T-stop. PROIBIDO: ${BANNED_BUZZWORDS.join(', ')}.
- Máximo ${IMAGE_PROMPT_MAX_CHARS} caracteres. Denso, cada palavra trabalha.
- ZERO texto na imagem: nenhuma letra, número, logo ou watermark.
- Comida SEMPRE "fully roasted / deeply browned / golden" — nunca ${RISKY_FOOD_TERMS.join(', ')} (filtro de conteúdo bloqueia).
- Sem rostos reconhecíveis e sem crianças, a menos que o pedido exija.
- A ÂNCORA MANDA O LUGAR, NÃO O ENQUADRAMENTO: quando existem fotos reais de ambiente, NÃO descreva a arquitetura — escreva "the scene happens in the exact environment shown in the reference photographs" e gaste as palavras na AÇÃO e na luz. Mas a câmera é SUA escolha: a foto de referência não dita altura, ângulo, distância nem focal, e não obriga a mostrar o teto ou o salão inteiro.
- É FOTOGRAFIA GASTRONÔMICA, não colagem: o prato é o sujeito. Salvo pedido em contrário, câmera a ~45° sobre a mesa, prato preenchendo o quadro, profundidade de campo rasa e o salão atrás como contexto desfocado. Evite grande-angular aberta.
- FÍSICA DE APOIO (o que mais denuncia montagem): o prato REPOUSA sobre a mesa — base inteira em contato com o tampo, elipse do prato coerente com a perspectiva da câmera, sombra de contato e oclusão sob a borda, reflexo do tampo quando o material pedir. Nada de prato flutuando, inclinado fora do plano da mesa, ou em escala errada em relação a talheres e copos.
- HUMANIZAR É BEM-VINDO quando couber: outros pratos do mesmo menu sobre a mesa, mãos usando talheres, alguém servindo um acompanhamento, clientes ao fundo em desfoque com ocupação moderada do salão — nunca casa lotada, nunca rosto em foco.
- O estilo e a luminosidade vêm da direção fotográfica da marca e das referências, nunca do tema do post (refs claras → imagem clara).
- Saída: SÓ o prompt, sem markdown, sem preâmbulo, sem comentários.`

export interface BuildImagePromptArgs {
  /** Pedido em português (ex.: "story do happy hour com o chopp gelado"). */
  pedido: string
  brand: BrandContext | null
  refs: ArtReferenceDescriptor[]
  /** Proporção alvo (ex.: "9:16") — o LLM compõe pensando nela. */
  aspectRatio: string
  /** true quando a peça vai receber texto DEPOIS (deixar área calma). */
  reservarAreaParaTexto?: boolean
}

/**
 * Escreve o prompt da trilha `imagem` com o LLM e valida. Uma rodada de
 * reparo quando a validação reprova; persistindo o problema, remove as
 * buzzwords mecanicamente — prompt imperfeito é melhor que falha dura.
 */
export async function buildImagePromptViaLLM(args: BuildImagePromptArgs): Promise<{
  prompt: string
  issues: string[]
}> {
  const contextLines: string[] = [`PEDIDO DO CLIENTE (em português): ${args.pedido}`]
  contextLines.push(`PROPORÇÃO ALVO: ${args.aspectRatio}`)
  if (args.reservarAreaParaTexto) {
    contextLines.push('A peça vai receber bloco de texto depois: deixe área calma/escura generosa.')
  }
  if (args.brand) {
    if (args.brand.dna.photoDirection) {
      contextLines.push(`DIREÇÃO FOTOGRÁFICA DA MARCA (obedeça): ${args.brand.dna.photoDirection}`)
    }
    if (args.brand.dna.visualStyle) {
      contextLines.push(`ESTILO VISUAL DA MARCA: ${args.brand.dna.visualStyle}`)
    }
    if (args.brand.cuisineType) contextLines.push(`TIPO DE COZINHA: ${args.brand.cuisineType}`)
  }
  if (args.refs.length > 0) {
    const resumo = orderReferences(args.refs)
      .map((r, i) => `Image ${i + 1}: ${r.role}${r.label ? ` (${r.label})` : ''}`)
      .join('; ')
    contextLines.push(`FOTOS DE REFERÊNCIA ANEXADAS (papéis): ${resumo}`)
  }

  const write = async (feedback?: string) => {
    const { text } = await generateText({
      model: openai(PROMPT_WRITER_MODEL),
      system: IMAGE_PROMPT_SYSTEM,
      prompt: feedback
        ? `${contextLines.join('\n')}\n\nSEU PROMPT ANTERIOR FOI REPROVADO PELO VALIDADOR:\n${feedback}\nReescreva corrigindo TODOS os pontos.`
        : contextLines.join('\n'),
      temperature: 0.7,
      maxOutputTokens: 900,
      abortSignal: AbortSignal.timeout(45_000),
    })
    return text.trim()
  }

  let prompt = await write()
  let check = validateImagePrompt(prompt)
  if (!check.ok) {
    prompt = await write(check.issues.join('\n'))
    check = validateImagePrompt(prompt)
  }
  if (!check.ok) {
    // Último recurso mecânico: melhor um prompt sem as palavras proibidas do
    // que derrubar a geração por causa do redator.
    for (const word of BANNED_BUZZWORDS) {
      prompt = prompt.replace(new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
    }
    prompt = prompt.replace(/ {2,}/g, ' ')
  }

  return { prompt, issues: check.ok ? [] : check.issues }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Trilha B — `arte`: peça com lettering (template determinístico, em PT)
 * ──────────────────────────────────────────────────────────────────────────── */

export interface BuildArtePromptArgs {
  /** Blocos de copy, na ordem de leitura (1 bloco por linha na UI). */
  copy: string[]
  /** Pedido/instrução adicional do cliente (opcional). */
  pedido?: string
  brand: BrandContext | null
  refs: ArtReferenceDescriptor[]
  /**
   * Formato e altura da peça, para a regra de safe area.
   *
   * A safe area é do STORY: no feed o Instagram não desenha por cima, e mandar
   * reservar 1/8 do quadro ali seria margem inventada. Com a altura em mãos, a
   * regra sai em PIXEL da peça REAL — ver `regraDeSafeArea`.
   */
  formato?: 'story' | 'feed' | 'quadrado'
  alturaPx?: number
  /**
   * Instrução de ajuste da FOTO (opt-in). Sem ela vale a regra da casa: a
   * foto se melhora, nunca se modifica.
   */
  instrucaoImagem?: string | null
  /**
   * Bloco que proíbe desenhar a logo e reserva a área onde o sistema vai
   * compor o arquivo oficial (logo-compositor). Sem ele o modelo INVENTA a
   * logomarca — aconteceu com o By Rock em 09/08/2026.
   */
  blocoLogo?: string | null
  /** Papel deste slide no carrossel. Ausente = arte avulsa. */
  /**
   * Leitura por visão do MODELO escolhido à mão (peça avulsa). Só é usada
   * quando existe uma referência de papel `style-guide` — ver buildModeloSpine.
   */
  modelo?: {
    descricao?: string | null
    elementos?: string[] | null
  } | null
  carrossel?: {
    slideOrder: number
    totalSlides: number
    /** true quando este é o slide que DEFINE o look da série (o guia). */
    ehGuia: boolean
    /** true quando há um guia aprovado nas referências. */
    temGuia: boolean
    /** Camada gráfica do guia, lida por visão (carousel-guide-decoder). */
    descricaoDoGuia?: string | null
    /**
     * Elementos gráficos do guia (filete, onda, barra, ícone), soltos. Viram
     * uma ordem curta no TOPO do LOOK SPINE — ver `buildLookSpine`.
     */
    elementosDoGuia?: string[] | null
  } | null
}

/**
 * LOOK SPINE — o parágrafo que faz a série parecer uma peça só.
 *
 * Repetido verbatim em todos os slides seguintes ao guia, junto com a imagem
 * do guia como referência. É a técnica que o insta-automatico usa em produção:
 * a coerência vem de MANDAR COPIAR atributos concretos (paleta aplicada,
 * temperatura e direção da luz, tratamento, densidade do overlay, posição do
 * bloco de texto) e deixar variar só o sujeito e os textos.
 */
export function buildLookSpine(descricaoDoGuia?: string | null, elementosDoGuia?: string[] | null): string {
  // `null`/`undefined` = a visão não respondeu; `[]` = respondeu que não há
  // nenhum. Só o segundo autoriza a ordem "não acrescente elemento gráfico".
  const declarados = Array.isArray(elementosDoGuia)
  const elementos = (elementosDoGuia ?? []).map((e) => e.trim()).filter(Boolean)

  const linhas = [
    '[LOOK SPINE — COERÊNCIA ESTRITA DA SÉRIE]',
    'Este slide é uma CÓPIA do layout do slide-guia com outro sujeito e outros textos. Nada mais muda.',
  ]

  // Os elementos gráficos vão AQUI, no topo e como ordem imperativa — não só
  // como item 6 e como linha da descrição no rodapé. Medido em 10/08/2026: a
  // menção ao elemento existia três vezes no prompt e a mais específica caía
  // aos 98% do texto, atrás de 8,5 mil caracteres de DNA. Citar não bastava:
  // era preciso citar CEDO e no imperativo.
  if (elementos.length > 0) {
    linhas.push(
      '',
      `⚠️ DESENHE ESTES ELEMENTOS GRÁFICOS, obrigatoriamente — eles são a assinatura da série e ESTE slide precisa tê-los, iguais aos do guia:`,
      ...elementos.map((e) => `- ${e}`),
      'Não são opcionais, não são enfeite do guia e não podem ser substituídos por outro elemento.',
    )
  } else if (declarados && descricaoDoGuia) {
    linhas.push(
      '',
      '⚠️ O guia NÃO tem elemento gráfico além do texto: não acrescente filete, onda, barra, moldura nem ícone.',
    )
  }

  linhas.push(
    '',
    // Mesma razão do MODELO SPINE: é este parágrafo que manda copiar o guia,
    // então é aqui que a dúvida "copiar até onde?" nasce.
    'AS PALAVRAS NÃO SE COPIAM. Do guia vem a FORMA; as palavras vêm SÓ da copy listada acima. Linha de horário, endereço, preço ou selo escrito que exista no guia e não esteja na copy desta peça simplesmente NÃO EXISTE aqui.',
    '',
    'REPLIQUE, item a item:',
  )
  linhas.push(...[
    '1. POSIÇÃO de cada zona de texto: a mesma faixa do quadro, o mesmo lado, a mesma margem. Zonas separadas no guia continuam separadas aqui — não empilhe tudo num bloco só.',
    '2. ALINHAMENTO do texto (à esquerda, centro ou direita): idêntico ao do guia.',
    '3. HIERARQUIA: o mesmo número de níveis de texto, com a mesma proporção de tamanho entre eles.',
    '4. CAIXA de cada nível (ALTA ou baixa): igual à do nível correspondente no guia.',
    '5. COR DE CADA NÍVEL: se no guia o título é branco, aqui também é branco. Se o guia usa cor de destaque, use-a no MESMO nível hierárquico — nunca em outro, nunca numa palavra a mais, nunca numa a menos.',
    '6. ELEMENTOS GRÁFICOS (filete, onda, barra, ícone): os MESMOS, na mesma posição e no mesmo tamanho. Se o guia tem, este tem. Se o guia não tem, este não tem.',
    '7. VÉU DE LEITURA: mesma direção e mesma densidade do gradiente.',
    '8. LUZ E COR DA FOTO: mesma temperatura, mesma direção, mesmo tratamento e mesmo contraste.',
    '',
    'MUDE apenas: o sujeito da fotografia e as palavras da copy desta peça.',
    '⛔ Não "melhore" a diagramação do guia, não reequilibre a composição e não introduza variação para dar ritmo à série. Variação aqui é DEFEITO.',
    'Lado a lado com o guia, este slide precisa parecer diagramado pela mesma pessoa, no mesmo minuto.',
  ])

  // A descrição por visão do guia converte "copie o que você vê" em regra
  // verificável — sem ela o modelo escolhe sozinho onde pôr o destaque, e foi
  // assim que um slide saiu com a segunda linha em vermelho e o irmão não.
  if (descricaoDoGuia?.trim()) {
    linhas.push('', 'O QUE O GUIA FAZ (leia e repita exatamente):', descricaoDoGuia.trim())
  }

  return linhas.join('\n')
}

/**
 * MODELO SPINE — o parágrafo que faz a peça avulsa sair parecida com o MODELO
 * que a pessoa escolheu à mão na bancada.
 *
 * Irmão do LOOK SPINE, com uma diferença que não é cosmética: no slide irmão
 * de carrossel a copy tem mais ou menos a mesma forma do guia, então "copie a
 * hierarquia" é literal. Aqui não — o modelo escolhido pode ter 3 níveis de
 * texto e a peça nova ter 5 blocos (foi o caso na Real Gelateria: manchete +
 * apoio + corpo no modelo, contra manchete + apoio + rótulo + duas linhas de
 * serviço na peça nova). Por isso o item 3 manda ESTENDER o nível mais baixo
 * em vez de exigir a mesma contagem: exigir contagem igual faria o modelo
 * inventar hierarquia ou, pior, omitir bloco de copy.
 */
export function buildModeloSpine(
  descricao?: string | null,
  elementos?: string[] | null,
  /**
   * A copy desta peça. Serve para não mandar desenhar ícone de serviço numa
   * peça sem serviço — ver `elementosQueFazemSentido`.
   */
  copy: string[] = [],
): string {
  // Mesma distinção do LOOK SPINE: `[]` afirma que não há elemento gráfico;
  // ausente não afirma nada.
  const declarados = Array.isArray(elementos)
  const { manter, descartados } = elementosQueFazemSentido(elementos ?? null, copy)
  const graficos = (manter ?? []).map((e) => e.trim()).filter(Boolean)

  const linhas = [
    '[MODELO A SEGUIR — A DIAGRAMAÇÃO JÁ ESTÁ DECIDIDA]',
    'Uma das referências é o MODELO escolhido para esta peça. A diagramação dela não é sua escolha: é a do modelo, com outra foto e outros textos.',
  ]

  if (graficos.length > 0) {
    linhas.push(
      '',
      '⚠️ DESENHE ESTES ELEMENTOS GRÁFICOS, obrigatoriamente — são a assinatura do modelo:',
      ...graficos.map((e) => `- ${e}`),
      'Não são enfeite do modelo e não podem ser trocados por outro elemento.',
      // Rede final: a visão chama a marca do cliente de "selo", de "assinatura",
      // de "título" e de "ícone circular", conforme a arte (medido nas três
      // referências do O Quintal em 17/08/2026). O filtro por nome e por papel
      // pega a maioria; esta linha cobre o resto sem depender de acertar o
      // apelido — a marca só existe pelo bloco da logo, uma vez.
      '⚠️ EXCEÇÃO: se algum item acima descrever a MARCA da casa (o nome dela, um selo, um emblema, um ícone circular no rodapé), ele NÃO é ornamento e NÃO entra aqui — a marca vem exclusivamente do bloco da logo, uma única vez.',
    )
  } else if (declarados && descricao && descartados.length === 0) {
    linhas.push(
      '',
      '⚠️ O modelo NÃO tem elemento gráfico além do texto: não acrescente filete, onda, barra, moldura nem ícone.',
    )
  }

  /**
   * O ícone órfão precisa ser proibido POR NOME, não só omitido da lista.
   *
   * A descrição do modelo, mais abaixo, continua dizendo que ele tem relógio e
   * pin — e a peça de sobremesas de 17/08/2026 desenhou os dois sozinhos no
   * canto, apontando para nada. Tirar da ordem imperativa não basta: é preciso
   * dizer que aqui eles NÃO existem.
   */
  if (descartados.length > 0) {
    linhas.push(
      '',
      '⛔ O modelo tem ícone acompanhando linha de horário/endereço, e esta peça NÃO TEM essas linhas: não desenhe esses ícones. Ícone sem o texto ao lado é sujeira, não assinatura.',
    )
  }

  linhas.push(
    '',
    // A copy é a ÚNICA fonte de palavras, dito aqui e não só no bloco de copy:
    // este parágrafo é o que manda copiar o modelo, então é aqui que a dúvida
    // "copiar até onde?" nasce. Ver a nota em `descricaoDoGuia` sobre as cinco
    // peças do O Quintal que saíram com o endereço da arte de referência.
    'AS PALAVRAS NÃO SE COPIAM. Do modelo vem a FORMA (onde, em que cor, em que caixa, em que tamanho, com que ornamento); as palavras vêm SÓ da copy listada acima. Se o modelo tem uma linha de horário, de endereço, de preço ou um selo escrito e a copy desta peça não tem, essa linha simplesmente NÃO EXISTE aqui — não a reproduza, não a adapte e não a substitua por outra parecida.',
    '',
    'REPLIQUE, item a item:',
    '1. POSIÇÃO de cada zona de texto: a mesma faixa do quadro, o mesmo lado, a mesma margem. Se no modelo a manchete está no alto e o serviço no rodapé, aqui também — são zonas SEPARADAS, e juntá-las num bloco só é erro. Duas exceções, e só estas: (a) a safe area do story vence a margem do modelo, então o que nele estiver colado na borda entra aqui um pouco mais para dentro; (b) horário e endereço da copy vão no RODAPÉ mesmo que o modelo não tenha zona de serviço — nesse caso você CRIA a zona, no estilo dele.',
    '2. ALINHAMENTO do texto (à esquerda, centro ou direita): idêntico ao do modelo.',
    '3. CAIXA de cada nível (ALTA, baixa ou Title Case): igual à do nível correspondente no modelo. Esta regra vence qualquer outro palpite sobre caixa.',
    '4. HIERARQUIA: mesma proporção de tamanho e peso entre manchete, apoio e corpo. Se esta peça tem MAIS blocos de copy do que o modelo, repita o nível mais baixo do modelo para os blocos extras — nunca invente um nível novo e NUNCA omita um bloco da copy.',
    '5. COR DE CADA NÍVEL: se no modelo a manchete é clara, aqui também é. A cor de destaque entra no MESMO nível hierárquico, nunca em outro.',
    '6. ELEMENTOS GRÁFICOS (filete, losango, selo, ícone): os mesmos, na mesma posição e no mesmo tamanho relativo.',
    '7. VÉU DE LEITURA: mesma direção e mesma densidade do gradiente.',
    // Era "GRAU DE ESTILIZAÇÃO E LUMINOSIDADE: se o modelo é claro e arejado,
    // esta peça é clara e arejada" — lida como ordem de igualar a LUZ DA FOTO à
    // do modelo, ao lado de uma linha que descrevia o "contraste alto" dele. As
    // duas juntas produziram a peça do TERO que o cliente reprovou por foto
    // estourada (17/08/2026). O que se copia do modelo é a camada gráfica.
    '8. GRAU DE ESTILIZAÇÃO da CAMADA GRÁFICA: mesma densidade de texto, mesma discrição ou ousadia dos ornamentos. ⛔ Isto NÃO vale para a fotografia: a foto desta peça é a fornecida, com a luz e o contraste que ela já tem — não a retoque para parecer com a do modelo.',
    '',
    'MUDE apenas: a fotografia (que é a fornecida como cena) e as palavras da copy desta peça.',
    '⛔ Não "melhore" a diagramação do modelo, não reequilibre a composição e não varie para dar ritmo. Aqui variação é DEFEITO — a pessoa escolheu esta peça de propósito.',
  )

  // Mesma razão do LOOK SPINE: a imagem sozinha deixa o modelo decidir o que é
  // essencial; a leitura por visão vira lista de decisões verificáveis.
  if (descricao?.trim()) {
    linhas.push('', 'O QUE O MODELO FAZ (leia e repita exatamente):', descricao.trim())
  }

  return linhas.join('\n')
}

/**
 * MODELO SPINE LIVRE — o modelo passa o ESTILO; o LUGAR é do gerador.
 *
 * A alternativa ao `buildModeloSpine` para os clientes de `modelo-livre.ts`.
 * Nasceu de medição ao contrário: uma noite inteira de peças geradas com o
 * spine estrito ("same placement, same alignment, in the same minute", zonas
 * com percentuais, "variação é DEFEITO") saiu PIOR do que o fluxo antigo que
 * deixava o gpt-image compor — "o modelo já manda bem e é bem criativo, agora
 * está engessando muito" (Ciro, 17/08/2026). O gpt-image compõe melhor quando
 * lê a foto do que quando segue coordenadas.
 *
 * O que se copia continua sendo tudo o que identifica a marca: as fontes (o
 * lock cuida das famílias; aqui vai o USO delas), a caixa de cada nível, a cor
 * de cada nível, a proporção entre eles e os ornamentos. O que volta a ser do
 * gerador é ONDE cada bloco pousa — com as regras de composição (texto
 * contido, nunca sobre o assunto, safe area) como únicos limites.
 *
 * As redes de segurança do spine estrito ficam TODAS: palavras do modelo não
 * são conteúdo, cada bloco aparece uma vez, marca é só a do bloco da logo,
 * ícone de serviço sem serviço não existe.
 */
export function buildModeloSpineLivre(
  descricao?: string | null,
  elementos?: string[] | null,
  copy: string[] = [],
): string {
  const declarados = Array.isArray(elementos)
  const { manter, descartados } = elementosQueFazemSentido(elementos ?? null, copy)
  const graficos = (manter ?? []).map((e) => e.trim()).filter(Boolean)

  const linhas = [
    '[MODELO — REFERÊNCIA DE ESTILO, NÃO DE LAYOUT]',
    'Uma das referências é uma arte APROVADA desta marca, escolhida como modelo de estilo. Dela você copia COMO o texto se veste; ONDE ele pousa é decisão SUA, lendo a foto desta peça.',
    '',
    'COPIE do modelo:',
    '1. A TIPOGRAFIA em uso: quais famílias fazem manchete, apoio e serviço, com que peso.',
    '2. A CAIXA de cada nível (ALTA, baixa ou Title Case), igual à do nível correspondente.',
    '3. A COR de cada nível — a cor de destaque entra no MESMO nível hierárquico, nunca em outro.',
    '4. A PROPORÇÃO de tamanhos entre manchete, apoio e serviço. Blocos a mais na copy repetem o menor nível; nunca invente um nível novo e NUNCA omita um bloco.',
    '5. O grau de estilização: se o modelo é limpo e arejado, esta peça é limpa e arejada.',
    '',
    'NÃO COPIE do modelo:',
    '- A POSIÇÃO dos blocos. Leia ESTA foto e ponha cada bloco onde ela é calma — o canto vazio, a parede desfocada, a faixa escura. O assunto da foto NUNCA fica coberto por texto, e a foto é a protagonista: na dúvida entre um layout que mostra mais foto e um que mostra mais texto, escolha a foto.',
    '- AS PALAVRAS. Cada palavra letrada no modelo pertence àquele post antigo: o texto desta peça é SÓ a copy listada acima, cada bloco UMA única vez.',
  ]

  if (graficos.length > 0) {
    linhas.push(
      '',
      'Os ORNAMENTOS do modelo (são a assinatura dele — desenhe-os acompanhando o texto, onde quer que ele pouse):',
      ...graficos.map((e) => `- ${e}`),
      '⚠️ Se algum descrever a MARCA da casa (nome, selo, emblema), ele NÃO é ornamento: a marca vem exclusivamente do bloco da logo, uma única vez.',
    )
  } else if (declarados && descricao && descartados.length === 0) {
    linhas.push('', 'O modelo NÃO tem ornamento além do texto: não acrescente filete, barra, moldura nem ícone.')
  }
  if (descartados.length > 0) {
    linhas.push(
      '',
      '⛔ O modelo tem ícone acompanhando linha de horário/endereço, e esta peça NÃO TEM essas linhas: não desenhe esses ícones.',
    )
  }

  // A leitura por visão chega SEM posições (`semPosicoes`) — só estilo.
  if (descricao?.trim()) {
    linhas.push('', 'O ESTILO do modelo, lido nível a nível:', descricao.trim())
  }

  return linhas.join('\n')
}

/**
 * TYPOGRAPHY LOCK — descrição travada da tipografia, copiada igual em todo
 * slide.
 *
 * Sem isto o modelo escolhe uma fonte "parecida" diferente a cada slide, e o
 * carrossel sai com três tipografias. A regra veio das skills: descrição vaga
 * é reinterpretada; descrição travada e repetida verbatim, não.
 *
 * 🔴 O lock trava a FAMÍLIA, nunca a CAIXA. Até 16/08/2026 a linha do título
 * dizia "caixa alta" para TODA marca — instrução curta e imperativa aos 36% do
 * prompt, contra a regra da própria marca enterrada aos 62%, no meio de 9.180
 * caracteres de DNA (54% do prompt). O hardcode ganhava: a Real Gelateria pede
 * "caixa alta moderada ou Title Case" e recebia TERÇA MERECE em caixa alta
 * cheia, contra o modelo Title Case que a pessoa tinha escolhido.
 *
 * Medido nos 11 clientes em 16/08/2026: 10 declaram a própria caixa no DNA, e
 * em 4 deles o hardcode contradizia o que estava escrito (Real Gelateria e
 * Wine Vix pedem Title Case; O Quintal proíbe caixa alta contínua fora de uma
 * fonte específica; Empório Fonseca pede caixa mista na promessa). Ou seja: a
 * linha era redundante onde acertava e mandava onde errava.
 */
export function buildTypographyLock(brand: BrandContext | null): string {
  if (!brand) return ''
  const linhas: string[] = ['[TIPOGRAFIA TRAVADA — IDÊNTICA EM TODOS OS SLIDES]']
  if (brand.fonts.title) {
    linhas.push(`- Títulos: ${brand.fonts.title}, peso máximo, entrelinha curta.`)
  }
  const apoio = brand.fonts.subtitle ?? brand.fonts.body
  if (apoio) linhas.push(`- Subtítulos e apoio: ${apoio}.`)
  if (brand.fonts.body) linhas.push(`- Corpo e serviço: ${brand.fonts.body}.`)
  if (linhas.length === 1) return ''
  linhas.push(
    'Use EXATAMENTE estas famílias, com o mesmo peso e a mesma escala relativa em todos os slides. Nunca substitua por fonte parecida e nunca varie de um slide para o outro.',
    // Sem esta linha o gpt-image cai sozinho em caixa alta na manchete, que é
    // o default dele — tirar o hardcode não basta, é preciso dizer de onde a
    // caixa vem.
    'CAIXA das letras (ALTA, baixa ou Title Case): NÃO é livre e NÃO tem padrão. Ela vem da identidade desta marca descrita abaixo e, quando houver um modelo a seguir, do modelo. Nunca escolha caixa alta por ser manchete.',
  )
  return linhas.join('\n')
}

/**
 * Fração da altura reservada em cima e embaixo no story.
 *
 * 12,5% (1/8) de 1920 dá 240px, que é a ordem de grandeza da faixa que o
 * Instagram cobre com o nome do perfil em cima e os controles de resposta
 * embaixo.
 */
const FAIXA_RESERVADA = 0.125

/**
 * A regra 9, escrita para a peça que está sendo gerada.
 *
 * 🔴 Em PIXEL da peça REAL, e não só em fração. A versão só-fração ainda deixou
 * logo e CTA terminando entre 93% e 95% da altura nas cinco peças do O Quintal
 * (17/08/2026) — a arte de referência do cliente tem a marca quase colada na
 * borda de baixo, e a IMAGEM vence a prosa. Contra imagem, o que resta é um
 * número que dá para conferir: "nada abaixo de 1694px" é verificável, "o último
 * oitavo" é interpretável. É o mesmo princípio de física-não-adjetivo que
 * governa o prompt da trilha `imagem`.
 *
 * Sem `alturaPx` a regra sai em fração, como antes — o chamador que não informa
 * o tamanho não perde a regra.
 */
export function regraDeSafeArea(formato?: 'story' | 'feed' | 'quadrado', alturaPx?: number): string {
  // Feed e quadrado não têm safe area: o Instagram não desenha por cima deles.
  // Reservar 1/8 ali seria margem inventada, e margem inventada come a peça.
  if (formato && formato !== 'story') {
    return '9. MARGENS DO FEED: nada de texto, filete ou logo encostado na borda — margem mínima de ~6% da largura em todos os lados. O Instagram não desenha por cima da peça de feed, então não há faixa reservada: use o quadro inteiro dentro dessa margem.'
  }

  const emPixel = (() => {
    if (!alturaPx || !Number.isFinite(alturaPx)) return null
    const topo = Math.round(alturaPx * FAIXA_RESERVADA)
    const base = Math.round(alturaPx * (1 - FAIXA_RESERVADA))
    return { topo, base }
  })()

  return [
    '9. SAFE AREA DO STORY — o Instagram DESENHA POR CIMA da peça: o nome do perfil e o avatar no topo, os controles de resposta no rodapé.',
    emPixel
      ? `Esta peça tem ${alturaPx}px de altura. NADA acima de ${emPixel.topo}px e NADA abaixo de ${emPixel.base}px: nenhuma letra, nenhum filete, nenhum ícone e NENHUMA LOGO — nem de raspão. O elemento mais baixo da arte (seja o CTA, a linha de endereço ou a marca) termina ANTES de ${emPixel.base}px; sobrando espaço, ele sobe, nunca desce.`
      : 'A faixa de cima (da borda até ~1/8 da ALTURA) e a de baixo (dos ~7/8 até a borda) ficam VAZIAS: nenhuma letra, nenhum filete, nenhum ícone e NENHUMA LOGO entram ali, nem de raspão. O elemento mais baixo da arte termina ANTES dos ~7/8.',
    'Isso vale mesmo quando o pedido falar em "topo" ou "rodapé" — que são as zonas LOGO ABAIXO e LOGO ACIMA dessas faixas — e vale mesmo quando o MODELO a seguir tiver algo colado na borda: a arte de referência foi feita sem esta regra, e aqui a safe area VENCE a margem dela. Nas laterais, margem mínima de ~6% da largura.',
  ].join(' ')
}

/**
 * Prompt da trilha `arte`: foto real + copy verbatim → peça diagramada.
 *
 * Portado do prompt "normal" do insta-automatico (produção desde abril/2026
 * para exatamente este caso), somado ao TYPOGRAPHY LOCK das skills: as fontes
 * vêm da carta de identidade (brand-card), nunca de descrição vaga.
 */
export function buildArtePrompt(args: BuildArtePromptArgs): string {
  const sections: string[] = []

  const carrossel = args.carrossel
  if (carrossel) {
    sections.push(
      `Você é o DIRETOR DE ARTE desta marca. Componha o SLIDE ${carrossel.slideOrder} de ${carrossel.totalSlides} de um carrossel de Instagram, usando a foto real fornecida como cena final e adicionando APENAS a camada gráfica.` +
        (carrossel.ehGuia
          ? ' Este slide DEFINE o visual de toda a série: as decisões de cor, luz, tratamento e diagramação feitas aqui serão repetidas nos demais.'
          : ''),
    )
    sections.push(
      '[SEM NUMERAÇÃO]\nNão desenhe número de slide, contador, seta de "arraste" nem marcador de sequência.',
    )
  } else {
    sections.push(
      `Você é o DIRETOR DE ARTE desta marca. Componha uma peça de Instagram usando a foto real fornecida como cena final, adicionando APENAS a camada gráfica (textos e logo).`,
    )
  }

  // Regra de fidelidade — a mais forte do sistema de origem, verbatim adaptado.
  //
  // A terceira linha existe para desfazer um CONFLITO real deste prompt: mais
  // abaixo ele injeta o `visualStyle` do DNA inteiro, e o DNA de várias marcas
  // fala em "luz dramática", "golden hour", "alto contraste". Sem a ressalva, o
  // modelo lê isso como autorização para relumiar a foto — foi exatamente o que
  // o insta-automatico apanhou e resolveu com uma frase explícita.
  const fidelidade = [
    '[FIDELIDADE À FOTO]',
    'A foto do prato/cena é a CENA FINAL da arte. NÃO recrie a cena, NÃO troque nem "melhore" o fundo, NÃO invente ambiente novo, NÃO adicione nem remova objetos, pessoas ou arquitetura. O dono do restaurante precisa RECONHECER o próprio prato e o próprio salão — se a arte parecer OUTRO lugar, está reprovada.',
    // "Permitido apenas ajuste global MUITO sutil de contraste, exposição e
    // nitidez" era a licença que o modelo esticava: a peça do almoço do TERO
    // saiu com a foto estourada e o cliente respondeu "você não precisa alterar
    // a imagem" (17/08/2026). Ajuste sutil não é necessário para peça nenhuma —
    // quem quer mexer na foto pede, e o pedido vira a EXCEÇÃO logo abaixo.
    'NÃO RELUMIE E NÃO TRATE A FOTO: direção da luz, temperatura de cor, exposição, contraste, saturação e nitidez saem exatamente como entraram. Não "puxe" contraste nem vibração para a foto ficar mais bonita — a fotografia não precisa de tratamento nenhum aqui, e a única camada que você acrescenta é a gráfica.',
    'As descrições de fotografia que aparecerem no DNA desta marca (luz dramática, golden hour, bokeh quente, alto contraste) definem o PADRÃO DE ESCOLHA da foto e a atmosfera da camada gráfica — NUNCA autorizam relumiar ou recriar esta foto.',
    'Se o enquadramento exigir completar bordas, ESTENDA a própria cena com continuidade perfeita (mesma parede, mesma mesa, mesma luz) — nunca um cenário diferente.',
  ]
  if (args.instrucaoImagem?.trim()) {
    fidelidade.push(
      `EXCEÇÃO AUTORIZADA PELO CLIENTE — aplique EXATAMENTE este ajuste na imagem, e NADA além dele: ${args.instrucaoImagem.trim()}`,
    )
  }
  sections.push(fidelidade.join('\n'))

  /**
   * A caixa da copy é decidida aqui, na STRING, porque é o único lugar onde ela
   * é decidível — ver `caixa-da-copy.ts`. Cliente fora do mapa recebe a copy
   * como foi escrita.
   *
   * `natural` vale para a copy INTEIRA (o bloco gritado pode ser qualquer um);
   * `alta` vale só para a MANCHETE, que é o que a marca pede em caixa alta.
   *
   * Os nomes da marca voltam com a grafia oficial na conversão para natural: é
   * o que faz "SABORES REAL" virar "Sabores Real" e não "Sabores real".
   */
  const caixaDaMarca = args.brand ? CAIXA_DA_MANCHETE.get(args.brand.projectId) : undefined
  const nomesDaMarca = args.brand?.projectName ? [args.brand.projectName] : []
  const comCaixaDaMarca = (b: string, ehManchete: boolean) => {
    if (caixaDaMarca === 'natural') return paraCaixaNatural(b, nomesDaMarca)
    if (caixaDaMarca === 'alta' && ehManchete) return paraCaixaAlta(b)
    return b
  }

  if (args.copy.length > 0) {
    sections.push(
      [
        '[COPY — REPRODUZIR VERBATIM, NA ORDEM]',
        'O conteúdo textual da peça é SOMENTE o que está listado abaixo — nada a mais, nada a menos. Reproduza cada bloco com as MESMAS PALAVRAS, a mesma grafia, os mesmos números e a mesma pontuação:',
        ...args.copy.map((b, i) => `- "${comCaixaDaMarca(b, i === 0).replace(/\s+/g, ' ').trim()}"`),
        'Não corrija, não traduza, não abrevie, não acrescente palavras, não invente horário, preço ou endereço.',
        // Medido em 17/08/2026 na peça de almoço do O Quintal: o modelo
        // escolhido tem uma zona de serviço no rodapé, a copy não tinha nada
        // para pôr nela, e o gpt-image a preencheu REPETINDO a linha de apoio
        // — o mesmo texto duas vezes na mesma arte. Zona do modelo sem
        // conteúdo correspondente fica VAZIA.
        'Cada bloco aparece UMA ÚNICA VEZ na peça. Nunca repita o mesmo texto em dois lugares para preencher espaço: se uma zona do modelo ficar sem conteúdo nesta peça, ela simplesmente NÃO EXISTE aqui.',
        /**
         * 🔴 NÃO adicione aqui uma regra mandando ignorar a caixa da copy.
         *
         * Foi tentado e MEDIDO em 16/08/2026, com esta redação: "se um bloco
         * vier todo em maiúsculas, isso NÃO é ordem de desenhá-lo em caixa
         * alta — trate a caixa como decisão sua". Resultado: 2 de 2 peças
         * saíram em CAIXA ALTA do mesmo jeito. A linha literal `- "DESACELERE
         * E DESFRUTE"`, três linhas acima, vence qualquer instrução sobre ela.
         *
         * A caixa da arte É a caixa da string — provado na mesma bateria:
         * apresentando a MESMA copy como "Desacelere e desfrute", 2 de 2 peças
         * saíram em caixa natural, com a conferência de texto passando (ela
         * termina em `.toUpperCase()`, então é indiferente à caixa).
         *
         * Nem uma instrução de caixa VINDA DO MODELO escolhido segura. Medido
         * de novo em 17/08/2026, no TERO: o MODELO SPINE trazia `1. título ·
         * caixa ALTA` e a regra "esta regra vence qualquer outro palpite sobre
         * caixa", e a peça saiu "Almoço executivo" em caixa natural do mesmo
         * jeito. Três medições, três derrotas — a instrução nunca ganha.
         *
         * Conserto, portanto, é a montante: quem escreve a copy. As descrições
         * das tools de plano e de geração pedem caixa natural, e `caixaDaMarca`
         * acima devolve a caixa que a marca pede antes de a string virar prompt.
         */
        'Texto visto em qualquer IMAGEM DE REFERÊNCIA não é conteúdo desta peça: pertence a um post antigo e NUNCA entra aqui.',
      ].join('\n'),
    )
  } else {
    sections.push(
      '[SEM TEXTO]\n⛔ ZERO TEXTO nesta peça: nenhuma letra, número ou palavra desenhada. Apenas a foto com tratamento sutil e, se fornecida, a logo discreta.',
    )
  }

  /**
   * SERVIÇO tem lugar fixo, e ele NÃO vem do modelo (17/08/2026, pedido do
   * Ciro).
   *
   * O parágrafo do modelo manda copiar as zonas dele — mas o modelo é uma peça
   * ANTIGA e pode não ter linha de serviço nenhuma. Quando a copy tem horário
   * ou endereço e o modelo não tem onde pendurá-los, o gpt-image os gruda na
   * manchete, no meio do quadro. Vai colado à copy, logo abaixo dos blocos de
   * que fala, e só existe quando há serviço — ver `instrucaoDeServico`.
   */
  // A caixa é aplicada com o MESMO critério da lista de copy (`i === 0` é a
  // manchete): citar aqui um bloco com caixa diferente da que ele tem três
  // linhas acima daria ao modelo duas versões da mesma frase para desenhar.
  const servico =
    args.copy.length > 0 ? instrucaoDeServico(args.copy.map((b, i) => comCaixaDaMarca(b, i === 0))) : null
  if (servico) sections.push(servico)

  const regras = [
    '[REGRAS DE COMPOSIÇÃO]',
    // ÁREA, não altura. A distinção decide o layout: um teto de altura proíbe a
    // coluna alta e estreita que o modelo escolhe quando o espaço livre da foto
    // é vertical — e é justamente o layout das artes do Espeto que o Ciro
    // aprovou em 10/08 (o "A PARTIR DAS 17H" ocupa ~40% da altura numa faixa de
    // ~35% da largura). O teto de altura vale para a HEADLINE, que é onde o
    // exagero realmente aparece.
    '1. A fotografia é a protagonista: TODO o conjunto de texto (título + apoio + serviço + CTA) junto ocupa no máximo ~1/5 do QUADRO. Pode ser uma coluna alta e estreita ou uma faixa baixa e larga — o que a foto permitir.',
    '2. A headline tem presença MODERADA e editorial: não passa de ~15% da altura do quadro. Hierarquia por PESO, COR e POSIÇÃO — nunca por tamanho. Nunca cartaz de varejo.',
    // O teto por PALAVRA é do insta-automatico e resolve um vício específico:
    // sem ele o modelo estica uma palavra sozinha até preencher a largura, e a
    // peça vira cartaz de varejo mesmo respeitando o teto de altura.
    '3. Nenhuma palavra isolada passa de ~35% da largura útil — nunca amplie uma palavra sozinha para preencher a linha.',
    // O véu virou ESCURECIMENTO GLOBAL nas peças do O Quintal (17/08/2026): a
    // arte do almoço de domingo saiu com o salão inteiro apagado, e o cliente
    // reprovou com "a foto está ficando muito escura". "Sutil" não bastava
    // porque não dizia ONDE — a segunda frase é o limite que faltava.
    '4. O texto mora no espaço LIVRE da foto — nunca sobre o prato, o rosto ou o assunto principal. Use gradiente de leitura sutil onde o texto pousar, nunca um retângulo chapado.',
    '4b. O véu de leitura é LOCAL e SUAVE: um sussurro de sombra só na faixa onde o texto pousa (no máximo ~1/3 do quadro), sumindo antes de chegar ao assunto — a foto continua NÍTIDA e reconhecível POR BAIXO do véu, nunca coberta por uma tarja. ⛔ Nunca escureça a foto inteira, nunca baixe o brilho geral da cena e nunca apague o fundo para "destacar" o texto — a foto tem de continuar tão clara quanto a original, com as pessoas e o ambiente visíveis. Se o texto não ficar legível com um véu leve, MUDE O TEXTO DE LUGAR em vez de adensar o véu.',
    // Anti-órfã: regra 3 do modo REGENERAR_VISUAL de lá, que existe porque o
    // defeito aparecia toda semana.
    // "na última linha" deixava escapar o artigo órfão na PRIMEIRA: a manchete
    // do Espeto Gaúcho saiu com o "As" sozinho numa linha e "promoções!" na
    // seguinte, e o cliente reprovou ("não gosto de deixar palavras pequenas
    // sozinhas — poderiam ter ficado na mesma linha", 17/08/2026). Sem exemplo
    // entre aspas de propósito: string literal no prompt vira texto desenhado.
    '5. Quebras de linha equilibradas: NENHUMA linha de um bloco fica com uma palavra sozinha — nem a primeira, nem a última. Artigo, preposição ou palavra curta nunca abre linha sozinha: ela pousa na MESMA linha da palavra que acompanha. Em manchete, 2 a 3 palavras por linha; em apoio, 4 a 6. Cabendo o bloco em menos linhas sem apertar, use menos linhas.',
    '6. Tipografia SOMENTE a da carta de identidade fornecida — nunca substitua por fonte parecida.',
    '7. Paleta da marca apenas na camada gráfica (textos, destaques, filetes, selos); a fotografia mantém as cores reais — não dessature nem recolora madeira, tons de pele, verdes e dourados que já existem na foto.',
    '8. Uma cor de destaque por peça.',
    // Com o PORQUÊ, porque a regra seca perdeu: na v2 do happy hour o pedido
    // "título no topo" venceu a safe area e o título começou a ~70px da borda
    // — exatamente sob o nome do perfil que o Instagram sobrepõe ali. O Ciro
    // pegou no olho (10/08/2026).
    // Em FRAÇÃO do quadro, não em pixel: a peça sai 1088x1936, o "~250px" foi
    // escrito para 1080x1920 e o modelo não conta pixel nenhum — ele compõe em
    // proporção. As cinco peças do O Quintal (17/08/2026) puseram a logo colada
    // na borda de cima e o CTA colado na de baixo, com a regra escrita: "é
    // preciso respeitar as margens do Instagram de topo e rodapé".
    regraDeSafeArea(args.formato, args.alturaPx),
    // A regra que faltava, e a mais importante para o resultado parecer feito
    // por gente: ONDE o texto pousa é decisão de quem OLHA a foto. As regras
    // acima são limites; dentro delas, quem diagrama é o modelo. Sem isto o
    // prompt vira receita e todas as peças saem com o mesmo layout.
    '10. AUTONOMIA: dentro destes limites, VOCÊ escolhe a composição. Leia a foto e ponha o texto onde ela é calma — o canto vazio, a parede desfocada, a faixa escura. Coluna alta à esquerda, faixa no rodapé, bloco no topo: o que ESTA foto pedir. Varie a diagramação entre peças; não repita o layout da anterior.',
  ]
  sections.push(regras.join('\n'))

  // A paleta em HEX, no texto. A imagem do card mostra as cores, mas o valor
  // exato o modelo só respeita quando lê — é o que impede destaque em cor
  // aleatória fora da paleta.
  if (args.brand && args.brand.colors.length > 0) {
    sections.push(
      [
        '[PALETA — só para a camada gráfica]',
        args.brand.colors
          .slice(0, 10)
          .map((c) => `${c.name}: ${c.hexCode.toUpperCase()}`)
          .join(' | '),
        'Texto, filete, selo e overlay usam SOMENTE estas cores. A fotografia não é afetada por esta lista.',
      ].join('\n'),
    )
  }

  // TYPOGRAPHY LOCK também na peça avulsa: era exclusivo do carrossel, mas o
  // vício que ele corrige — o modelo escolher uma fonte "parecida" — não tem
  // nada de específico de série.
  if (args.copy.length > 0 && !carrossel) {
    const lock = buildTypographyLock(args.brand)
    if (lock) sections.push(lock)
  }

  /**
   * Modelo escolhido à mão na peça avulsa (16/08/2026).
   *
   * Entra AQUI, colado ao lock de tipografia e bem antes do DNA, pela mesma
   * medição que reordenou o slide irmão em 10/08: neste ponto o bloco cai por
   * volta dos 38% do prompt; no fim, cairia atrás do paredão de identidade e
   * seria lido como sugestão. A caixa das letras depende dele, e a linha do
   * lock acima acabou de dizer que a caixa vem do modelo quando houver um.
   */
  const temModelo = !carrossel && args.refs.some((r) => r.role === 'style-guide')
  if (temModelo) {
    // Nos clientes de `modelo-livre.ts` o modelo passa o ESTILO e o lugar
    // volta a ser do gerador — ver buildModeloSpineLivre. Nos demais, o spine
    // estrito segue intacto.
    const spine = modeloLivre(args.brand?.projectId)
      ? buildModeloSpineLivre(args.modelo?.descricao, args.modelo?.elementos, args.copy)
      : buildModeloSpine(args.modelo?.descricao, args.modelo?.elementos, args.copy)
    sections.push(spine)
  }

  // Depois das regras e antes do pedido: a proibição de desenhar logo precisa
  // estar acima do que o cliente pede, porque "coloque a marca" é pedido comum.
  if (args.blocoLogo) sections.push(args.blocoLogo)

  // ── Slide irmão: o GUIA vence o DNA, e vem ANTES dele ────────────────────
  //
  // Ordem importa mais do que parece. Medição de 10/08/2026 no By Rock: no
  // arranjo anterior o LOOK SPINE começava aos 85% de um prompt de 13.008
  // caracteres, atrás de um bloco de DNA de 8.503 (65% do total), e a linha
  // que descrevia o elemento gráfico caía aos 98%. Não era falta de menção —
  // "onda sonora" aparecia três vezes —, era enterro. O gpt-image reescreve o
  // prompt internamente e responde mal a paredão de regras, defeito que o
  // insta-automatico já tinha documentado no próprio refactor.
  //
  // Num slide irmão o guia JÁ É a marca aplicada e aprovada: `visualStyle` e
  // `composition` viram concorrência descrevendo em prosa o que a imagem do
  // guia mostra. Ficam de fora; `contentRules` fica, porque proibição não é
  // estilo e o guia não a contém.
  const ehIrmao = !!carrossel?.temGuia

  if (ehIrmao) {
    const lock = buildTypographyLock(args.brand)
    if (lock) sections.push(lock)
    sections.push(buildLookSpine(carrossel!.descricaoDoGuia, carrossel!.elementosDoGuia))
  }

  if (args.brand) {
    const identidade: string[] = [`[IDENTIDADE — ${args.brand.projectName}]`]
    /**
     * O MODELO escolhido tem o mesmo efeito que o guia tem no slide irmão: ele
     * JÁ É a marca aplicada e aprovada, então `visualStyle` e `composition`
     * viram concorrência descrevendo em prosa o que a imagem mostra — e, pior,
     * concorrência que VENCE por volume (9.180 contra ~2.000 caracteres).
     *
     * Foi o que aconteceu na Real Gelateria: a regra aprendida "título na
     * parte superior, serviço no rodapé" jogou a manchete para o topo, contra
     * um modelo que a põe embaixo. Fora as duas seções, o resto do DNA fica:
     * `contentRules` é proibição, não estilo, e o modelo escolhido não a
     * contém.
     */
    if (!ehIrmao && !temModelo) {
      if (args.brand.dna.visualStyle) identidade.push(`Estilo visual: ${args.brand.dna.visualStyle}`)
      if (args.brand.dna.composition) identidade.push(`Composição da marca: ${args.brand.dna.composition}`)
    }
    if (args.brand.dna.contentRules) {
      identidade.push(`Regras da marca (respeite sempre): ${args.brand.dna.contentRules}`)
      // Escopo da lista negativa — portado do `nuncaBloco` do insta-automatico.
      // Sem ele, uma regra do tipo "nunca usar vermelho em bloco grande" era
      // lida como licença para RECOLORIR a foto, ou para omitir um bloco da
      // copy que citasse algo proibido. A lista governa o que o modelo CRIA.
      identidade.push(
        'ESCOPO destas regras: elas proíbem o que VOCÊ cria (camada gráfica) e o que você inventaria de conteúdo. NUNCA são motivo para recolorir, relumiar, recortar ou descartar elementos reais da fotografia, nem para omitir um bloco da COPY.',
      )
    }
    if (identidade.length > 1) sections.push(identidade.join('\n'))
  }

  // O guia (e a peça avulsa de carrossel sem guia ainda) mantém a tipografia
  // travada aqui embaixo: é ele que ESTABELECE o padrão, e não tem com quem
  // competir.
  if (carrossel && !ehIrmao) {
    const lock = buildTypographyLock(args.brand)
    if (lock) sections.push(lock)
  }

  if (args.pedido?.trim()) {
    sections.push(
      `[PEDIDO DO CLIENTE]\n${args.pedido.trim()}\nEste pedido nunca vence a copy verbatim nem os limites de marca acima.`,
    )
  }

  return sections.join('\n\n')
}
