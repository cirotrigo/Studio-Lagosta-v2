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
import { formatarEstiloParaPrompt } from '@/lib/brand/estilo-das-referencias'
import type { ModoDaMelhoria } from './modo-da-melhoria'
import { normalizeForComparison } from './text-comparison'
import { blocosDeServico } from './blocos-de-servico'

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
  /**
   * 🔴 QUEM ESCOLHE O CANTO DA MARCA É QUEM VÊ A FOTO.
   *
   * Tentei antes achar o bloco de copy por medição de pixels — "claro E
   * contrastado" — para mandar a marca ao lado oposto. Falha completa em foto
   * real, medida em 07/09/2026 nas quatro artes desta sessão: os centros de
   * massa deram x≈0,45–0,67 e y≈0,29–0,39 em TODAS, incluindo a arte cujo
   * texto está inteiro no terço inferior. Reflexo de taça, louça branca e
   * garrafa iluminada são claros e contrastados exatamente como letra, e num
   * bistrô com luz baixa eles dominam. Heurística de pixel não distingue
   * lettering de brilho.
   *
   * O planejador, ao contrário, JÁ olhou a foto e JÁ decidiu onde pôs o texto
   * — para ele isto é uma pergunta trivial, e não custa chamada nenhuma. O
   * compositor continua com a palavra final (contraste e calma medidos), mas
   * parte daqui em vez de partir do canto da arte de referência, que foi
   * escolhido para OUTRA foto.
   */
  cantoDaMarca: z
    .enum(['superior-esquerdo', 'superior-direito', 'inferior-esquerdo', 'inferior-direito'])
    .optional()
    .describe(
      'O canto onde a logomarca deve pousar NESTA foto: o mais calmo, no lado OPOSTO ao grosso do texto e fora do alcance do assunto (prato, rosto, taça, produto) — não só sem cobri-lo, mas sem encostar. Em story, evite o superior-esquerdo (o Instagram desenha o avatar ali). Omita se nenhum canto servir.',
    ),
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
- Nenhum contraste acrescentado sobre a foto na melhoria — em TODOS os modos, inclusive redesenhar: sem véu, sem gradiente, sem faixa de "proteção" no rodapé, sem tarja, sem escurecer a foto inteira. Isto vence o manual e o DNA da marca quando eles descrevem "gradiente de proteção" ou "véu de leitura": o manual dita fontes, cores e ornamentos, não licença para escurecer a foto (medido em 05/09/2026: o redesenho do Espeto ganhou uma faixa marrom no rodapé porque o manual a mencionava). Se a origem já tem uma mancha/halo atrás do texto, ela fica como está e acompanha o texto. Legibilidade se resolve por POSIÇÃO (área calma) e pela cor do texto da marca.
- MEDIDA DOS ADJETIVOS DO PEDIDO: "um pouco maior/menor" é ~10-15% do tamanho atual; "maior/menor" é ~25%; "bem maior" é ~40%. Escreva o número no prompt ("about 15% larger"). E todo texto que cresce mantém a folga que tem hoje da logo e dos blocos vizinhos — quebrando a linha, se preciso, nunca avançando sobre a marca (medido em 05/09/2026: "um pouco maior" no endereço do Espeto fez a linha quase encostar na logo).
- Peça SEM fotografia (só tipografia sobre fundo liso) continua sem fotografia: não inventar foto, ilustração ou pote.
- Story: nada importante no oitavo superior nem no oitavo inferior do quadro (o Instagram desenha por cima). Feed e quadrado não têm essa faixa.
- Tipografia SOMENTE a da marca (prancha/manual/nomes fornecidos). Uma cor de destaque por peça; paleta da marca só na camada gráfica.
- Quebra de linha: nenhuma linha com uma palavra sozinha (artigo/preposição pousa junto da palavra seguinte).
- Cada bloco de texto aparece UMA vez. Mover é mover, nunca copiar.

O QUE CADA MODO PERMITE — e como a seção 5 termina em cada um:
- rediagramar: a peça JÁ foi diagramada por quem cuida da marca. Muda SÓ onde o conjunto do texto pousa sobre a foto (para a área calma), o respiro entre blocos, o alinhamento e a quebra das linhas. NÃO muda: blocos, ordem de leitura, agrupamentos, hierarquia, fontes, cores, tamanhos relativos, ornamentos existentes, foto, halos existentes. NÃO cria nada (nem rodapé, nem selo, nem ícone, nem filete). A seção 5 é uma preserve list longa e explícita: "Keep exactly as in Image 1: the photograph (framing, light, colours), every typeface, every colour, the logo (once), the existing halo behind the text, the order and grouping of the blocks. Add no element. Only the position of the text group, its spacing and line breaks may change."
- redesenhar: a peça é MATÉRIA-PRIMA. Refaça a diagramação inteira no estilo da marca lendo o MANUAL e a PRANCHA: hierarquia, tipografia por nível, respiro generoso, uma cor de destaque — e os SEPARADORES e ÍCONES da marca. O manual mostra os separadores (filete, filete com ponto, sublinhado manuscrito, tag de cor…) e os ícones oficiais (relógio, pin, calendário…) que a marca usa de verdade, e o bloco ESTILO OBSERVADO diz onde ela os põe. Use-os como a marca usa (ícone de relógio antes do horário, pin antes do endereço, filete entre manchete e apoio, tag atrás do CTA) — pequenos, na cor de destaque, nunca inventados fora do manual e nunca em peça cuja marca não usa nenhum. Diga no prompt "the small line icons and rules exactly as shown in the brand manual (Image N)" em vez de proibir ícones em bloco; a proibição é para ícone, selo ou ornamento que NÃO esteja no manual. A copy é verbatim; a fotografia (se houver) fica EXATAMENTE como está — mesmo enquadramento, luz e cores — e nunca é coberta no assunto; se não há foto, não acrescente foto, ilustração nem produto. Dê liberdade de composição ("you decide where each block sits by reading the image") — coordenadas não. A seção 5 lista o que NÃO muda no redesenho (copy, foto, uma logo, fontes só da marca, sem texto extra, safe area) e NUNCA diz para manter o layout: o layout é justamente o que muda.
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
  // A assinatura REAL, lida das peças aprovadas. Quando ela e a prosa do DNA
  // divergem (o manual do Espeto dizia Roadhawk; as peças aprovadas usam
  // Bevan), vale o que está nas peças — o DNA descreve intenção, isto mede.
  if (brand.estiloDasReferencias) {
    linhas.push(
      `ESTILO OBSERVADO NAS PEÇAS APROVADAS (assinatura real; quando divergir da prosa do DNA acima, ESTA vence — EXCETO as "Regras aprendidas na prática" do DNA, que são decisões do dono da marca e vencem tudo. Os separadores/ícones listados aqui são os únicos ornamentos que a marca usa):\n${formatarEstiloParaPrompt(brand.estiloDasReferencias)}`,
    )
  }
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
  /**
   * Índice 1-based na ordem em que o gpt-image vai receber. Referência que o
   * gpt-image NÃO recebe (`visivelAoGerador: false`) não tem índice útil —
   * o diretor a descreve em palavras, nunca por "Imagem N".
   */
  indice: number
  papel: PapelDaReferenciaDeGeracao
  rotulo?: string | null
  /** Modo modelo-livre no `style-guide`: veste o texto, não copia o layout. */
  estiloLivre?: boolean
  buffer?: Buffer
  /**
   * `false` = só o DIRETOR vê esta imagem; o gpt-image não a recebe. É o caso
   * da arte de referência escolhida à mão desde 08/09/2026: ela é ANALISADA
   * para personalizar o prompt, não enviada para o modelo ler por conta
   * própria — mandá-la junto fazia o texto e a cena do post antigo vazarem,
   * e cada imagem a mais afastava a peça do que se pedia (medição de 07-08/09).
   */
  visivelAoGerador?: boolean
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
  /** A leitura MEDIDA da foto (`resumirMapaDeCalma`) — onde ela é calma, onde o assunto está. */
  leituraDaFoto?: string | null
  /** A entrada da foto no catálogo do acervo (`resumirCatalogoDaFoto`). */
  catalogoDaFoto?: string | null
  /**
   * A foto JÁ vai cortada no enquadramento final e o gpt-image só pode pintar
   * dentro das ZONAS que o diretor declarar (máscara). Muda o que ele escreve
   * sobre enquadramento e exige o campo `zonas`.
   */
  mascara?: boolean
  /**
   * As palavras escritas na referência escolhida à mão (`GuiaLido.textos`).
   * INSUMO DA TRAVA, nunca do prompt: se alguma reaparecer no prompt do
   * diretor sem estar na copy, o prompt é recusado.
   */
  textosDaReferencia?: string[] | null
  timeoutMs?: number
}

const PAPEL_GERACAO_LEGIVEL: Record<PapelDaReferenciaDeGeracao, string> = {
  subject: 'a FOTO REAL do prato/cena — é a CENA FINAL da peça, intocada',
  'anchor-dish': 'uma segunda foto real do mesmo prato (fidelidade à aparência)',
  'anchor-ambient': 'foto real do ambiente do restaurante (referência de LUGAR, nunca de enquadramento; a comida dela não é conteúdo)',
  style: 'uma peça anterior aprovada desta marca — referência de CLIMA da camada gráfica (o texto e a foto dela não são conteúdo)',
  'style-guide': 'o MODELO escolhido à mão — uma peça aprovada desta marca (o texto e a foto dele não são conteúdo)',
  'brand-card': 'o MANUAL DE MARCA (design system: logo e variações, paleta, alfabetos oficiais, filetes, ícones e selos) — a única fonte de fontes, cores e ornamentos',
  'type-specimen': 'a PRANCHA TIPOGRÁFICA: o alfabeto completo das fontes reais da marca',
  logo: 'o arquivo OFICIAL da logomarca — reproduzir fielmente, uma vez',
}

/**
 * Teto do prompt da GERAÇÃO. O briefing que serve de molde (o do Ciro para o
 * happy hour da Wine Vix, 08/09/2026) tem ~4.300 caracteres com doze seções
 * curtas — é "skimmable" porque é seccionado, não porque é curto. 4.500 dá
 * espaço para ele e para a copy; o bloco da marca e a safe area entram DEPOIS,
 * anexados pelo sistema.
 */
export const TETO_DO_PROMPT_PLANEJADO_GERACAO = 4500

/**
 * O DIRETOR DE ARTE da GERAÇÃO — reescrito em 08/09/2026 em cima do briefing
 * que o Ciro escreveu à mão para a Wine Vix e pediu como molde ("ele não
 * precisa engessar tudo; pode confiar mais no gpt-image").
 *
 * O que mudou em relação ao diretor de 05-07/09:
 *  - As regras de HALO, véu e degradê SAÍRAM. Legibilidade é decisão do
 *    gpt-image; o diretor resolve leitura por POSIÇÃO (área calma) e pela cor
 *    do texto, e não prescreve tratamento nenhum sobre a foto.
 *  - Os tetos numéricos de tamanho (1/5 do quadro, 15% da altura…) saíram. A
 *    manchete é o maior elemento e a foto é a protagonista — o resto é a
 *    decisão do diretor para ESTA foto e ESTA copy.
 *  - O prompt sai em PORTUGUÊS, no formato de briefing por seções (o molde do
 *    Ciro; o prompt do manual em português já tinha saído 9 de 9).
 *  - A referência escolhida à mão é VISTA pelo diretor e traduzida em
 *    instruções; o gpt-image não a recebe.
 *  - A foto chega com MEDIDA (mapa de calma) e com o catálogo do acervo, para
 *    a escolha de posição partir de dado e não de estimativa.
 *
 * O que ficou porque é mecânico e medido: copy verbatim conferida
 * (`copyEstaNoPrompt`), nome de fonte só na linha da imagem
 * (`fontesForaDaReferencia`), serviço no rodapé (`servicoSemRodape`), palavras
 * da referência fora do prompt (`palavrasDaReferenciaNoPrompt`), teto de
 * caracteres. E o que o sistema anexa DEPOIS: o canto da marca e a safe area
 * em pixel.
 */
export const SYSTEM_GERACAO = `Você é o DIRETOR DE ARTE sênior de uma agência que cuida do Instagram de restaurantes, e escreve o briefing que um designer excelente — o modelo de imagem gpt-image-2 — vai executar. Ele recebe a FOTOGRAFIA como Imagem 1 e o MANUAL DE MARCA como Imagem 2 (quando houver), e desenha a peça a partir do seu briefing. Confie nele: ele compõe, diagrama e resolve legibilidade muito bem quando recebe uma direção clara. O seu trabalho é DIRIGIR — decidir o que ESTA peça precisa — não listar tudo o que poderia dar errado.

VOCÊ RECEBE: a foto (você a vê), o manual (você o vê), a identidade da marca em texto, a copy, a LEITURA MEDIDA da foto (onde ela é calma, onde o assunto está — calculada, não estimada), o catálogo do acervo sobre a foto, e às vezes uma REFERÊNCIA escolhida à mão (uma peça aprovada desta marca) e um pedido de quem está na tela.

COMO ESCREVER O BRIEFING (em PORTUGUÊS, no máximo ${TETO_DO_PROMPT_PLANEJADO_GERACAO} caracteres, seções curtas com TÍTULO EM CAIXA ALTA, nesta ordem):

Abertura (2 a 4 frases): "Crie uma arte para <formato> do Instagram, <proporção>, seguindo rigorosamente a identidade visual de <marca> apresentada no manual de marca anexado (Imagem 2)." Depois a DIREÇÃO ESTÉTICA desta peça em frases concretas — o que ela deve parecer (peça editorial de gastronomia? cartaz de churrascaria? convite de bistrô?) e o que NÃO deve parecer. Tire isso do DNA e do ESTILO OBSERVADO da marca, nunca de adjetivos vazios ("sofisticado", "clean" não dizem nada sozinhos; "bastante respiro, hierarquia clara e poucos elementos gráficos" diz).

FOTO DE FUNDO: a Imagem 1 é a única imagem principal, ocupando 100% da tela, adaptada ao formato só por enquadramento. Diga o que há nela (o assunto, as pessoas, os rostos) e o que tem de permanecer completamente visível. Diga ONDE está o espaço calmo — use a LEITURA MEDIDA — e por isso onde o bloco principal vai. Não prescreva véu, degradê, halo, sombra ou "contraste": o designer resolve a leitura; se a posição escolhida for calma, ela já lê.

IDENTIDADE VISUAL: o manual (Imagem 2) é a ÚNICA referência para tipografia, cores, logotipo, filetes, elementos gráficos e proporções. Diga as cores DESTA peça pelo nome do manual (ex.: creme para os textos; o dourado oficial só como destaque; os tons escuros da própria foto como contraste). Diga quais ornamentos do manual entram (um filete, um ícone de relógio antes do horário) e — quando a foto já tem muita informação — que a composição fica limpa, sem ícones nem selos.

LOGOTIPO: qual versão do painel de logos do manual (a principal, a variação horizontal, a monocromática…), onde pousa (em fração da altura/largura: "centralizada no topo, começando a ~5% da altura"), tamanho relativo ("~15% a 18% da largura"), e que ela não compete com a manchete. Se a marca for COLADA POR CÓDIGO depois (você será avisado), esta seção diz que o designer NÃO desenha logo nenhuma e deixa o canto indicado livre — e nada mais.

BLOCO PRINCIPAL: onde o conjunto fica (faixa em % da altura, ex.: "entre 15% e 34% da altura"), alinhamento (centralizado / à esquerda), e a ordem dos elementos. Depois, UMA SEÇÃO POR BLOCO DA COPY, cada uma com: o texto exato entre aspas, a fonte pelo PAPEL do manual ("a serifa de manchete do manual", "a sans-serif oficial em peso regular"), a cor, o tamanho relativo, a quebra de linha sugerida quando fizer diferença (cada linha repete o trecho EXATAMENTE como recebido — a caixa das letras é decisão da casa, já tomada na copy; você nunca a muda, nem para "combinar" com a marca), e o destaque de UMA palavra na cor de destaque quando a marca faz isso (nunca quando o bloco tem uma palavra só — o designer coloriria uma letra). Separador (FILETE) entre blocos só se a marca usa: comprimento e cor pelo manual.

ÁREA LIVRE: a faixa da altura que fica só com a fotografia, e o que ela valoriza (as pessoas, o prato, a mesa).

RODAPÉ — só quando a copy tem SERVIÇO (dia, horário, endereço, telefone; o contexto diz QUAIS blocos são serviço — não decida você): esses blocos ficam SÓ AQUI, isolados na parte inferior (no story entre ~86% e ~94% da altura, respeitando a margem de segurança), na fonte de apoio, em corpo LEGÍVEL NO CELULAR: menor que o apoio da manchete, mas nunca abaixo de ~2,8% da altura da peça por linha — e diga também a PROPORÇÃO, que o designer entende melhor que pixel: "a linha do horário tem cerca de metade da altura de uma linha da manchete"; "miúdo" sai ilegível, e pedir 50 px rendeu 30 (medido em 08/09/2026). Com o acabamento que a marca usa (filete, ícone de relógio/pin do manual). Cada bloco de serviço é citado entre aspas DENTRO desta seção e NÃO aparece como item do bloco principal — nem quando o bloco principal fica embaixo. É a regra da casa e não se negocia: o briefing que pendurar o serviço na manchete é recusado.

HIERARQUIA VISUAL: a ordem de leitura, numerada — manchete, apoio, fotografia, serviço, marca como assinatura (ou a ordem que ESTA peça pede).

EVITE: de 3 a 6 itens, específicos desta peça e desta marca (ex.: "excesso de dourado", "elementos que cubram as pessoas", "qualquer texto além da copy fornecida"). Não a lista genérica de tudo: proibição em paredão é ignorada, e negativa demais piora a peça (medido em 07-08/09/2026).

TEXTOS FINAIS — NÃO ALTERAR: cada bloco da copy, um por linha, verbatim, e a frase "Não corrigir, complementar, abreviar ou adicionar nenhuma outra informação."

REGRAS QUE NÃO SE NEGOCIAM (escreva-as no briefing só onde a peça precisa; as mecânicas o sistema anexa):
- A copy é sagrada: cada bloco entre aspas, letra por letra, na caixa em que foi recebida (a caixa já é a da marca). Nunca corrigir, traduzir, abreviar, completar. NUNCA inventar horário, endereço, telefone, preço, cidade, avaliação, hashtag ou @. Faltou informação, a peça fica sem ela.
- ⛔ NOME DE FONTE VIRA TEXTO DESENHADO (medido em 05/09/2026: "line 2 in Amithen" saiu com a palavra "Amithen" letrada). Nomes de fonte só aparecem numa linha que começa por "Imagem N" descrevendo o manual/prancha. Em toda seção de bloco, a fonte é citada pelo PAPEL.
- A fotografia é intocável salvo AJUSTE autorizado: enquadramento, luz, cor, contraste, nitidez, rostos, pessoas e objetos saem como entraram; nada de relumiar, recolorir, trocar fundo, acrescentar ou remover. Texto NUNCA atravessa rosto, prato, taça, produto — o assunto.
- A fotografia é a protagonista: a manchete é o maior elemento gráfico e o conjunto de texto é compacto; hierarquia por peso, cor e posição.
- UMA marca por peça, uma vez, a versão oficial do manual. Sem selo, ícone ou ornamento que não esteja no manual.
- Texto e cena de qualquer referência pertencem a um post ANTIGO: nunca copiar, adaptar nem ecoar. O briefing letra EXCLUSIVAMENTE a copy recebida.
- Serviço (dia, horário, endereço) mora SÓ no RODAPÉ, agrupado e isolado — nunca no bloco principal, nunca pendurado na manchete.
- Quebra de linha sem palavra sozinha (artigo/preposição pousa com a palavra seguinte).
- Story: o sistema anexa a safe area em pixel; não invente outra. Aqui, diga só "respeitando a margem de segurança do Story".
- Tipografia SOMENTE a do manual; uma cor de destaque por peça.

A REFERÊNCIA ESCOLHIDA À MÃO, quando houver: o designer NÃO a recebe — você a traduz em instruções. Copie dela a FORMA: fonte por papel, caixa, cor de cada nível, proporção entre manchete e apoio, ornamentos e onde ficam, posição e tamanho da marca, alinhamento, e a ZONA do bloco principal (topo / meio / rodapé). Se nesta foto a zona da referência cair sobre rosto, prato ou o assunto, mova o bloco para a região mais calma da LEITURA MEDIDA e diga na leitura por quê. Na leitura, diga em uma frase o que você copiou da referência (zona, fontes, ornamento, marca). As PALAVRAS e a CENA da referência nunca entram no briefing.

SEM referência: o bloco principal vai onde a LEITURA MEDIDA diz que a foto é calma — varie a diagramação entre peças (coluna alta à esquerda, bloco no topo, faixa no terço inferior): o que ESTA foto pedir, não uma receita.

O PEDIDO de quem está na tela é a autoridade: onde ele mandar (destacar palavra, alinhar, cor de um nível, tirar ornamento), faça e diga no briefing. Pedido que só PROÍBE vira um item do EVITE e não afrouxa nada. O pedido NÃO vence: inventar dado, mexer na foto sem o campo de ajuste, desenhar a marca quando ela é colada por código.

AJUSTE NA FOTO autorizado, quando houver: entra na seção FOTO DE FUNDO como "a ÚNICA alteração permitida na fotografia é: …; fora isso, nada muda".

ZONAS (campo zonas): para CADA seção de bloco do briefing (bloco principal, rodapé, e qualquer outro bloco de texto), a caixa onde ele pousa, em frações de 0 a 1 da largura (x0, x1) e da altura (y0, y1), coerente com os percentuais que você escreveu. Seja generoso: a caixa tem de caber o texto na fonte e no tamanho que você pediu, com respiro. Quando a peça for gerada COM MÁSCARA, o designer só pode pintar DENTRO dessas caixas — fora delas a fotografia sai pixel por pixel; caixa curta demais vira texto apertado ou cortado.

ONDE A MARCA POUSA (campo cantoDaMarca): você viu a foto e decidiu onde o texto vai. Escolha o canto mais calmo, DIAGONALMENTE oposto ao grosso do texto e fora do alcance do assunto — sem encostar. Em story o superior-esquerdo é PROIBIDO — o Instagram desenha o avatar e o nome do perfil ali (briefing com a marca nesse canto é recusado). Se a referência põe a marca num canto que NESTA foto cai sobre o assunto, escolha o melhor canto desta foto. Se a marca for colada por código, o canto que você escolher é o que o sistema vai reservar.

ANTES de escrever o briefing, responda o DIAGNÓSTICO (campo diagnostico): o que fica intacto, qual é o principal risco visual desta foto com esta copy, e a hierarquia de leitura que você quer. É o que um diretor decide antes de briefar — e é o que evita começar pela decoração.

Responda em JSON com: diagnostico, leitura (1-2 frases em português: o que você viu na foto, onde pousou o texto e por quê), prompt (o briefing em português, na estrutura acima), zonas e cantoDaMarca.`

const saidaGeracaoSchema = z.object({
  leitura: z
    .string()
    .optional()
    .describe('Uma ou duas frases em português: o que você viu na foto, onde decidiu pousar o texto e por quê.'),
  prompt: z.string().describe('O briefing final para o gpt-image, em português, na estrutura por seções pedida.'),
  cantoDaMarca: z
    .enum(['superior-esquerdo', 'superior-direito', 'inferior-esquerdo', 'inferior-direito'])
    .optional()
    .describe(
      'O canto onde a logomarca deve pousar NESTA foto: o mais calmo, diagonalmente oposto ao grosso do texto e fora do alcance do assunto. Em story, evite o superior-esquerdo. Omita se nenhum canto servir.',
    ),
  /**
   * DIAGNÓSTICO antes do briefing (lição da conversa do Ciro com o ChatGPT,
   * 08/09/2026): "identifique o que fica intacto, o que pode mudar, o
   * principal problema e a hierarquia ideal antes de propor". Campos
   * opcionais — não derrubam a resposta — gravados no fieldValues para
   * auditoria por peça.
   */
  diagnostico: z
    .object({
      intacto: z.string().optional().describe('O que fica absolutamente intacto nesta peça (foto, rostos, assunto…).'),
      problemaPrincipal: z.string().optional().describe('O principal risco visual desta foto + copy (ex.: rosto no terço superior; foto clara sem área calma).'),
      hierarquia: z.string().optional().describe('A ordem de leitura que você quer, em uma linha.'),
    })
    .optional(),
  zonas: z
    .array(
      z.object({
        nome: z.string().describe('bloco principal | rodapé | (outro bloco)'),
        x0: z.number().min(0).max(1),
        x1: z.number().min(0).max(1),
        y0: z.number().min(0).max(1),
        y1: z.number().min(0).max(1),
      }),
    )
    .optional()
    .describe('Uma caixa por seção de bloco do briefing, em frações 0..1 da largura e da altura, coerente com os percentuais escritos e com folga.'),
})

function contextoDaGeracao(args: PlanejarArteArgs): string {
  const formato: Record<PlanejarArteArgs['formato'], string> = {
    story: 'Story do Instagram, formato vertical 9:16, 1080 × 1920 px',
    feed: 'post de feed do Instagram, formato vertical 4:5, 1080 × 1350 px',
    quadrado: 'post do Instagram, formato quadrado 1:1, 1080 × 1080 px',
  }
  const visiveis = args.referencias.filter((r) => r.visivelAoGerador !== false)
  const soDoDiretor = args.referencias.filter((r) => r.visivelAoGerador === false)
  const linhas: string[] = [
    `FORMATO: ${formato[args.formato]} (a peça sai com ${args.alturaPx}px de altura)`,
    `IMAGENS QUE O gpt-image VAI RECEBER, NA ORDEM (cite-as no briefing como "Imagem N"):\n${visiveis
      .map(
        (r) =>
          `- Imagem ${r.indice}: ${PAPEL_GERACAO_LEGIVEL[r.papel]}${r.rotulo ? ` (${r.rotulo})` : ''}${r.buffer ? '' : ' [não anexada a você; descreva pelo papel]'}`,
      )
      .join('\n')}`,
  ]
  if (soDoDiretor.length > 0) {
    linhas.push(
      `REFERÊNCIA QUE SÓ VOCÊ VÊ (o gpt-image NÃO a recebe — traduza-a em instruções, nunca a cite como imagem):\n${soDoDiretor
        .map(
          (r) =>
            `- ${PAPEL_GERACAO_LEGIVEL[r.papel]}${r.rotulo ? ` (${r.rotulo})` : ''}${
              r.papel === 'style-guide' ? (r.estiloLivre ? ' [modo LIVRE: copie só como o texto é vestido; a posição é sua]' : ' [modo ESTRITO: copie também a zona de cada bloco]') : ''
            }`,
        )
        .join('\n')}`,
    )
  }
  const servico = blocosDeServico(args.copy)
  const ehServico = (i: number) => servico.some((s) => s.indice === i)
  linhas.push(
    args.copy.length > 0
      ? `COPY (${args.copy.length} bloco${args.copy.length === 1 ? '' : 's'}, verbatim, na ordem de leitura; a caixa JÁ é a da marca — copie letra por letra):\n${args.copy
          .map((b, i) => `"${b}"${ehServico(i) ? '   ← SERVIÇO: vai SÓ na seção RODAPÉ, nunca como bloco de apoio' : ''}`)
          .join('\n')}${
          servico.length > 0
            ? `\nBLOCOS DE SERVIÇO (classificados pelo sistema, não é opinião): ${servico.map((s) => `"${s.texto}"`).join(', ')}. Os demais blocos são o bloco principal (manchete e apoio).`
            : ''
        }`
      : 'COPY: esta peça NÃO leva texto (capa/foto pura). Nenhuma letra na peça.',
  )
  linhas.push(
    args.logoCompor
      ? 'LOGOMARCA: é COLADA POR CÓDIGO depois da geração. A seção LOGOTIPO do briefing diz que o designer NÃO desenha nenhuma logo, selo ou wordmark (o sistema anexa a linha do canto reservado).'
      : args.referencias.some((r) => r.papel === 'logo' || r.papel === 'brand-card')
        ? 'LOGOMARCA: desenhada pelo designer a partir do painel de logos do manual (Imagem 2), uma vez — escolha a versão e o lugar.'
        : 'LOGOMARCA: esta peça não leva logo.',
  )
  if (args.mascara) {
    linhas.push(
      'MÁSCARA: a Imagem 1 JÁ está cortada no enquadramento final da peça — não peça enquadramento nem corte. O designer só poderá pintar dentro das ZONAS que você declarar no campo zonas; fora delas a fotografia sai pixel por pixel. Declare uma zona por bloco de texto, com folga.',
    )
  }
  if (args.leituraDaFoto?.trim()) linhas.push(args.leituraDaFoto.trim())
  if (args.catalogoDaFoto?.trim()) linhas.push(args.catalogoDaFoto.trim())
  linhas.push(args.pedido.trim() ? `PEDIDO / DIREÇÃO DE ARTE DE QUEM ESTÁ NA TELA: ${args.pedido.trim()}` : 'PEDIDO: (vazio — vale o padrão da marca)')
  if (args.instrucaoImagem?.trim()) linhas.push(`AJUSTE NA FOTO AUTORIZADO (única exceção à fidelidade): ${args.instrucaoImagem.trim()}`)
  if (args.assinaturaTipografica?.trim()) linhas.push(`ASSINATURA TIPOGRÁFICA DA MARCA (como ela usa as fontes — obedeça):\n${args.assinaturaTipografica.trim()}`)
  return linhas.join('\n\n')
}

/** Exposto para teste: o que o diretor recebe, dado o que o runner montou. */
export function montarContextoDaGeracao(args: PlanejarArteArgs): string {
  return `${contextoDaMarca(args.brand)}\n\n${contextoDaGeracao(args)}`
}

export interface PromptDeGeracaoPlanejado {
  prompt: string
  modelo: string
  ms: number
  leitura?: string
  tentativas: number
  /** O diagnóstico que o diretor fez antes do briefing — auditoria por peça. */
  diagnostico?: { intacto?: string; problemaPrincipal?: string; hierarquia?: string }
  /** As zonas de texto declaradas pelo diretor (frações 0..1) — de onde sai a máscara. */
  /** Com `strict: false` o `z.infer` deixa toda chave opcional (lei da casa): quem consome valida cada número. */
  zonas?: Array<{ nome?: string; x0?: number; x1?: number; y0?: number; y1?: number }>
  /** O canto que o planejador escolheu para a marca NESTA foto. Ver o schema. */
  cantoDaMarca?: 'superior-esquerdo' | 'superior-direito' | 'inferior-esquerdo' | 'inferior-direito'
}

/**
 * Tratamento de foto que o diretor NÃO prescreve mais (08/09/2026): a leitura
 * é do gpt-image. A trava existe porque a regra do halo viveu três semanas no
 * prompt e o modelo, lendo "mancha escura desfocada", escurecia a foto.
 */
export function tratamentoDeFotoNoPrompt(prompt: string): string[] {
  const achados: string[] = []
  for (const [rotulo, re] of [
    ['halo', /\bhalo\b/i],
    ['véu', /\bv[ée]u\b/i],
    ['degradê', /\bdegrad[êe]/i],
    ['gradiente', /\bgradiente/i],
  ] as const) {
    if (re.test(prompt)) achados.push(rotulo)
  }
  return achados
}

/**
 * Trecho da copy citado no briefing com a CAIXA trocada. Medido em 08/09/2026
 * no By Rock: a copy chegou "Rende pra galera" e a quebra sugerida saiu
 * "RENDE PRA" / "GALERA" — o diretor decidindo a caixa que o mapa da casa
 * (`CAIXA_DA_MANCHETE`) já decidiu na string. A conferência por
 * `copyEstaNoPrompt` não pega isso porque normaliza para maiúsculas. Aqui
 * cada trecho entre aspas é procurado na copy sem olhar caixa e comparado
 * com o trecho REAL: divergiu, é caixa alterada.
 */
export function caixaAlterada(prompt: string, copy: string[]): string[] {
  const achados: string[] = []
  const citados = [...prompt.matchAll(/"([^"\n]{2,})"/g), ...prompt.matchAll(/“([^”\n]{2,})”/g)].map((m) => m[1].trim())
  for (const citado of citados) {
    const alvo = citado.replace(/[.,;:!?…]+$/g, '')
    if (alvo.length < 2) continue
    for (const bloco of copy) {
      const i = bloco.toLowerCase().indexOf(alvo.toLowerCase())
      if (i < 0) continue
      const real = bloco.slice(i, i + alvo.length)
      if (real !== alvo && !achados.includes(citado)) achados.push(citado)
      break
    }
  }
  return achados
}

/**
 * Marca no canto do AVATAR: em story o Instagram desenha o avatar e o nome do
 * perfil no superior-esquerdo. A regra existe no system prompt desde 07/09 e
 * o diretor a ignorou em 08/09/2026 (By Rock) — agora é recusa.
 */
export function logoNoCantoDoAvatar(
  prompt: string,
  formato: PlanejarArteArgs['formato'],
  canto: PromptDeGeracaoPlanejado['cantoDaMarca'] | undefined,
): boolean {
  if (formato !== 'story') return false
  if (canto === 'superior-esquerdo') return true
  const secao = prompt.match(/LOGOTIPO[\s\S]*?(?=\n[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ()/—–-]{4,}\n|$)/)?.[0] ?? ''
  return /superior[- ]esquerd|canto (superior|alto) (à|a) esquerda|topo (à|a) esquerda/i.test(secao)
}

/**
 * A copy tem serviço (horário, endereço…) e o briefing não abriu a seção
 * RODAPÉ — a regra da casa desde 17/08/2026, aqui mecânica.
 */
export function servicoSemRodape(prompt: string, copy: string[]): string[] {
  const servico = blocosDeServico(copy)
  if (servico.length === 0) return []
  // A seção RODAPÉ e o que vem antes dela. Medido em 08/09/2026 (Wine Vix):
  // com a trava só olhando a PALAVRA, o diretor pôs o serviço sob a manchete
  // e escreveu "RODAPÉ: já estarão agrupadas sob o bloco principal no topo".
  // Agora cada bloco de serviço tem de estar citado DENTRO da seção — e em
  // nenhuma seção de bloco antes dela.
  const secoes = secoesDoBriefing(prompt)
  const rodape = secoes.filter((s) => /^RODAP[ÉE]/i.test(s.titulo)).map((s) => normalizeForComparison(s.corpo)).join('\n')
  // Só as seções de BLOCO contam como "pendurado": citar o horário na leitura
  // da foto ou na hierarquia não é pôr o texto lá. Medido em 08/09/2026: com
  // "em nenhum lugar antes do RODAPÉ" o diretor foi recusado três vezes
  // seguidas por mencionar o serviço na FOTO DE FUNDO, e a peça caiu no molde.
  const blocosAntes = secoes
    .filter((s) => !/^TEXTOS FINAIS/i.test(s.titulo) && /^(BLOCO|TEXTO|T[ÍI]TULO|SUBT[ÍI]TULO|MANCHETE|APOIO|CTA|SEPARADOR)/i.test(s.titulo))
    .map((s) => normalizeForComparison(s.corpo))
    .join('\n')
  return servico
    .filter((b) => {
      const n = normalizeForComparison(b.texto)
      return n.length > 0 && (!rodape.includes(n) || blocosAntes.includes(n))
    })
    .map((b) => b.texto)
}

/** O briefing por seções: título em CAIXA ALTA numa linha própria, corpo até o próximo título. */
export function secoesDoBriefing(prompt: string): Array<{ titulo: string; corpo: string }> {
  const linhas = prompt.split('\n')
  const secoes: Array<{ titulo: string; corpo: string }> = []
  let atual: { titulo: string; corpo: string } = { titulo: 'ABERTURA', corpo: '' }
  for (const linha of linhas) {
    const l = linha.trim()
    const ehTitulo = l.length >= 4 && l.length <= 60 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 ()/—–-]+$/.test(l) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3}/.test(l)
    if (ehTitulo) {
      secoes.push(atual)
      atual = { titulo: l, corpo: '' }
    } else {
      atual.corpo += `${linha}\n`
    }
  }
  secoes.push(atual)
  return secoes
}

/**
 * Palavras da referência (lidas por visão, `GuiaLido.textos`) que reapareceram
 * no briefing sem estar na copy. Frase curta não conta (mesmo piso do alerta
 * de vazamento); o nome da marca também não — ele está em toda peça.
 */
export function palavrasDaReferenciaNoPrompt(
  prompt: string,
  copy: string[],
  textosDaReferencia: string[] | null | undefined,
  nomeDaMarca?: string | null,
): string[] {
  if (!textosDaReferencia || textosDaReferencia.length === 0) return []
  const alvo = normalizeForComparison(prompt)
  const daCopy = normalizeForComparison(copy.join('\n'))
  const marca = nomeDaMarca ? normalizeForComparison(nomeDaMarca) : ''
  const vazadas: string[] = []
  for (const bruto of textosDaReferencia) {
    const n = normalizeForComparison(bruto)
    if (n.length < 12) continue
    const semMarca = marca ? n.replace(marca, ' ').replace(/\s+/g, ' ').trim() : n
    if (semMarca.length < 12) continue
    if (daCopy.includes(n)) continue
    if (!alvo.includes(n)) continue
    const limpo = bruto.trim()
    if (!vazadas.includes(limpo)) vazadas.push(limpo)
  }
  return vazadas
}

/**
 * Planeja a GERAÇÃO de uma peça avulsa da trilha `arte`. `null` = o chamador
 * cai no molde da porta (ou em `buildArtePrompt`). Nunca lança. Carrossel e
 * peça com cartão de documento NÃO passam por aqui: o LOOK SPINE e a faixa do
 * cartão são mecânicos e medidos, e a série é o caso em que rigidez é desejada.
 */
export async function planejarArte(args: PlanejarArteArgs): Promise<PromptDeGeracaoPlanejado | null> {
  const inicio = Date.now()
  const anexos = args.referencias.filter((r) => r.buffer)
  const contexto = montarContextoDaGeracao(args)
  let feedback: string | null = null
  for (let rodada = 1; rodada <= RODADAS_DO_PLANEJADOR; rodada++) {
    try {
      const { object } = await generateObject({
        model: openai(PLANNER_MODEL),
        ...(ACEITA_TEMPERATURA ? { temperature: 0.4 } : {}),
        maxOutputTokens: 5000,
        abortSignal: AbortSignal.timeout(args.timeoutMs ?? 75_000),
        schema: saidaGeracaoSchema,
        system: SYSTEM_GERACAO,
        messages: [
          {
            role: 'user',
            content: [
              ...anexos.map((r) => ({ type: 'image' as const, image: r.buffer as Buffer })),
              { type: 'text' as const, text: feedback ? `${contexto}\n\nSEU BRIEFING ANTERIOR FOI RECUSADO:\n${feedback}\nReescreva corrigindo.` : contexto },
            ],
          },
        ],
      })
      const prompt = object.prompt.trim()
      const problemas = problemasDoBriefing(prompt, args, object.cantoDaMarca, object.zonas)
      if (problemas.length === 0) {
        return {
          prompt,
          modelo: PLANNER_MODEL,
          ms: Date.now() - inicio,
          leitura: object.leitura?.trim() || undefined,
          cantoDaMarca: object.cantoDaMarca,
          zonas: object.zonas,
          diagnostico: object.diagnostico,
          tentativas: rodada,
        }
      }
      feedback = problemas.join('\n')
      console.warn(`[diretor-de-arte/geração] rodada ${rodada} recusada: ${feedback}`)
      if (process.env.DIRETOR_DEBUG) {
        const secoes = secoesDoBriefing(prompt)
        console.warn(`[diretor-de-arte/geração] seções: ${secoes.map((s) => s.titulo).join(' | ')}`)
        for (const b of blocosDeServico(args.copy)) {
          const n = normalizeForComparison(b.texto)
          const onde = secoes.filter((s) => normalizeForComparison(s.corpo).includes(n)).map((s) => s.titulo)
          console.warn(`[diretor-de-arte/geração] "${b.texto}" aparece em: ${onde.join(' | ') || '(nenhuma seção)'}`)
        }
      }
    } catch (erro) {
      console.warn(`[diretor-de-arte/geração] rodada ${rodada} falhou:`, erro instanceof Error ? erro.message : erro)
      feedback = null
      if (rodada === RODADAS_DO_PLANEJADOR) break
    }
  }
  return null
}

/**
 * As travas mecânicas do briefing, numa lista para o diretor corrigir. Exposta
 * para teste: cada uma é uma lição medida, e o teste é o que impede a próxima
 * reescrita do system prompt de perdê-la.
 */
export function problemasDoBriefing(
  prompt: string,
  args: PlanejarArteArgs,
  cantoDaMarca?: PromptDeGeracaoPlanejado['cantoDaMarca'],
  zonas?: PromptDeGeracaoPlanejado['zonas'],
): string[] {
  const problemas: string[] = []
  if (prompt.length > TETO_DO_PROMPT_PLANEJADO_GERACAO) {
    problemas.push(`o briefing tem ${prompt.length} caracteres e o teto é ${TETO_DO_PROMPT_PLANEJADO_GERACAO} — corte prosa e itens do EVITE, nunca a copy.`)
  }
  const faltam = copyEstaNoPrompt(prompt, args.copy)
  if (faltam.length > 0) {
    problemas.push(`estes blocos da copy NÃO estão no briefing, verbatim e entre aspas: ${faltam.map((t) => `"${t}"`).join(', ')}`)
  }
  const fontesSoltas = fontesForaDaReferencia(prompt, nomesDeFonte(args.brand))
  if (fontesSoltas.length > 0) {
    problemas.push(
      `nome de fonte fora da linha da imagem (${fontesSoltas.join(', ')}) — o designer letra o que lê (a peça do Quintal saiu com "Amithen" desenhado). Cite a fonte pelo papel ("a serifa de manchete do manual") e deixe os nomes só na linha "Imagem N é o manual…".`,
    )
  }
  const tratamento = tratamentoDeFotoNoPrompt(prompt)
  if (tratamento.length > 0) {
    problemas.push(
      `o briefing prescreve tratamento sobre a foto (${tratamento.join(', ')}) — isso é decisão do designer, não sua. Resolva a leitura pela POSIÇÃO (área calma da leitura medida) e pela cor do texto; tire a frase.`,
    )
  }
  const servico = servicoSemRodape(prompt, args.copy)
  if (servico.length > 0) {
    problemas.push(
      `a copy tem serviço (${servico.map((t) => `"${t}"`).join(', ')}) e ele não está DENTRO da seção RODAPÉ — ou aparece também no bloco principal. Horário e endereço moram SÓ no rodapé, isolados na parte inferior (entre ~88% e ~94% da altura no story), citados entre aspas dentro da seção RODAPÉ e em nenhuma seção de bloco antes dela. Isso vale mesmo quando o bloco principal fica no topo — é a regra da casa.`,
    )
  }
  const caixa = caixaAlterada(prompt, args.copy)
  if (caixa.length > 0) {
    problemas.push(
      `a caixa das letras foi alterada em ${caixa.map((t) => `"${t}"`).join(', ')} — a caixa é decisão da casa, já tomada na copy. Repita cada trecho EXATAMENTE como recebido, inclusive na quebra sugerida.`,
    )
  }
  if (args.mascara && (!zonas || zonas.length === 0)) {
    problemas.push('a peça será gerada com MÁSCARA e você não declarou o campo zonas: uma caixa (x0, x1, y0, y1 em frações 0..1) por seção de bloco do briefing, com folga.')
  }
  if (logoNoCantoDoAvatar(prompt, args.formato, cantoDaMarca)) {
    problemas.push('em story a marca NUNCA fica no canto superior-esquerdo: o Instagram desenha o avatar e o nome do perfil ali. Escolha outro canto (e diga o mesmo em cantoDaMarca).')
  }
  const vazadas = palavrasDaReferenciaNoPrompt(prompt, args.copy, args.textosDaReferencia, args.brand?.projectName)
  if (vazadas.length > 0) {
    problemas.push(`estas frases são da REFERÊNCIA (post antigo) e não da copy — tire-as do briefing: ${vazadas.map((t) => `"${t}"`).join(', ')}`)
  }
  return problemas
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
    if (/^\s*imag(?:e|em)\s+\d+/i.test(linha)) continue
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
