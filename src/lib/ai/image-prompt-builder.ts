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
 * subject → âncoras → style → brand-card → logo (ver `orderReferences`).
 */
export type ArtReferenceRole =
  | 'subject' // a foto do prato/produto — é a cena final da arte
  | 'anchor-ambient' // foto real do ambiente: a cena acontece NESTE lugar
  | 'anchor-dish' // segunda foto real do prato (outro ângulo/detalhe)
  | 'style' // referência de estilo/tonalidade (arte já aprovada, grid do feed)
  | 'brand-card' // carta de identidade renderizada (logo + paleta + fontes)
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

/** Ordena as referências no contrato fixo: subject → âncoras → style → brand-card → logo. */
export function orderReferences<T extends ArtReferenceDescriptor>(refs: T[]): T[] {
  const rank: Record<ArtReferenceRole, number> = {
    subject: 0,
    'anchor-dish': 1,
    'anchor-ambient': 2,
    style: 3,
    'brand-card': 4,
    logo: 5,
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
      case 'brand-card':
        lines.push(
          `${idx} is the brand identity card: official logo, color palette and typography samples. It is the ONLY source for fonts and graphic-layer colors.`,
        )
        break
      case 'logo':
        lines.push(
          `${idx} is the official logo in high resolution${ref.label ? ` (${ref.label})` : ''}. Place it exactly once, discreetly, never distorted or redrawn.`,
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

  sections.push(
    `Você é o DIRETOR DE ARTE desta marca. Componha uma peça de Instagram usando a foto real fornecida como cena final, adicionando APENAS a camada gráfica (textos e logo).`,
  )

  // Regra de fidelidade — a mais forte do sistema de origem, verbatim adaptado.
  const fidelidade = [
    '[FIDELIDADE À FOTO]',
    'A foto do prato/cena é a CENA FINAL da arte. NÃO recrie a cena, NÃO troque nem "melhore" o fundo, NÃO reluza, NÃO adicione nem remova objetos, pessoas ou arquitetura. O dono do restaurante precisa RECONHECER o próprio prato e o próprio salão.',
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
    '1. A fotografia é a protagonista (~90% da peça); o bloco de texto ocupa no máximo 25% da altura.',
    '2. O texto mora no espaço LIVRE da foto — nunca sobre o prato, rosto ou assunto principal. Use gradiente de leitura sutil onde o texto pousar.',
    '3. Tipografia SOMENTE a da carta de identidade fornecida — nunca substitua por fonte parecida.',
    '4. Paleta da marca apenas na camada gráfica (textos, destaques); a fotografia mantém as cores reais.',
    '5. Uma cor de destaque por peça; a logo aparece UMA vez, discreta, nunca deformada ou redesenhada.',
    '6. Respeite a safe area do formato (story: 200px topo e rodapé livres de informação).',
  ]
  sections.push(regras.join('\n'))

  if (args.brand) {
    const identidade: string[] = [`[IDENTIDADE — ${args.brand.projectName}]`]
    if (args.brand.dna.visualStyle) identidade.push(`Estilo visual: ${args.brand.dna.visualStyle}`)
    if (args.brand.dna.composition) identidade.push(`Composição da marca: ${args.brand.dna.composition}`)
    if (args.brand.dna.contentRules) identidade.push(`Regras da marca (respeite sempre): ${args.brand.dna.contentRules}`)
    if (identidade.length > 1) sections.push(identidade.join('\n'))
  }

  if (args.pedido?.trim()) {
    sections.push(
      `[PEDIDO DO CLIENTE]\n${args.pedido.trim()}\nEste pedido nunca vence a copy verbatim nem os limites de marca acima.`,
    )
  }

  return sections.join('\n\n')
}
