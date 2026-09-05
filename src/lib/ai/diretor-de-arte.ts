/**
 * O DIRETOR DE ARTE — o planejador que OLHA a peça antes de o gerador desenhar.
 *
 * Um modelo de linguagem com visão recebe a arte, as referências, o DNA da
 * marca, a copy e o pedido, e escreve UM prompt curto e concreto para o
 * gpt-image — em vez de o código concatenar 20 mil caracteres de regras que o
 * modelo de imagem não lê.
 *
 * Por que existe (05/09/2026, `docs/PLANO-2026-09-05-ARTES-COMO-O-CHATGPT.md`):
 * o ChatGPT usa o MESMO `gpt-image-2` da API e devolve peça melhor com oito
 * palavras de pedido. A diferença não é o modelo — é que lá um LLM lê a imagem,
 * entende o pedido, decide a diagramação e escreve um prompt curto; aqui o
 * prompt era montado às cegas, e cada reprovação virava uma regra a mais no
 * texto que o gpt-image recebe. Medido na F0 do plano (4 peças × 4 rodadas): o
 * prompt de produção de 22 mil caracteres, com "não crie nada" escrito,
 * acrescentou um selo em 4 de 4 rodadas e inventou uma foto numa; um prompt de
 * 1,4 mil com o manual da marca como referência saiu limpo em 4 de 4. A regra
 * estava lá; o modelo não a leu.
 *
 * O desenho, portanto:
 *  - As REGRAS DA CASA moram AQUI, no system prompt do planejador, onde um
 *    texto longo é lido de verdade. O planejador decide quais três ou quatro
 *    ESTA peça precisa.
 *  - O que é MECÂNICO continua no código, fora do alcance do planejador: a copy
 *    verbatim é conferida por visão depois; a logo é composta por código nos
 *    projetos em `compor`; a caixa das letras já vem decidida na string
 *    (`aplicarCaixaDaOrigem`); e o prompt gerado tem teto de caracteres e é
 *    conferido (todo bloco da copy tem de estar nele, entre aspas).
 *  - Falhou o planejador (fora do ar, resposta sem a copy, estourou o teto
 *    duas vezes) → devolve `null` e o chamador cai no prompt de sempre. O
 *    planejador nunca derruba uma melhoria.
 *
 * Precedente interno: `buildImagePromptViaLLM` (trilha `imagem`), o "diretor
 * de fotografia" que escreve o prompt de cena desde 09/08/2026.
 */

import { z } from 'zod'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import type { BrandContext } from '@/lib/brand/brand-context'
import type { ModoDaMelhoria } from './modo-da-melhoria'
import { normalizeForComparison } from './text-comparison'

/**
 * Precisa ENXERGAR a peça (onde o assunto está, onde a foto é calma, como o
 * texto está hoje) e DECIDIR uma diagramação — é trabalho de raciocínio, não
 * de transcrição. O `gpt-4o-mini` não vê onde o texto está (medido em
 * 17/08/2026 no decodificador de guia); o `gpt-4o`, no primeiro ensaio deste
 * módulo (05/09/2026), misturou a lista de preservação do `refinar` num
 * prompt de `redesenhar` e descreveu a tarefa em adjetivos ("clear
 * hierarchy"). O padrão é o `gpt-5.2` — é o que o ChatGPT usa por trás da
 * conversa que originou este módulo, e a chave da conta o alcança (medido).
 * Modelos `gpt-5*` não aceitam `temperature`.
 */
const PLANNER_MODEL = process.env.OPENAI_PLANNER_MODEL || 'gpt-5.2'
const ACEITA_TEMPERATURA = !/^gpt-5/.test(PLANNER_MODEL)

/**
 * Teto do prompt que o planejador escreve. O guia oficial de prompting dos GPT
 * Image models pede prompts "skimmable" em segmentos curtos; o do ChatGPT que
 * produziu a peça da Real tinha oito palavras e o A/B da F0 venceu com 1,4 mil.
 * 2.600 dá espaço para a copy de uma agenda inteira (13 blocos) sem virar
 * paredão de novo.
 */
export const TETO_DO_PROMPT_PLANEJADO = 2600
/**
 * Na GERAÇÃO o prompt carrega mais de nascença — cinco linhas de referência
 * (foto, clima, manual, prancha, logo) e a copy inteira — e o primeiro ensaio
 * real (Quintal, 05/09/2026) estourou 2.600 duas vezes seguidas e caiu no
 * fallback. 3.000 ainda é um oitavo do `buildArtePrompt`.
 */
export const TETO_DO_PROMPT_PLANEJADO_GERACAO = 3000
/** Rodadas do planejador: a 1ª costuma estourar o teto, a 2ª corrigir; a 3ª é a folga. */
const RODADAS_DO_PLANEJADOR = 3

export type PapelDaImagem =
  | 'origem'
  | 'foto'
  | 'fundo'
  | 'logo'
  | 'elemento'
  | 'manual'
  | 'prancha'
  | 'referencia-de-estilo'
  | 'modelo'

export interface ImagemDoPlano {
  /** Índice 1-based na ordem em que o gpt-image vai receber. */
  indice: number
  papel: PapelDaImagem
  rotulo?: string | null
  /** Só as imagens que o planejador precisa VER vão anexadas (origem, foto, fundo, manual, modelo). */
  buffer?: Buffer
}

export interface PlanejarMelhoriaArgs {
  modo: ModoDaMelhoria
  imagens: ImagemDoPlano[]
  brand: BrandContext | null
  /** A copy que a peça TEM de reproduzir (já na caixa certa). Vazia = sem régua. */
  copy: string[]
  /** A visão leu a origem e ela não tem texto (capa de carrossel). */
  arteSemTexto: boolean
  pedido: string
  instrucaoImagem: string | null
  formato: 'STORY' | 'SQUARE' | 'FEED_PORTRAIT'
  /** A marca é colada por código depois: o prompt reserva o canto e proíbe desenhar. */
  logoCompor: boolean
  /** Direção de arte PRÓPRIA do projeto (`Project.artImprovementPrompt`). */
  artDirection?: string | null
  timeoutMs?: number
}

export interface PromptPlanejado {
  prompt: string
  /**
   * A copy que a peça vai ter DEPOIS. Igual à de entrada em `rediagramar` e
   * `redesenhar` (imposto por código); em `refinar` pode mudar, porque o
   * pedido pode trocar/remover/acrescentar texto — e é ela que vira a régua da
   * conferência por visão. Sem isso, "troque a frase X por Y" era impossível
   * por construção: a régua antiga reprovava a arte por ela ter feito o que
   * foi pedido (3 tentativas queimadas no Bacana em 02/09/2026).
   */
  copyFinal: string[]
  modelo: string
  ms: number
  /** O que o planejador registrou de leitura da peça — vai para o fieldValues. */
  leitura?: string
  tentativas: number
}

const saidaSchema = z.object({
  leitura: z
    .string()
    .optional()
    .describe('Uma ou duas frases em português: o que você viu na peça (assunto, área calma, o que está fraco) e a decisão que tomou.'),
  prompt: z.string().describe('O prompt final para o gpt-image, em inglês, na estrutura pedida.'),
  copyFinal: z
    .array(z.string())
    .optional()
    .describe('Só no modo refinar: a copy da peça DEPOIS do pedido, bloco a bloco, na ordem de leitura.'),
})

const FORMATO_LEGIVEL: Record<PlanejarMelhoriaArgs['formato'], string> = {
  STORY: 'Instagram story, 9:16 vertical',
  SQUARE: 'Instagram post, 1:1 square',
  FEED_PORTRAIT: 'Instagram feed post, 4:5 portrait',
}

const PAPEL_LEGIVEL: Record<PapelDaImagem, string> = {
  origem: 'a arte de ORIGEM (a peça a melhorar)',
  foto: 'a FOTO real do prato/cena (cena final da peça)',
  fundo: 'a NOVA foto de fundo escolhida pelo cliente (substitui o fundo da origem por inteiro)',
  logo: 'o arquivo OFICIAL da logomarca',
  elemento: 'um elemento gráfico oficial do projeto (selo, ícone, ornamento)',
  manual: 'o MANUAL DE IDENTIDADE da marca (logo, paleta, tipografia, ornamentos) — a única fonte de fontes, cores e ornamentos',
  prancha: 'a PRANCHA TIPOGRÁFICA: o alfabeto completo das fontes reais da marca',
  'referencia-de-estilo': 'uma peça anterior aprovada desta marca (referência de CLIMA; o texto e a foto dela não são conteúdo)',
  modelo: 'o MODELO escolhido à mão (referência de estilo do texto; o texto e a foto dele não são conteúdo)',
}

/**
 * As regras da casa — o que a equipe aprendeu em reprovação real, escrito para
 * quem vai DECIDIR (o planejador), não para quem vai desenhar. Cada item cita
 * o incidente porque é assim que o repositório inteiro registra regra.
 */
const SYSTEM = `Você é o DIRETOR DE ARTE sênior de uma agência que cuida do Instagram de restaurantes, e o melhor redator de prompts do mundo para o modelo de imagem gpt-image-2 (endpoint de EDIÇÃO: ele recebe a arte de origem como Image 1 e mais imagens de referência, e devolve a peça nova).

Você recebe: a arte de origem (e as referências) COMO IMAGENS, a identidade da marca em texto, a copy que a peça tem de reproduzir, o MODO da melhoria e o pedido de quem está na frente da tela. Você OLHA a peça e escreve UM prompt para o gpt-image-2.

COMO O gpt-image-2 LÊ UM PROMPT (guia oficial da OpenAI e medições desta casa):
- Prompt CURTO e "skimmable": segmentos curtos, ordem fixa, cada frase concreta. Paredão de regras numeradas é IGNORADO — medido: um prompt de 22 mil caracteres com "não crie nada" escrito acrescentou um selo em 4 de 4 rodadas; um de 1,4 mil saiu limpo em 4 de 4.
- Texto literal ENTRE ASPAS, verbatim, e a ordem "exactly once, and nothing else". A caixa (maiúsculas/minúsculas) da arte É a caixa da string — copie cada bloco EXATAMENTE como recebido, sem mudar uma letra.
- Referências POR ÍNDICE ("Image 2 is…"), uma linha cada, dizendo o que copiar dela e o que NÃO é conteúdo (texto e foto de uma referência pertencem a um post antigo: nunca entram).
- Em edição: "change only X, keep everything else exactly the same" com a lista de preservação escrita.
- A instrução colada ao que ela governa vence a regra geral. O que vier por último pesa mais.
- ⛔ NOME DE FONTE VIRA TEXTO DESENHADO. Medido em 05/09/2026: o prompt dizia "line 2 in Amithen" e a peça saiu com a palavra "Amithen" letrada no lugar da copy. Portanto: nomes de fonte (Branley, Amithen, Stage Grotesk, Montserrat…) só aparecem na LINHA DA REFERÊNCIA da prancha/manual ("Image 4 is the type specimen: use its serif for the headline, its grotesk for the rest"). Ao falar de um bloco, cite-o pela PRÓPRIA copy entre aspas e diga a fonte pelo PAPEL: 'the block "Happy hour" in the brand's display serif from Image 4', nunca 'line 1 in DomaniCP, line 2 in Amithen'. Nunca escreva "line 1 … line 2 …" com nomes: o gerador letra o que lê.
- Descrever POSIÇÃO em coordenadas compete com a leitura da foto: diga ONDE em termos da imagem ("the calm blurred wall on the left", "below the plate") e só quando o modo permitir mover.

ESTRUTURA OBRIGATÓRIA DO PROMPT (em INGLÊS, no máximo ${TETO_DO_PROMPT_PLANEJADO} caracteres):
1. Papel e uso: "You are the art director of <marca>. Image 1 is a finished <formato> of this brand." + uma frase do que se quer (o MODO em palavras).
2. A DECISÃO DE DESIGN para ESTA peça, em 3 a 6 frases CONCRETAS, escritas depois de OLHAR a imagem — como um diretor de arte briefa um designer, nunca em adjetivos ("clear hierarchy", "sophisticated" não dizem nada). Diga: o que é o assunto e onde ele está; onde a foto é calma; qual bloco é a manchete e em que fonte, caixa, cor e tamanho relativo; como os blocos se agrupam (ex.: "unit name inside a small pill in Menta, hours below in two columns separated by a thin vertical rule"); qual ornamento do manual entra e onde; fundo (foto intocada, ou a cor da marca quando não há foto). Aqui entra também a direção de arte do pedido, se houver — ela manda.
3. Referências: uma linha por imagem a partir da Image 2, pelo índice, com o que copiar e os limites (texto/foto de referência não são conteúdo).
4. COPY: "Render EXACTLY these text blocks, verbatim, each exactly once, and nothing else:" seguido de um bloco por linha, entre aspas duplas, na ordem de leitura. Se a peça não tem texto: "This piece has no text and stays without text."
5. Lista de preservação/proibição, curta (até 8 linhas), específica desta peça e DESTE MODO. ⛔ Nunca escreva "keep the layout the same" num redesenho, nem "redesign" num refinar: a lista de um modo não serve para o outro.

REGRAS DA CASA (você decide quais entram no prompt; escreva só as que ESTA peça precisa):
- A copy é sagrada: não corrigir, traduzir, abreviar, completar nem acrescentar. NUNCA inventar horário, endereço, telefone, preço, cidade, contagem de avaliação, hashtag ou @. Quando faltar informação, a peça fica sem ela.
- Texto de imagem de referência (manual, modelo, prancha, peça antiga) NUNCA vira conteúdo da peça — diga isso na linha da referência.
- UMA marca por peça. A logomarca é o arquivo oficial inteiro, uma vez. Se a marca for colada por código depois (você será avisado), o prompt PROÍBE desenhar qualquer logo e reserva o canto inferior direito livre.
- A fotografia é intocável salvo autorização explícita: enquadramento, luz, cor, contraste, nitidez e objetos saem como entraram; nada de relumiar, recolorir, trocar fundo ou acrescentar objeto. Texto NUNCA cobre o assunto da foto (prato, bebida, rosto, produto).
- Nenhum contraste acrescentado sobre a foto na melhoria: sem véu, sem gradiente de borda a borda, sem tarja, sem escurecer a foto inteira. Se a origem já tem uma mancha/halo atrás do texto, ela fica como está e acompanha o texto. Legibilidade se resolve por POSIÇÃO (área calma) e pela cor do texto da marca.
- Peça SEM fotografia (só tipografia sobre fundo liso) continua sem fotografia: não inventar foto, ilustração ou pote.
- Story: nada importante no oitavo superior nem no oitavo inferior do quadro (o Instagram desenha por cima). Feed e quadrado não têm essa faixa.
- Tipografia SOMENTE a da marca (prancha/manual/nomes fornecidos). Uma cor de destaque por peça; paleta da marca só na camada gráfica.
- Quebra de linha: nenhuma linha com uma palavra sozinha (artigo/preposição pousa junto da palavra seguinte).
- Cada bloco de texto aparece UMA vez. Mover é mover, nunca copiar.

O QUE CADA MODO PERMITE — e como a seção 5 termina em cada um:
- rediagramar: a peça JÁ foi diagramada por quem cuida da marca. Muda SÓ onde o conjunto do texto pousa sobre a foto (para a área calma), o respiro entre blocos, o alinhamento e a quebra das linhas. NÃO muda: blocos, ordem de leitura, agrupamentos, hierarquia, fontes, cores, tamanhos relativos, ornamentos existentes, foto, halos existentes. NÃO cria nada (nem rodapé, nem selo, nem ícone, nem filete). A seção 5 é uma preserve list longa e explícita: "Keep exactly as in Image 1: the photograph (framing, light, colours), every typeface, every colour, the logo (once), the existing halo behind the text, the order and grouping of the blocks. Add no element. Only the position of the text group, its spacing and line breaks may change."
- redesenhar: a peça é MATÉRIA-PRIMA. Refaça a diagramação inteira no estilo da marca lendo o MANUAL e a PRANCHA: hierarquia, tipografia por nível, respiro generoso, ornamentos discretos DO MANUAL (filete, pill, marcador, ondulação) só onde ajudam a leitura, uma cor de destaque. A copy é verbatim; a fotografia (se houver) fica EXATAMENTE como está — mesmo enquadramento, luz e cores — e nunca é coberta no assunto; se não há foto, não acrescente foto, ilustração nem produto. Dê liberdade de composição ("you decide where each block sits by reading the image") — coordenadas não. A seção 5 lista o que NÃO muda no redesenho (copy, foto, uma logo, fontes só da marca, sem texto extra, safe area) e NUNCA diz para manter o layout: o layout é justamente o que muda.
- refinar: a peça é uma melhoria anterior e a pessoa pediu UMA mudança. O prompt inteiro gira em torno de "Change only: <o pedido, concreto e localizado na imagem>." e a seção 5 é "Keep everything else exactly the same: layout, typefaces, colours, photograph, logo, every other text block, margins." Se o pedido troca/remove/acrescenta texto, o bloco COPY já reflete a copy DEPOIS da mudança, e você devolve essa copy em copyFinal (bloco a bloco, na ordem). Se o pedido não mexe em texto, copyFinal = a copy recebida, inalterada.

O PEDIDO de quem está na frente da tela é a autoridade dentro dos limites do modo: onde ele mandar (destacar uma palavra, mudar alinhamento, cor de um nível, tirar um ornamento), faça e diga no prompt. Pedido que só PROÍBE ("não inclua ícones") vira linha de proibição e não afrouxa nada. O pedido NÃO vence: inventar dado, mexer na foto sem o campo de ajuste da foto, desenhar a marca quando ela é colada por código.

Se houver AJUSTE NA FOTO autorizado, ele entra como exceção explícita e única à intocabilidade da foto ("The only change to the photograph is: …; everything else in it stays untouched").

Responda em JSON com os campos: leitura (1-2 frases em português), prompt (inglês), e copyFinal SOMENTE no modo refinar.`

/** As famílias de fonte da marca — o que `fontesForaDaReferencia` procura. */
function nomesDeFonte(brand: BrandContext | null): string[] {
  if (!brand) return []
  return [brand.fonts.title, brand.fonts.subtitle, brand.fonts.body, ...brand.specimenFontFamilies].filter(
    (f): f is string => typeof f === 'string' && f.trim().length > 0,
  )
}

function contextoDaMarca(brand: BrandContext | null): string {
  if (!brand) return 'MARCA: (sem identidade cadastrada — use só as referências visuais).'
  const linhas: string[] = [`MARCA: ${brand.projectName}`]
  const fontes: string[] = []
  if (brand.fonts.title) fontes.push(`títulos: ${brand.fonts.title}`)
  if (brand.fonts.subtitle) fontes.push(`subtítulos: ${brand.fonts.subtitle}`)
  if (brand.fonts.body) fontes.push(`corpo: ${brand.fonts.body}`)
  if (fontes.length) linhas.push(`FONTES OFICIAIS: ${fontes.join(' · ')}`)
  if (brand.colors.length) {
    linhas.push(`PALETA: ${brand.colors.slice(0, 10).map((c) => `${c.name} ${c.hexCode.toUpperCase()}`).join(' | ')}`)
  }
  // O DNA inteiro entra AQUI — é o lugar onde texto longo é lido. Ele NÃO vai
  // ao gpt-image; o planejador tira dele só o que esta peça precisa.
  if (brand.dna.visualStyle) linhas.push(`ESTILO VISUAL (DNA): ${brand.dna.visualStyle}`)
  if (brand.dna.composition) linhas.push(`COMPOSIÇÃO (DNA — é o repertório da marca, não ordem para esta peça): ${brand.dna.composition}`)
  if (brand.dna.contentRules) linhas.push(`REGRAS DA MARCA (proibições — valem para o que a peça CRIA): ${brand.dna.contentRules}`)
  if (brand.cuisineType) linhas.push(`COZINHA: ${brand.cuisineType}`)
  return linhas.join('\n')
}

function contextoDaPeca(args: PlanejarMelhoriaArgs): string {
  const linhas: string[] = []
  linhas.push(`MODO: ${args.modo}`)
  linhas.push(`FORMATO: ${FORMATO_LEGIVEL[args.formato]}`)
  linhas.push(
    `IMAGENS QUE O gpt-image VAI RECEBER, NA ORDEM (use estes índices no prompt):\n${args.imagens
      .map((i) => `- Image ${i.indice}: ${PAPEL_LEGIVEL[i.papel]}${i.rotulo ? ` (${i.rotulo})` : ''}${i.buffer ? '' : ' [não anexada a você; descreva pelo papel]'}`)
      .join('\n')}`,
  )
  if (args.arteSemTexto) {
    linhas.push('COPY: a arte de origem NÃO TEM TEXTO (foto pura). A peça continua sem texto — isso é deliberado.')
  } else if (args.copy.length > 0) {
    linhas.push(`COPY (${args.copy.length} bloco${args.copy.length === 1 ? '' : 's'}, verbatim, na ordem de leitura):\n${args.copy.map((b) => `"${b}"`).join('\n')}`)
  } else {
    linhas.push('COPY: ninguém transcreveu a copy. Leia o texto da Image 1 e reproduza-o verbatim no bloco COPY do prompt, sem corrigir nem completar; o que estiver ilegível fica de fora.')
  }
  linhas.push(
    args.logoCompor
      ? 'LOGOMARCA: é COLADA POR CÓDIGO depois da geração, no canto inferior direito. O prompt proíbe desenhar qualquer logo/selo/wordmark e reserva esse canto livre de texto e ornamento.'
      : 'LOGOMARCA: desenhada pelo modelo, uma vez, igual ao arquivo oficial (Image da logo, ou como aparece na origem).',
  )
  linhas.push(args.pedido.trim() ? `PEDIDO DE QUEM ESTÁ NA TELA: ${args.pedido.trim()}` : 'PEDIDO: (vazio — vale o padrão do modo)')
  if (args.instrucaoImagem?.trim()) linhas.push(`AJUSTE NA FOTO AUTORIZADO (única exceção): ${args.instrucaoImagem.trim()}`)
  if (args.artDirection?.trim()) linhas.push(`DIREÇÃO DE ARTE PRÓPRIA DESTE PROJETO (respeite): ${args.artDirection.trim()}`)
  return linhas.join('\n\n')
}

/* ────────────────────────────────────────────────────────────────────────────
 * GERAÇÃO (trilha `arte`, peça avulsa) — F6 do plano
 * ──────────────────────────────────────────────────────────────────────────── */

export type PapelDaReferenciaDeGeracao =
  | 'subject'
  | 'anchor-dish'
  | 'anchor-ambient'
  | 'style'
  | 'style-guide'
  | 'brand-card'
  | 'type-specimen'
  | 'logo'

export interface ReferenciaDoPlanoDeGeracao {
  indice: number
  papel: PapelDaReferenciaDeGeracao
  rotulo?: string | null
  /** Modo modelo-livre no `style-guide`: veste o texto, não copia o layout. */
  estiloLivre?: boolean
  buffer?: Buffer
}

export interface PlanejarArteArgs {
  copy: string[]
  pedido: string
  brand: BrandContext | null
  referencias: ReferenciaDoPlanoDeGeracao[]
  formato: 'story' | 'feed' | 'quadrado'
  alturaPx: number
  instrucaoImagem: string | null
  /** A marca é colada por código depois (`compor`): proibir desenhar e reservar o canto. */
  logoCompor: boolean
  /** A assinatura tipográfica da marca (quando cadastrada) — texto pronto de `assinaturaTipografica`. */
  assinaturaTipografica?: string | null
  timeoutMs?: number
}

const PAPEL_GERACAO_LEGIVEL: Record<PapelDaReferenciaDeGeracao, string> = {
  subject: 'a FOTO REAL do prato/cena — é a CENA FINAL da peça, intocada',
  'anchor-dish': 'uma segunda foto real do mesmo prato (fidelidade à aparência)',
  'anchor-ambient': 'foto real do ambiente do restaurante (referência de LUGAR, nunca de enquadramento; a comida dela não é conteúdo)',
  style: 'uma peça anterior aprovada desta marca — referência de CLIMA da camada gráfica (o texto e a foto dela não são conteúdo)',
  'style-guide': 'o MODELO escolhido à mão — uma peça aprovada desta marca (o texto e a foto dele não são conteúdo)',
  'brand-card': 'o MANUAL DE IDENTIDADE da marca (logo, paleta, tipografia, ornamentos) — a única fonte de fontes, cores e ornamentos',
  'type-specimen': 'a PRANCHA TIPOGRÁFICA: o alfabeto completo das fontes reais da marca',
  logo: 'o arquivo OFICIAL da logomarca — reproduzir fielmente, uma vez',
}

/**
 * As regras da GERAÇÃO — o que `buildArtePrompt` acumulou em reprovação real,
 * agora dito a quem DECIDE. A diferença para a melhoria: aqui a peça nasce do
 * zero sobre uma foto, então há regras de área do texto, de halo e de leitura
 * da foto que na melhoria não existem (lá a peça já chegou diagramada).
 */
const SYSTEM_GERACAO = `${SYSTEM}

ESTA TAREFA É GERAÇÃO, NÃO MELHORIA: não existe arte de origem. O teto do prompt aqui é ${TETO_DO_PROMPT_PLANEJADO_GERACAO} caracteres (não ${TETO_DO_PROMPT_PLANEJADO}); prompt acima disso é recusado. A Image 1 é a FOTOGRAFIA REAL do prato/cena, e a peça é essa foto MAIS a camada gráfica (copy e marca). Regras que valem aqui e SÓ aqui:
- A foto é a cena final: não recriar, não trocar fundo, não relumiar, não acrescentar nem remover objeto; se o enquadramento exigir completar bordas, estender a própria cena. O dono do restaurante precisa reconhecer o próprio prato e o próprio salão.
- A fotografia é a protagonista: TODO o conjunto de texto ocupa no máximo ~1/5 do quadro; o lockup da manchete não passa de ~15% da altura, nenhuma linha sozinha passa de ~7%; nenhuma palavra isolada passa de ~35% da largura. Hierarquia por peso, cor e posição — nunca por tamanho. Conjunto compacto na vertical; nunca cartaz de varejo.
- O texto mora no espaço LIVRE da foto (nunca sobre o prato, o rosto ou o assunto). A leitura vem de um HALO: mancha escura DESFOCADA só atrás do bloco de texto, sem borda, que desmancha para a foto — nunca gradiente de borda a borda, nunca tarja, nunca escurecer a foto inteira. Não cabendo sem apagar a foto, o texto muda de lugar.
- Atrás do texto há SÓ a foto e o halo: nada de textura, folha, tábua ou ilustração pintada por cima.
- Autonomia de composição: diga ao gerador para ler a foto e pousar o texto onde ela é calma (coluna alta à esquerda, faixa no rodapé, bloco no topo — o que ESTA foto pedir). Você já viu a foto: DIGA onde ela é calma e proponha o lugar, sem coordenadas.
- Horário e endereço (serviço) ficam agrupados no RODAPÉ, miúdos e legíveis, separados da manchete — nunca pendurados na manchete.
- Modelo escolhido à mão (Image de papel style-guide): em modo livre, copiar como o texto é VESTIDO (fontes por nível, caixa, cor, proporções, ornamentos) e decidir a posição pela foto; em modo estrito, mesma posição e alinhamento do modelo. O texto e a foto do modelo NUNCA são conteúdo.
- Story: nada importante nos ~1/8 superior e ~1/8 inferior (o número em pixel virá anexado ao prompt pelo sistema; não invente outro).
- Uma cor de destaque; tipografia SOMENTE a da prancha/manual; quebras de linha sem palavra sozinha.

Responda em JSON com: leitura (1-2 frases em português: o que você viu na foto e onde decidiu pousar o texto) e prompt (inglês). Não devolva copyFinal.`

function contextoDaGeracao(args: PlanejarArteArgs): string {
  const formato: Record<PlanejarArteArgs['formato'], string> = {
    story: 'Instagram story, 9:16 vertical',
    feed: 'Instagram feed post, 4:5 portrait',
    quadrado: 'Instagram post, 1:1 square',
  }
  const linhas: string[] = [
    `FORMATO: ${formato[args.formato]} (${args.alturaPx}px de altura)`,
    `IMAGENS QUE O gpt-image VAI RECEBER, NA ORDEM (use estes índices no prompt):\n${args.referencias
      .map(
        (r) =>
          `- Image ${r.indice}: ${PAPEL_GERACAO_LEGIVEL[r.papel]}${r.rotulo ? ` (${r.rotulo})` : ''}${
            r.papel === 'style-guide' ? (r.estiloLivre ? ' [modo LIVRE: veste o texto, layout é seu]' : ' [modo ESTRITO: mesmo layout]') : ''
          }${r.buffer ? '' : ' [não anexada a você; descreva pelo papel]'}`,
      )
      .join('\n')}`,
    args.copy.length > 0
      ? `COPY (${args.copy.length} bloco${args.copy.length === 1 ? '' : 's'}, verbatim, na ordem de leitura; a caixa JÁ é a da marca — copie letra por letra):\n${args.copy.map((b) => `"${b}"`).join('\n')}`
      : 'COPY: esta peça NÃO leva texto (capa/foto pura). Nenhuma letra na peça.',
    args.logoCompor
      ? 'LOGOMARCA: é COLADA POR CÓDIGO depois da geração. O prompt PROÍBE desenhar qualquer logo/selo/wordmark (o sistema anexa a linha do canto reservado).'
      : args.referencias.some((r) => r.papel === 'logo')
        ? 'LOGOMARCA: desenhada pelo modelo a partir do arquivo oficial (Image da logo), uma vez, num canto calmo com contraste; em story, nos cantos inferiores.'
        : 'LOGOMARCA: esta peça não leva logo.',
    args.pedido.trim() ? `PEDIDO / DIREÇÃO DE ARTE DE QUEM ESTÁ NA TELA: ${args.pedido.trim()}` : 'PEDIDO: (vazio — vale o padrão da marca)',
  ]
  if (args.instrucaoImagem?.trim()) linhas.push(`AJUSTE NA FOTO AUTORIZADO (única exceção à fidelidade): ${args.instrucaoImagem.trim()}`)
  if (args.assinaturaTipografica?.trim()) linhas.push(`ASSINATURA TIPOGRÁFICA DA MARCA (como ela usa as fontes — obedeça):\n${args.assinaturaTipografica.trim()}`)
  return linhas.join('\n\n')
}

export interface PromptDeGeracaoPlanejado {
  prompt: string
  modelo: string
  ms: number
  leitura?: string
  tentativas: number
}

/**
 * Planeja a GERAÇÃO de uma peça avulsa da trilha `arte`. `null` = o chamador
 * cai em `buildArtePrompt`. Nunca lança. Carrossel e peça com cartão de
 * documento NÃO passam por aqui: o LOOK SPINE e a faixa do cartão são
 * mecânicos e medidos, e a série é o caso em que rigidez é desejada.
 */
export async function planejarArte(args: PlanejarArteArgs): Promise<PromptDeGeracaoPlanejado | null> {
  const inicio = Date.now()
  const anexos = args.referencias.filter((r) => r.buffer)
  const contexto = `${contextoDaMarca(args.brand)}\n\n${contextoDaGeracao(args)}`
  let feedback: string | null = null
  for (let rodada = 1; rodada <= RODADAS_DO_PLANEJADOR; rodada++) {
    try {
      const { object } = await generateObject({
        model: openai(PLANNER_MODEL),
        ...(ACEITA_TEMPERATURA ? { temperature: 0.4 } : {}),
        maxOutputTokens: 4000,
        abortSignal: AbortSignal.timeout(args.timeoutMs ?? 60_000),
        schema: saidaSchema,
        system: SYSTEM_GERACAO,
        messages: [
          {
            role: 'user',
            content: [
              ...anexos.map((r) => ({ type: 'image' as const, image: r.buffer as Buffer })),
              { type: 'text' as const, text: feedback ? `${contexto}\n\nSEU PROMPT ANTERIOR FOI RECUSADO:\n${feedback}\nReescreva corrigindo.` : contexto },
            ],
          },
        ],
      })
      const prompt = object.prompt.trim()
      const problemas: string[] = []
      if (prompt.length > TETO_DO_PROMPT_PLANEJADO_GERACAO) {
        problemas.push(`o prompt tem ${prompt.length} caracteres e o teto é ${TETO_DO_PROMPT_PLANEJADO_GERACAO} — corte prosa, nunca a copy.`)
      }
      const faltam = copyEstaNoPrompt(prompt, args.copy)
      if (faltam.length > 0) {
        problemas.push(`estes blocos da copy NÃO estão no prompt, verbatim e entre aspas: ${faltam.map((t) => `"${t}"`).join(', ')}`)
      }
      const fontesSoltas = fontesForaDaReferencia(prompt, nomesDeFonte(args.brand))
      if (fontesSoltas.length > 0) {
        problemas.push(
          `nome de fonte fora da linha de referência (${fontesSoltas.join(', ')}) — o gerador letra o que lê (a peça do Quintal saiu com "Amithen" desenhado). Cite a fonte pelo papel ("the brand's display serif from Image N") e deixe os nomes só na linha "Image N is the type specimen…".`,
        )
      }
      if (problemas.length === 0) {
        return { prompt, modelo: PLANNER_MODEL, ms: Date.now() - inicio, leitura: object.leitura?.trim() || undefined, tentativas: rodada }
      }
      feedback = problemas.join('\n')
      console.warn(`[diretor-de-arte/geração] rodada ${rodada} recusada: ${feedback}`)
    } catch (erro) {
      console.warn(`[diretor-de-arte/geração] rodada ${rodada} falhou:`, erro instanceof Error ? erro.message : erro)
      feedback = null
      if (rodada === RODADAS_DO_PLANEJADOR) break
    }
  }
  return null
}

/**
 * Nome de fonte fora da linha de referência — a trava mecânica da regra acima.
 *
 * Devolve os nomes que aparecem em linhas que NÃO começam com "Image N"
 * (a linha da prancha/manual é o único lugar autorizado). Compara por família
 * (primeira palavra com 4+ letras do nome), porque "StageGrotesk Light" e
 * "Stage Grotesk" são a mesma fonte escrita de dois jeitos.
 */
export function fontesForaDaReferencia(prompt: string, fontes: Array<string | null | undefined>): string[] {
  const familias = new Set<string>()
  for (const f of fontes) {
    const primeira = (f ?? '').trim().split(/\s+/)[0]
    if (primeira && primeira.length >= 4) familias.add(primeira.toLowerCase())
  }
  if (familias.size === 0) return []
  const achadas = new Set<string>()
  for (const linha of prompt.split('\n')) {
    if (/^\s*image\s+\d+/i.test(linha)) continue
    // A COPY entre aspas também é isenta: se a copy CITAR a fonte ("Noite
    // Montserrat"), ela tem de estar lá.
    const semAspas = linha.replace(/"[^"]*"/g, '').replace(/“[^”]*”/g, '')
    const baixa = semAspas.toLowerCase()
    for (const fam of familias) {
      if (new RegExp(`\\b${fam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(baixa)) achadas.add(fam)
    }
  }
  return [...achadas]
}

/** Todo bloco da copy tem de estar no prompt, verbatim (a menos de espaços/caixa). */
export function copyEstaNoPrompt(prompt: string, copy: string[]): string[] {
  const alvo = normalizeForComparison(prompt)
  return copy.filter((b) => {
    const n = normalizeForComparison(b)
    return n.length > 0 && !alvo.includes(n)
  })
}

/**
 * Planeja a melhoria. Devolve `null` quando o planejador não conseguiu — o
 * chamador cai no prompt montado por código. Nunca lança.
 */
export async function planejarMelhoria(args: PlanejarMelhoriaArgs): Promise<PromptPlanejado | null> {
  const inicio = Date.now()
  const anexos = args.imagens.filter((i) => i.buffer)
  const contexto = `${contextoDaMarca(args.brand)}\n\n${contextoDaPeca(args)}`
  let tentativas = 0
  let feedback: string | null = null

  for (let rodada = 1; rodada <= RODADAS_DO_PLANEJADOR; rodada++) {
    tentativas = rodada
    try {
      const { object } = await generateObject({
        model: openai(PLANNER_MODEL),
        ...(ACEITA_TEMPERATURA ? { temperature: 0.4 } : {}),
        maxOutputTokens: 4000,
        abortSignal: AbortSignal.timeout(args.timeoutMs ?? 60_000),
        schema: saidaSchema,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              ...anexos.map((i) => ({ type: 'image' as const, image: i.buffer as Buffer })),
              {
                type: 'text' as const,
                text: feedback ? `${contexto}\n\nSEU PROMPT ANTERIOR FOI RECUSADO:\n${feedback}\nReescreva corrigindo.` : contexto,
              },
            ],
          },
        ],
      })

      const prompt = object.prompt.trim()
      const problemas: string[] = []
      if (prompt.length > TETO_DO_PROMPT_PLANEJADO) {
        problemas.push(`o prompt tem ${prompt.length} caracteres e o teto é ${TETO_DO_PROMPT_PLANEJADO} — corte prosa, nunca a copy.`)
      }
      // A copy que a peça vai ter: em refinar o planejador pode mudá-la; nos
      // outros modos a de entrada manda, por código.
      let copyFinal = args.copy
      if (args.modo === 'refinar' && Array.isArray(object.copyFinal) && object.copyFinal.length > 0) {
        copyFinal = object.copyFinal.map((t) => t.trim()).filter(Boolean)
      }
      if (!args.arteSemTexto) {
        const faltam = copyEstaNoPrompt(prompt, copyFinal)
        if (faltam.length > 0) {
          problemas.push(`estes blocos da copy NÃO estão no prompt, verbatim e entre aspas: ${faltam.map((t) => `"${t}"`).join(', ')}`)
        }
      }
      const fontesSoltas = fontesForaDaReferencia(prompt, nomesDeFonte(args.brand))
      if (fontesSoltas.length > 0) {
        problemas.push(
          `nome de fonte fora da linha de referência (${fontesSoltas.join(', ')}) — o gerador letra o que lê. Cite a fonte pelo papel ("the brand's display serif from Image N") e deixe os nomes só na linha "Image N is the type specimen…".`,
        )
      }
      if (problemas.length === 0) {
        return {
          prompt,
          copyFinal,
          modelo: PLANNER_MODEL,
          ms: Date.now() - inicio,
          leitura: object.leitura?.trim() || undefined,
          tentativas,
        }
      }
      feedback = problemas.join('\n')
      console.warn(`[diretor-de-arte] rodada ${rodada} recusada: ${feedback}`)
    } catch (erro) {
      console.warn(`[diretor-de-arte] rodada ${rodada} falhou:`, erro instanceof Error ? erro.message : erro)
      feedback = null
      if (rodada === RODADAS_DO_PLANEJADOR) break
    }
  }
  return null
}
