import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import { DEFAULT_ART_DIRECTION } from './art-direction'
import { regrasDaCasaNaMelhoria } from './regras-da-melhoria'
import { qualidadePadraoPara } from './qualidade-arte'
import type { BrandContext } from '@/lib/brand/brand-context'

let cachedClient: OpenAI | null = null

function getClient(): OpenAI {
  if (cachedClient) return cachedClient
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada')
  }
  cachedClient = new OpenAI({ apiKey })
  return cachedClient
}

/**
 * Modelo de geração de imagem usado pela melhoria de criativo.
 * Default: gpt-image-2. Requer organização verificada na OpenAI:
 * https://platform.openai.com/settings/organization/general
 *
 * Se a verificação ainda não propagou (até 15 min), defina
 * OPENAI_IMAGE_MODEL=gpt-image-1 no .env (não requer verificação).
 */
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2'

export function getCurrentImageModel(): string {
  return IMAGE_MODEL
}

export interface ReferenceImage {
  buffer: Buffer
  mimeType: string
  role: 'background' | 'logo' | 'element'
  label?: string
}

export interface BrandColor {
  name: string
  hexCode: string
}

interface BuildPromptArgs {
  userRequest: string
  references: ReferenceImage[]
  brandColors: BrandColor[]
  /** Direção de arte do projeto; cai no DEFAULT_ART_DIRECTION quando vazia. */
  artDirection?: string | null
  /** Identidade da marca via loader único; sempre do sistema, nunca do bloco editável. */
  brand?: BrandContext | null
  /**
   * Textos que a arte DEVE reproduzir letra por letra (extraídos da Generation
   * original). Viram a seção [TEXTO EXATO — VERBATIM], que vence até o pedido
   * do cliente — e são conferidos pós-geração pela verificação de visão.
   */
  expectedTexts?: string[]
  /** Ajuste autorizado na foto — vira a seção [AJUSTE NA FOTO]. */
  instrucaoImagem?: string | null
  /** A arte de origem foi transcrita e não tem texto — ver as regras da casa. */
  arteSemTexto?: boolean
  /**
   * Prompt ENXUTO: só o que a peça precisa (imagens, texto exato, pedido e as
   * regras da casa), sem a identidade da marca nem a direção de arte.
   *
   * Existe como hipótese a MEDIR, levantada pelo Ciro em 01/09/2026 ao ver o
   * prompt em ~20 mil caracteres: "testei com um prompt bem simples e
   * funcionou melhor". A melhoria recebe uma arte que JÁ é a marca aplicada —
   * descrever a marca em prosa pode ser concorrência, e é a mesma razão pela
   * qual o slide irmão de carrossel tira `visualStyle` e `composition` quando
   * há um guia. Não promova a default sem a medição.
   */
  enxuto?: boolean
}

function buildContextSection(references: ReferenceImage[]): string {
  const total = references.length + 1
  const lines: string[] = [`Você recebeu ${total} ${total === 1 ? 'imagem' : 'imagens'} de referência:`]
  let n = 1
  lines.push(
    `- IMAGEM ${n++}: a arte original do cliente. Extraia textos, logo, hierarquia e elementos gráficos daqui.`,
  )
  for (const ref of references) {
    if (ref.role === 'background') {
      lines.push(
        `- IMAGEM ${n++}: nova imagem de fundo escolhida pelo cliente. Substitui completamente o fundo atual da IMAGEM 1.`,
      )
    } else if (ref.role === 'logo') {
      lines.push(
        `- IMAGEM ${n++}: logo oficial do projeto${ref.label ? ` (${ref.label})` : ''}. Use exatamente esta versão da logo no resultado final.`,
      )
    } else if (ref.role === 'element') {
      lines.push(
        `- IMAGEM ${n++}: elemento gráfico do projeto${ref.label ? ` (${ref.label})` : ''} — badge, ícone ou ornamento disponível para enriquecer o design.`,
      )
    }
  }
  return `[CONTEXTO DAS IMAGENS]\n${lines.join('\n')}`
}

function buildBrandColorsSection(colors: BrandColor[]): string {
  if (colors.length === 0) return ''
  const list = colors.map((c) => `- ${c.name}: ${c.hexCode}`).join('\n')
  return `[CORES DA MARCA]\nA paleta oficial deste projeto:\n${list}\nPriorize estas cores para textos, ênfases e elementos visuais quando precisar ajustar contraste ou hierarquia.`
}

/**
 * Identidade do cliente. É o que faz a MESMA direção de arte produzir peças
 * diferentes por marca — sem isso, todo cliente recebe a mesma receita genérica.
 *
 * Montada pelo sistema, não pelo bloco editável: um prompt de projeto mal
 * escrito não deve poder apagar a tipografia e a paleta da marca.
 *
 * As fontes são a parte mais confiável (todos os 11 projetos têm as três
 * definidas); `brandStyleDescription` e `cuisineType` entram só quando
 * preenchidos, porque hoje quase todos estão vazios e uma linha "Estilo da
 * marca: null" só confundiria o modelo.
 */
function buildBrandIdentitySection(
  brand: BrandContext | null,
  temAjusteDeFoto: boolean,
): string {
  if (!brand) return ''

  const lines: string[] = [`[IDENTIDADE DA MARCA — ${brand.projectName}]`]

  // Seções do DNA relevantes para IMAGEM. toneOfVoice fica de fora de
  // propósito: é instrução de escrita (copy/chat) e aqui os textos são
  // reproduzidos verbatim — instrução de tom só confundiria o modelo.
  if (brand.dna.visualStyle) {
    lines.push(`Estilo visual da marca: ${brand.dna.visualStyle}`)
  }
  /**
   * 🔴 `photoDirection` SÓ entra quando alguém autorizou mexer na foto.
   *
   * Ela é direção para quem VAI FOTOGRAFAR ou gerar uma cena — descreve a
   * fotografia que a marca quer ter. Na melhoria a foto JÁ EXISTE e o trabalho
   * é a camada gráfica por cima dela; ali a mesma prosa vira ordem de refazer
   * a imagem, e é a instrução mais longa do prompt inteiro.
   *
   * Medido em 01/09/2026, no defeito que originou esta linha: pedido vazio, e
   * o modelo trocou duas taças de vinho por um bife sobre mesa de madeira com
   * a parede de guitarras desfocada ao fundo — que é, palavra por palavra, o
   * que o `photoDirection` do By Rock manda fotografar ("fotografado sobre a
   * mesa de madeira, com a parede de guitarras desfocada ao fundo… o prato é
   * o músico"). Ele não desobedeceu regra nenhuma: obedeceu a esta seção.
   *
   * A conta explica por que a regra de fidelidade perdia: dos 27.887 chars do
   * prompt, a identidade era 18.333 (66%) e só `photoDirection` levava 8.065
   * (29%) — contra 4 linhas mandando não mexer na foto. O CLAUDE.md já
   * registrava o risco ("hoje não entra na trilha arte — se um dia entrar,
   * ela volta a conflitar"); na melhoria ela sempre entrou.
   *
   * Com ajuste de foto pedido ela VOLTA, e aí está no lugar certo: a foto vai
   * mudar mesmo, e deve mudar no estilo da marca.
   */
  if (brand.dna.photoDirection && temAjusteDeFoto) {
    lines.push(`Direção fotográfica da marca: ${brand.dna.photoDirection}`)
  }
  if (brand.dna.composition) {
    lines.push(`Composição e layout da marca: ${brand.dna.composition}`)
  }
  if (brand.dna.contentRules) {
    lines.push(`Regras da marca (respeite sempre): ${brand.dna.contentRules}`)
  }
  if (brand.cuisineType) {
    lines.push(`Tipo de cozinha: ${brand.cuisineType}`)
  }

  const fontes: string[] = []
  if (brand.fonts.title) fontes.push(`títulos em ${brand.fonts.title}`)
  // Subtítulo nulo significa "a marca usa a fonte de corpo também no subtítulo"
  // (ver comentário no schema) — dizer isso é melhor que omitir a linha.
  if (brand.fonts.subtitle) {
    fontes.push(`subtítulos em ${brand.fonts.subtitle}`)
  } else if (brand.fonts.body) {
    fontes.push(`subtítulos na mesma fonte do corpo`)
  }
  if (brand.fonts.body) fontes.push(`corpo em ${brand.fonts.body}`)

  if (fontes.length > 0) {
    lines.push(
      `Tipografia oficial: ${fontes.join(', ')}. Replique o desenho das letras como está na IMAGEM 1 — estes nomes servem para você reconhecer a fonte, não para substituí-la por outra parecida.`,
    )
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

function buildTextoExatoSection(expectedTexts: string[]): string {
  if (expectedTexts.length === 0) return ''
  const list = expectedTexts.map((t) => `- "${t.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()}"`).join('\n')
  return `[TEXTO EXATO — VERBATIM]
A arte contém textos que NÃO podem mudar. Reproduza cada um letra por letra,
com a mesma grafia, os mesmos números e a mesma pontuação — nada a mais, nada
a menos:
${list}
Não corrija, não traduza, não abrevie e não acrescente palavras. Se o pedido do
cliente conflitar com algum destes textos, os textos exatos vencem.`
}

function buildPedidoSection(userRequest: string): string {
  const trimmed = userRequest.trim()
  if (trimmed.length === 0) return ''
  return `[PEDIDO DO CLIENTE]
${trimmed}

Este pedido tem prioridade sobre as diretrizes de diagramação acima, mas nunca
sobre os limites (palavras, família tipográfica, paleta e logo).`
}

/**
 * O ajuste NA FOTO — a exceção explícita à fidelidade fotográfica.
 *
 * Precisa se declarar exceção, nominalmente: as diretrizes acima proíbem
 * substituir, adicionar ou remover objetos da fotografia, e a lei da casa
 * (medida três vezes em 16-17/08 na caixa das letras) é que a instrução que
 * não se declara vencedora perde para a mais enfática.
 */
function buildAjusteDaFotoSection(instrucao: string): string {
  const limpo = instrucao.trim()
  if (!limpo) return ''
  return `[AJUSTE NA FOTO — EXCEÇÃO AUTORIZADA]
O cliente autorizou mexer na fotografia desta peça, e SÓ no que ele pediu:
${limpo}

Onde as diretrizes acima proíbem alterar, substituir, acrescentar ou remover
elementos da fotografia, este pedido é a exceção — vale para o que está escrito
aqui e para mais nada. Todo o resto da foto continua intocado: não relumie, não
recolora e não mude o enquadramento. O resultado continua sendo fotografia real.`
}

function buildAssetsUsageSection(references: ReferenceImage[]): string {
  const hasLogo = references.some((r) => r.role === 'logo')
  const hasElement = references.some((r) => r.role === 'element')
  if (!hasLogo && !hasElement) return ''
  const lines: string[] = ['[USO DOS ASSETS DO PROJETO]']
  if (hasLogo) {
    lines.push(
      '- Logo: foi fornecida como referência. Use essa versão exata no resultado. Se a IMAGEM 1 já tem essa logo, mantenha. Se a logo na IMAGEM 1 está em qualidade ruim ou em variação diferente, prefira a versão da referência.',
    )
  }
  if (hasElement) {
    lines.push(
      '- Elementos gráficos: use os elementos fornecidos APENAS se reforçarem o pedido do cliente ou se houver espaço composicional para eles. Não force inclusão. Mantenha cores e proporções dos elementos como recebidos.',
    )
  }
  return lines.join('\n')
}

function buildBackgroundIntegrationSection(): string {
  return `[NOVO FUNDO]
A nova imagem de fundo substitui completamente o fundo da IMAGEM 1 e ocupa 100%
da área visível. Preserve o ponto focal natural dela — não recorte de forma
agressiva e não altere seu conteúdo. Aplique a [LEITURA DA FOTO] sobre esta nova
imagem, não sobre a original.`
}

/**
 * Origem de cada seção do prompt — é o que a prévia da aba Marca exibe como
 * badge, respondendo "onde eu edito isso?".
 *
 * - `system`: montada pelo sistema a partir de Assets/DNA; não é sobrescrevível
 *   pelo prompt do projeto (de propósito — prompt mal escrito não pode apagar a
 *   tipografia e a paleta).
 * - `editable`: a direção de arte — padrão ou o texto do projeto.
 * - `runtime`: depende do que a pessoa faz na hora (anexos, pedido digitado).
 */
export interface PromptSection {
  id:
    | 'contexto'
    | 'identidade'
    | 'cores'
    | 'tarefa'
    | 'direcao'
    | 'regras-da-casa'
    | 'ajuste-foto'
    | 'novo-fundo'
    | 'assets'
    | 'pedido'
    | 'texto-exato'
  title: string
  origin: 'system' | 'editable' | 'runtime'
  content: string
  /** true quando a direção veio do projeto em vez do padrão */
  customized?: boolean
}

/**
 * Monta as seções do prompt final.
 *
 * O que o sistema é dono e o projeto não pode reescrever: o mapa das imagens
 * (quem é IMAGEM 1, 2, 3…, que depende do que foi anexado em runtime), a
 * identidade/paleta da marca, o uso dos assets e o pedido do cliente. O miolo
 * — a direção de arte — é `artDirection`, que vem do projeto quando ele tem um
 * prompt próprio e cai no DEFAULT_ART_DIRECTION quando não tem.
 *
 * Exportada porque a prévia da aba Marca usa EXATAMENTE esta função — se a
 * prévia montasse o próprio texto, mentiria na primeira mudança daqui.
 */
export function buildPromptSections({
  userRequest,
  references,
  brandColors,
  artDirection,
  brand,
  expectedTexts = [],
  instrucaoImagem = null,
  arteSemTexto = false,
  enxuto = false,
}: BuildPromptArgs): PromptSection[] {
  const hasBackground = references.some((r) => r.role === 'background')
  const sections: PromptSection[] = []

  if (references.length > 0) {
    sections.push({
      id: 'contexto',
      title: 'Contexto das imagens',
      origin: 'runtime',
      content: buildContextSection(references),
    })
  }

  const identitySection = buildBrandIdentitySection(
    brand ?? null,
    !!instrucaoImagem?.trim(),
  )
  if (identitySection) {
    sections.push({
      id: 'identidade',
      title: 'Identidade da marca',
      origin: 'system',
      content: identitySection,
    })
  }

  const colorsSection = buildBrandColorsSection(brandColors)
  if (colorsSection) {
    sections.push({ id: 'cores', title: 'Cores da marca', origin: 'system', content: colorsSection })
  }

  /**
   * A TAREFA — curta de propósito, e no lugar da direção de arte.
   *
   * 🔴 Medido em 01/09/2026, com o prompt de produção contra a formulação de
   * 491 chars ditada pelo Ciro, mesma peça e mesmo pedido, 2 rodadas cada:
   *
   * | variante          | resultado                                        |
   * |-------------------|--------------------------------------------------|
   * | completo (19,8k)  | uma quase idêntica à origem, outra ALTEROU a foto |
   * | só o pedido (100) | criativa, mas inventou selo e botão de interface  |
   * | simples (491)     | foto e copy intactas, composição variada, na marca|
   *
   * O prompt grande não protegia melhor: oscilava entre não fazer nada e
   * fazer o que não devia. É a mesma lição que a trilha `arte` registrou em
   * 17/08 — "prescrição de POSIÇÃO compete com a leitura da foto; o gpt-image
   * compõe melhor lendo a foto do que seguindo coordenadas" —, que fez nascer
   * o modo livre lá e que a melhoria nunca tinha recebido.
   *
   * O que ficou do prompt antigo é só o que veio de defeito medido: a
   * identidade (é o que segura a marca — sem ela uma rodada inventou "VINHO
   * SONS" no lugar do By Rock) e as regras da casa (cada uma nasceu de uma
   * reprovação). Os ~5 mil chars da direção de arte saíram.
   */
  sections.push({
    id: 'tarefa',
    title: 'A tarefa',
    origin: 'system',
    content: [
      '[A TAREFA]',
      'Esta é uma arte PRONTA desta marca. Crie uma versão melhor dela: ajuste o',
      'posicionamento, a hierarquia e o respiro dos textos para dar mais leitura.',
      'Use a MESMA copy da arte original, palavra por palavra.',
      'A composição é SUA: leia a fotografia, veja onde ela é calma, e decida onde',
      'cada bloco fica melhor. Variar a diagramação em relação à original é bom —',
      'o que não pode mudar é o conteúdo, a fotografia e a identidade da marca.',
    ].join('\n'),
  })

  /**
   * A direção de arte do PROJETO, quando ele tem uma. O padrão do Studio saiu
   * (ver o bloco acima) — mas quem escreveu uma direção própria na aba
   * Configurações a escreveu de propósito, e ela continua valendo.
   *
   * Em 01/09/2026 nenhum dos 11 projetos tinha: todos caíam no padrão.
   */
  const custom = !!artDirection?.trim()
  if (custom) {
    sections.push({
      id: 'direcao',
      title: 'Direção de arte (deste projeto)',
      origin: 'editable',
      customized: true,
      content: artDirection!.trim(),
    })
  }

  /**
   * As regras da casa vêm DEPOIS da direção de arte e ANTES do pedido, de
   * propósito: são diagramação, e a hierarquia declarada em `[PEDIDO DO
   * CLIENTE]` é que o pedido vence diagramação. O que o pedido continua NÃO
   * podendo vencer é `[TEXTO EXATO]`, que segue por último.
   *
   * Origem `system` porque `Project.artImprovementPrompt` substitui só o
   * bloco editável — regra conquistada em produção não pode ser apagada por
   * um prompt de projeto mal escrito (precedente da identidade da marca).
   */
  sections.push({
    id: 'regras-da-casa',
    title: 'Regras da casa',
    origin: 'system',
    content: regrasDaCasaNaMelhoria({ expectedTexts, userRequest, instrucaoImagem, arteSemTexto }),
  })

  if (hasBackground) {
    sections.push({
      id: 'novo-fundo',
      title: 'Novo fundo',
      origin: 'runtime',
      content: buildBackgroundIntegrationSection(),
    })
  }

  const assetsUsage = buildAssetsUsageSection(references)
  if (assetsUsage) {
    sections.push({ id: 'assets', title: 'Uso dos assets', origin: 'runtime', content: assetsUsage })
  }

  const pedido = buildPedidoSection(userRequest)
  if (pedido) {
    sections.push({ id: 'pedido', title: 'Pedido do cliente', origin: 'runtime', content: pedido })
  }

  const ajusteFoto = buildAjusteDaFotoSection(instrucaoImagem ?? '')
  if (ajusteFoto) {
    sections.push({
      id: 'ajuste-foto',
      title: 'Ajuste na foto',
      origin: 'runtime',
      content: ajusteFoto,
    })
  }

  // Por último DE PROPÓSITO: é a palavra final do prompt, acima inclusive do
  // pedido do cliente — texto aprovado não muda nem a pedido.
  const textoExato = buildTextoExatoSection(expectedTexts)
  if (textoExato) {
    sections.push({
      id: 'texto-exato',
      title: 'Texto exato (verbatim)',
      origin: 'system',
      content: textoExato,
    })
  }

  // No enxuto sobra o que descreve ESTA peça; o que descreve a marca em
  // prosa sai. As regras da casa FICAM: elas vieram de defeito medido.
  return enxuto ? sections.filter((s) => s.id !== 'identidade' && s.id !== 'direcao') : sections
}

function buildPrompt(args: BuildPromptArgs): string {
  return buildPromptSections(args)
    .map((s) => s.content)
    .join('\n\n')
}

/**
 * Chamada crua ao images.edit com prompt PRONTO e imagens já ordenadas.
 *
 * É o degrau que a geração de arte do zero usa (creative-generation-runner):
 * lá o prompt é montado pelo image-prompt-builder (trilhas imagem/arte) e a
 * ordem das imagens segue o contrato subject → âncoras → brand-card → logo —
 * este função não reordena nem acrescenta nada.
 */
export interface RawEditImage {
  buffer: Buffer
  mimeType: string
  /** Nome do arquivo enviado — aparece nos logs da OpenAI, ajuda depuração. */
  name: string
}

export async function runImageEdit({
  images,
  prompt,
  size,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  quality = 'high',
}: {
  images: RawEditImage[]
  prompt: string
  size: string
  timeoutMs?: number
  /**
   * Tier de qualidade da OpenAI. **O default é `high` e a produção não passa
   * este parâmetro** — ele existe para medir: `medium` custa US$ 0,045 contra
   * US$ 0,165 do `high` (−73%), e a pergunta em aberto é se o lettering
   * sobrevive, já que texto pequeno é o primeiro a borrar. Quem mede é
   * `scripts/medir-qualidade-trilha-arte.ts`, contra a MESMA verificação de
   * texto por visão que a produção usa.
   */
  quality?: 'low' | 'medium' | 'high'
}): Promise<Buffer> {
  if (images.length === 0) {
    throw new Error('runImageEdit exige pelo menos uma imagem')
  }
  const client = getClient()

  const files = await Promise.all(
    images.map((img) => toFile(img.buffer, img.name, { type: img.mimeType })),
  )

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    const response = await client.images.edit(
      {
        model: IMAGE_MODEL,
        image: files.length === 1 ? files[0] : files,
        prompt,
        size: size as never,
        quality,
        n: 1,
      },
      { signal: controller.signal },
    )
    const elapsed = Date.now() - startedAt
    console.log(
      `[runImageEdit] ${IMAGE_MODEL} ${size} q=${quality} concluído em ${(elapsed / 1000).toFixed(1)}s (${files.length} imagem/ns)`,
    )
    const b64 = response.data?.[0]?.b64_json
    if (!b64) throw new Error('OpenAI não retornou dados de imagem')
    return Buffer.from(b64, 'base64')
  } catch (error) {
    console.warn(
      `[runImageEdit] ${IMAGE_MODEL} ${size} falhou após ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    )
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

interface ImproveCreativeOptions {
  imageBuffer: Buffer
  mimeType: string
  userRequest: string
  size: string
  references?: ReferenceImage[]
  brandColors?: BrandColor[]
  /** `Project.artImprovementPrompt` — substitui a direção de arte padrão. */
  artDirection?: string | null
  /** Identidade da marca via loader único — injetada pelo sistema. */
  brand?: BrandContext | null
  /** Textos que a arte deve reproduzir verbatim (seção [TEXTO EXATO]). */
  expectedTexts?: string[]
  /**
   * Ajuste autorizado NA FOTO — o segundo campo do modal (01/09/2026).
   *
   * Separado do `userRequest` de propósito. Antes, pedir "humaniza essa foto
   * com uma mão dando uma colherada" ia no mesmo bloco da diagramação e
   * brigava contra o bloco de fidelidade da foto, sem nenhuma marca de que
   * era exceção autorizada. Aqui ele entra como exceção explícita — e é o que
   * decide o tier, porque compor é barato e editar a foto é caro.
   */
  instrucaoImagem?: string | null
  /** Tier do gpt-image. Ver `qualidade-arte.ts`. */
  quality?: 'low' | 'medium' | 'high'
  /** A arte de origem foi transcrita e não tem texto. */
  arteSemTexto?: boolean
  /** Prompt enxuto — hipótese em medição, ver `BuildPromptArgs.enxuto`. */
  enxuto?: boolean
  timeoutMs?: number
}

// Tempo máximo da chamada à OpenAI. O endpoint /improve roda em background
// com maxDuration=300, então temos folga até ~290s. gpt-image-2 high tipicamente
// fica em 30-90s, mas pode chegar a 3min em casos extremos.
const DEFAULT_TIMEOUT_MS = 280_000

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  return 'jpg'
}

/**
 * Envia o criativo + pedido do usuário pra OpenAI gpt-image (image edit endpoint).
 * Quando há `references`, envia múltiplas imagens (background, logos, elementos)
 * e usa um prompt dinâmico que enumera o papel de cada IMAGEM N.
 */
export async function improveCreative({
  imageBuffer,
  mimeType,
  userRequest,
  size,
  references = [],
  brandColors = [],
  artDirection = null,
  brand = null,
  expectedTexts = [],
  instrucaoImagem = null,
  quality,
  arteSemTexto = false,
  enxuto = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ImproveCreativeOptions): Promise<Buffer> {
  const client = getClient()

  const tier = quality ?? qualidadePadraoPara({ temAjusteDeFoto: !!instrucaoImagem?.trim() })
  const prompt = buildPrompt({
    userRequest, references, brandColors, artDirection, brand, expectedTexts, instrucaoImagem, arteSemTexto, enxuto,
  })

  const primaryFile = await toFile(imageBuffer, `original.${extensionFromMime(mimeType)}`, {
    type: mimeType,
  })

  const referenceFiles = await Promise.all(
    references.map((ref, idx) =>
      toFile(ref.buffer, `${ref.role}-${idx + 1}.${extensionFromMime(ref.mimeType)}`, {
        type: ref.mimeType,
      }),
    ),
  )

  const imageParam = referenceFiles.length > 0 ? [primaryFile, ...referenceFiles] : primaryFile

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  const refCounts = {
    bg: references.filter((r) => r.role === 'background').length,
    logos: references.filter((r) => r.role === 'logo').length,
    elements: references.filter((r) => r.role === 'element').length,
  }

  try {
    // SDK v6.25 ainda tipa `size` com os valores antigos do gpt-image-1.
    // gpt-image-2 aceita "qualquer resolução" (múltipla de 16, max 3840px) — cast
    // necessário até a SDK atualizar o type. https://developers.openai.com/api/docs/guides/image-generation
    const response = await client.images.edit(
      {
        model: IMAGE_MODEL,
        image: imageParam,
        prompt,
        size: size as never,
        quality: tier,
        n: 1,
      },
      { signal: controller.signal },
    )

    const elapsed = Date.now() - startedAt
    const refSuffix =
      references.length > 0
        ? ` (refs: bg=${refCounts.bg}, logos=${refCounts.logos}, elements=${refCounts.elements})`
        : ''
    const directionSuffix = artDirection?.trim() ? ' [direção do projeto]' : ''
    console.log(
      `[improveCreative] ${IMAGE_MODEL} ${size} q=${tier} concluído em ${(elapsed / 1000).toFixed(1)}s${refSuffix}${directionSuffix}`,
    )

    const b64 = response.data?.[0]?.b64_json
    if (!b64) {
      throw new Error('OpenAI não retornou dados de imagem')
    }
    return Buffer.from(b64, 'base64')
  } catch (error) {
    const elapsed = Date.now() - startedAt
    console.warn(
      `[improveCreative] ${IMAGE_MODEL} ${size} falhou após ${(elapsed / 1000).toFixed(1)}s`,
    )
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
