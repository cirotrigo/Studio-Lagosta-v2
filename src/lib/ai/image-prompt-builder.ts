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
  | 'series-guide' // slide-guia do carrossel: define o look de toda a série
  | 'brand-card' // carta de identidade renderizada (logo + paleta + fontes)
  | 'type-specimen' // prancha com o alfabeto completo das fontes reais (type-specimen.ts)
  | 'logo' // logo em alta, para a trilha `arte`

/** Tetos por papel — "várias refs competindo causam deriva visual". */
export const MAX_SUBJECT_REFS = 1
export const MAX_ANCHOR_REFS = 3
export const MAX_STYLE_REFS = 2

export interface ArtReferenceDescriptor {
  role: ArtReferenceRole
  label?: string
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

/** Teto de tamanho do prompt da trilha `imagem` (regra das skills: denso, não longo). */
export const IMAGE_PROMPT_MAX_CHARS = 1500

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
    'series-guide': 4,
    'brand-card': 5,
    'type-specimen': 6,
    logo: 7,
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
    switch (ref.role) {
      case 'subject':
        lines.push(
          `${idx} is the REAL photo of the dish/product${ref.label ? ` (${ref.label})` : ''}. It is the FINAL SCENE of the piece: do not recreate, replace or "improve" it. The owner must recognize their own dish.`,
        )
        break
      case 'anchor-dish':
        lines.push(
          `${idx} is a second REAL photo of the same dish${ref.label ? ` (${ref.label})` : ''} — use it only to stay faithful to the dish's true appearance.`,
        )
        break
      case 'anchor-ambient':
        lines.push(
          `${idx} is a REAL photograph of the restaurant environment${ref.label ? ` (${ref.label})` : ''}. The scene happens in THIS exact place: reproduce the architecture, furniture, materials and light fixtures EXACTLY as they appear — it is a real existing place. Do not invent architecture that is not visible in this photo.`,
        )
        break
      case 'style':
        lines.push(
          `${idx} is a style reference${ref.label ? ` (${ref.label})` : ''} — copy its tonal register, luminosity and level of stylization, NOT its content. If this reference is light, the result is light.`,
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
        lines.push(
          `${idx} is the OFFICIAL LOGO file${ref.label ? ` (${ref.label})` : ''}. Reproduce it in the piece EXACTLY as it appears here — same shape, same proportions, same letterforms, same colors. Never redraw, restyle or simplify it, and never letter the brand name in a different typeface.`,
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
- A ÂNCORA MANDA: quando existem fotos reais de ambiente, NÃO descreva a arquitetura — escreva "the scene happens in the exact environment shown in the reference photographs" e gaste as palavras na AÇÃO e na luz.
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
  } else if (elementos.length === 0 && descricaoDoGuia) {
    linhas.push(
      '',
      '⚠️ O guia NÃO tem elemento gráfico além do texto: não acrescente filete, onda, barra, moldura nem ícone.',
    )
  }

  linhas.push(
    '',
    'REPLIQUE, item a item:',
  )
  linhas.push(...[
    '1. POSIÇÃO do bloco de texto: o mesmo canto, a mesma altura, a mesma margem.',
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
 * TYPOGRAPHY LOCK — descrição travada da tipografia, copiada igual em todo
 * slide.
 *
 * Sem isto o modelo escolhe uma fonte "parecida" diferente a cada slide, e o
 * carrossel sai com três tipografias. A regra veio das skills: descrição vaga
 * é reinterpretada; descrição travada e repetida verbatim, não.
 */
export function buildTypographyLock(brand: BrandContext | null): string {
  if (!brand) return ''
  const linhas: string[] = ['[TIPOGRAFIA TRAVADA — IDÊNTICA EM TODOS OS SLIDES]']
  if (brand.fonts.title) {
    linhas.push(`- Títulos: ${brand.fonts.title}, caixa alta, peso máximo, entrelinha curta.`)
  }
  const apoio = brand.fonts.subtitle ?? brand.fonts.body
  if (apoio) linhas.push(`- Subtítulos e apoio: ${apoio}.`)
  if (brand.fonts.body) linhas.push(`- Corpo e serviço: ${brand.fonts.body}.`)
  if (linhas.length === 1) return ''
  linhas.push(
    'Use EXATAMENTE estas famílias, com o mesmo peso e a mesma escala relativa em todos os slides. Nunca substitua por fonte parecida e nunca varie de um slide para o outro.',
  )
  return linhas.join('\n')
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
    'NÃO RELUMIE: direção da luz, temperatura de cor e aparência real do ambiente ficam como estão. Permitido apenas ajuste global MUITO sutil de contraste, exposição e nitidez.',
    'As descrições de fotografia que aparecerem no DNA desta marca (luz dramática, golden hour, bokeh quente, alto contraste) definem o PADRÃO DE ESCOLHA da foto e a atmosfera da camada gráfica — NUNCA autorizam relumiar ou recriar esta foto.',
    'Se o enquadramento exigir completar bordas, ESTENDA a própria cena com continuidade perfeita (mesma parede, mesma mesa, mesma luz) — nunca um cenário diferente.',
  ]
  if (args.instrucaoImagem?.trim()) {
    fidelidade.push(
      `EXCEÇÃO AUTORIZADA PELO CLIENTE — aplique EXATAMENTE este ajuste na imagem, e NADA além dele: ${args.instrucaoImagem.trim()}`,
    )
  }
  sections.push(fidelidade.join('\n'))

  if (args.copy.length > 0) {
    sections.push(
      [
        '[COPY — REPRODUZIR VERBATIM, NA ORDEM]',
        'O conteúdo textual da peça é SOMENTE o que está listado abaixo — nada a mais, nada a menos. Reproduza cada bloco letra por letra, com a mesma grafia, números e pontuação:',
        ...args.copy.map((b) => `- "${b.replace(/\s+/g, ' ').trim()}"`),
        'Não corrija, não traduza, não abrevie, não acrescente palavras, não invente horário, preço ou endereço.',
      ].join('\n'),
    )
  } else {
    sections.push(
      '[SEM TEXTO]\n⛔ ZERO TEXTO nesta peça: nenhuma letra, número ou palavra desenhada. Apenas a foto com tratamento sutil e, se fornecida, a logo discreta.',
    )
  }

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
    '4. O texto mora no espaço LIVRE da foto — nunca sobre o prato, o rosto ou o assunto principal. Use gradiente de leitura sutil onde o texto pousar, nunca um retângulo chapado.',
    // Anti-órfã: regra 3 do modo REGENERAR_VISUAL de lá, que existe porque o
    // defeito aparecia toda semana.
    '5. Quebras de linha equilibradas: NUNCA deixe uma palavra sozinha na última linha de um bloco. Em manchete, 2 a 3 palavras por linha; em apoio, 4 a 6.',
    '6. Tipografia SOMENTE a da carta de identidade fornecida — nunca substitua por fonte parecida.',
    '7. Paleta da marca apenas na camada gráfica (textos, destaques, filetes, selos); a fotografia mantém as cores reais — não dessature nem recolora madeira, tons de pele, verdes e dourados que já existem na foto.',
    '8. Uma cor de destaque por peça.',
    // Com o PORQUÊ, porque a regra seca perdeu: na v2 do happy hour o pedido
    // "título no topo" venceu a safe area e o título começou a ~70px da borda
    // — exatamente sob o nome do perfil que o Instagram sobrepõe ali. O Ciro
    // pegou no olho (10/08/2026).
    '9. SAFE AREA DO STORY — o Instagram DESENHA POR CIMA da peça: o nome do perfil e o avatar no topo, e os controles de resposta no rodapé. Os primeiros ~250px do topo e os últimos ~250px do rodapé ficam LIVRES de texto e de logo, mesmo quando o pedido do cliente falar em "topo" ou "rodapé" — topo e rodapé são as zonas LOGO ABAIXO/ACIMA dessas faixas. No feed: margens generosas, nada encostado na borda.',
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
    if (!ehIrmao) {
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
