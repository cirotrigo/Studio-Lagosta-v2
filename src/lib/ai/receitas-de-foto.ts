/**
 * As RECEITAS DE FOTO (17/11/2026, `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`).
 *
 * A regra da casa continua sendo "a fotografia é intocável" nos modos de
 * diagramação da melhoria. Estas receitas são as exceções COM NOME: uma lista
 * fechada do que a IA pode fazer com a foto limpa da página, sempre escolhida
 * por gente. Nenhum revisor automático dispara receita.
 *
 * Um catálogo só, lido pelo MCP, pelo diretor de foto e (na Fase 2) pela tela.
 * Puro: sem banco, sem rede. As regras escritas estão em
 * `docs/regras/melhoria.md`, seção "Melhorar a foto com IA".
 */

import { z } from 'zod'

export const IDS_DAS_RECEITAS = ['humanizar', 'foto-profissional', 'abrir-espaco', 'ajuste-livre'] as const
export type IdDaReceita = (typeof IDS_DAS_RECEITAS)[number]

/** O que roda depois de gerar. Tudo AVISA, nada veta (regra de 10/08/2026). */
export type Conferencia = 'assunto-no-lugar' | 'fidelidade-da-cena' | 'rosto-em-foco'

/** Uma caixa em frações (0 a 1) do quadro da foto, a partir do canto superior esquerdo. */
export interface CaixaEmFracoes {
  x: number
  y: number
  largura: number
  altura: number
}

export interface ReceitaPedida {
  id: IdDaReceita
  /** Humanizar: o gesto ("mão puxando uma fatia"). Sem ele, o diretor escolhe olhando a foto. */
  gesto?: string
  /** Humanizar: por qual borda a pessoa entra. */
  lado?: 'esquerda' | 'direita' | 'cima' | 'baixo'
  /** Humanizar: rosto em foco AUTORIZADO. Ausente ou falso, só mãos e antebraço. */
  rosto?: boolean
  /** Foto profissional: quanto tratar. */
  intensidade?: 'leve' | 'marcada'
  /** Abrir espaço: onde o texto está. Ausente, é lida das camadas da página. */
  area?: CaixaEmFracoes
  /** Ajuste livre: o que a pessoa escreveu sobre a foto. */
  texto?: string
}

export interface ReceitaDeFoto {
  id: IdDaReceita
  /** Nome de botão. */
  rotulo: string
  /** Uma frase em português simples: o que a receita faz. */
  descricao: string
  /** Parâmetro → o que ele quer dizer, em português. */
  parametros: Record<string, string>
  /** O trecho fotográfico que a receita acrescenta ao prompt (inglês: câmera, lente, luz). */
  trecho: (pedida: ReceitaPedida) => string
  /** O que a receita protege, em português (para quem lê). */
  protege: string[]
  /** As mesmas proteções como linhas do prompt (inglês, afirmativas). */
  preserva: string[]
  /**
   * O que TEM de sair diferente, dito por último. O prompt de edição termina
   * numa lista longa de "fica igual", e a última coisa dita pesa mais: na
   * bancada de 18/11/2026 o gerador cumpriu a lista devolvendo quase a mesma
   * foto (Foto profissional com tom 2,2 a 6,1). Só as receitas em que a
   * mudança é sutil por natureza têm fecho.
   */
  fecho?: string
  conferencias: Conferencia[]
}

/** Teto do prompt de quem ESCREVE (diretor ou chat). O bloco de preservação entra por fora dele. */
export const TETO_DO_PROMPT_DE_FOTO = 4000

const LADO: Record<NonNullable<ReceitaPedida['lado']>, string> = {
  esquerda: 'the left edge',
  direita: 'the right edge',
  cima: 'the top edge',
  baixo: 'the bottom edge',
}

/** Em que parte do quadro a caixa está, em palavras: o gerador lê posição pela imagem, não por coordenada. */
function ondeFica(area: CaixaEmFracoes): string {
  const cy = area.y + area.altura / 2
  const cx = area.x + area.largura / 2
  const vertical = cy < 0.4 ? 'top' : cy > 0.6 ? 'bottom' : 'middle'
  const horizontal = area.largura > 0.7 ? '' : cx < 0.4 ? ' left' : cx > 0.6 ? ' right' : ''
  const quanto = Math.round(Math.min(1, Math.max(0.05, area.altura)) * 100)
  return `the ${vertical}${horizontal} of the frame (about ${quanto}% of its height)`
}

const DA_CASA_PT = ['a comida e a bebida do cliente', 'a louça', 'a mesa, a parede, os móveis e o fundo']

export const RECEITAS_DE_FOTO: Record<IdDaReceita, ReceitaDeFoto> = {
  humanizar: {
    id: 'humanizar',
    rotulo: 'Humanizar',
    descricao: 'Põe um gesto na cena: a mão puxando o queijo, o garfo na batata, o vinho sendo servido, o chope na mão, o brinde.',
    parametros: {
      gesto: 'O gesto, em poucas palavras. Sem ele, quem escreve o prompt escolhe olhando a foto.',
      lado: 'Por qual borda a pessoa entra: esquerda, direita, cima ou baixo.',
      rosto: 'true só quando o rosto em foco está autorizado. Ausente, entram só mãos e antebraço.',
    },
    trecho: (p) =>
      [
        `Add one natural human gesture to the scene: ${p.gesto?.trim() || 'a hand interacting with the food or drink already on the table, the gesture that fits this dish'}.`,
        `The person enters from ${p.lado ? LADO[p.lado] : 'the nearest edge of the frame'}: only what the gesture needs is visible${p.rosto ? ', and the face may be in frame' : ' (hand, wrist, forearm)'}.`,
        'Skin, hand and sleeve are lit by the same light as the dish: same direction, same colour temperature, same softness of shadow, with a contact shadow where the hand meets the table or the food.',
        'Shot as a candid restaurant photograph on a full-frame camera with a 50mm lens at f/2.8: the hand shares the focal plane of the dish, natural skin texture, five fingers, relaxed pose.',
      ].join(' '),
    protege: [...DA_CASA_PT, 'o enquadramento'],
    preserva: [
      'The dish, the crockery, the drink and every item on the table stay exactly as they are: same ingredients, same portion, same position.',
      'The table, the wall, the furniture and the background stay the same place.',
      'The framing and the camera angle stay the same.',
    ],
    conferencias: ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'],
  },
  'foto-profissional': {
    id: 'foto-profissional',
    rotulo: 'Foto profissional',
    descricao: 'Trata a foto: balanço de branco, luz mais limpa, fundo mais desfocado e o prato nítido, com cara de câmera e lente melhores.',
    parametros: { intensidade: 'marcada (padrão: a diferença tem de aparecer) ou leve.' },
    /**
     * O padrão virou `marcada` em 18/11/2026: na bancada, com `leve`, uma foto
     * voltou igual e duas mudaram no limite do que se enxerga (as fotos da
     * carteira já são de sessão profissional). O trecho diz o que TEM de ficar
     * diferente; "retoque leve" o gerador cumpre não fazendo nada.
     */
    trecho: (p) =>
      p.intensidade === 'leve'
        ? [
            'Retouch this photograph with a restrained but visible professional grade, as from a full-frame camera with a 50mm lens at f/2.8.',
            'Three things must read as different next to the original: the white balance is neutral (white plates, napkins and walls read as clean white, with no yellow or green cast); the main subject is about a third of a stop brighter and crisper; the background behind it is one step softer.',
            'Colours stay true to life.',
          ].join(' ')
        : [
            'Retouch this photograph into a professional food photograph, as re-shot on a full-frame camera with an 85mm lens at f/2. The difference must be obvious at a glance next to the original.',
            'White balance: neutral, so white plates, napkins and walls read as clean white with no yellow, orange or green cast.',
            'Background: everything behind the main subject falls into a clearly deeper, smoother blur (creamy bokeh), visibly more out of focus than in the original.',
            'Main subject: tack sharp, with crisp fine texture and gentle local contrast, about half a stop brighter, lit by a soft directional key light from the side with gentle fill; highlights keep their detail.',
            'Colours true to life, with natural saturation.',
          ].join(' '),
    protege: [...DA_CASA_PT, 'o enquadramento e o conteúdo da foto'],
    preserva: [
      'The content of the photograph stays the same: every ingredient, the portion, the crockery, the drink, every object and its position.',
      'The table, the wall, the furniture and the background stay the same place (softer focus is allowed, replacing them is not).',
      'The framing and the camera angle stay the same.',
    ],
    fecho:
      'the photographic rendering is visibly different from the input: the white balance, the brightness and crispness of the main subject and the depth of the background blur have clearly changed. A result that looks like a copy of the input is wrong.',
    conferencias: ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'],
  },
  'abrir-espaco': {
    id: 'abrir-espaco',
    rotulo: 'Abrir espaço para o texto',
    descricao: 'Acalma o fundo onde o texto da arte está, sem mexer no tamanho nem no lugar do prato.',
    parametros: { area: 'Onde o texto está, em frações do quadro. Ausente, o Studio lê das camadas da página.' },
    /**
     * Reescrita em 18/11/2026. A primeira versão dizia "recompose" e deixava o
     * prato "mover ou mudar de escala o quanto precisar": na bancada o prato
     * do By Rock encolheu para 75% e as casquinhas da Real para 80%, subiram e
     * ganharam uma mão. O que ficou bom foi o Bacana, onde o gerador só tirou
     * a força do letreiro atrás do título. É esse o pedido agora.
     */
    trecho: (p) =>
      [
        `Calm the background in ${p.area ? ondeFica(p.area) : 'the area where the text of the design sits'}, where a title is placed over this photograph. Nothing moves.`,
        'The main subject keeps exactly its size and its position in the frame: the same pixels of the frame hold the same parts of it.',
        'Open the space only by simplifying the background inside that area: take away or soften the details that compete with a title there (signs, lettering, lamps, bright highlights, busy patterns, small objects far behind), and let that part of the background fall into a deeper, even blur with lower local contrast, keeping its own colours and its own brightness.',
        'Where the photograph has spare margin beyond the subject, the same surface (the same table, wall or background) may extend into that area.',
        'If that area lies over the subject itself, leave the subject as it is and calm only what surrounds it there.',
        'Same camera, same lens and same light as the original photograph.',
      ].join(' '),
    protege: ['o tamanho e o lugar do prato', 'o que não está na área do texto', 'o lugar'],
    preserva: [
      'The main subject stays the same size and in the same position in the frame, whole, sharp and well lit: same ingredients, same portion, same crockery.',
      'The calm area is made of the same scene (its own table, wall or background), never of a new place, and it is not darkened.',
      'Nothing is added to the scene: no person, no hand, no object.',
      'Everything outside that area keeps its look.',
    ],
    fecho:
      'inside the text area the background is visibly calmer than in the input (softer, more even, with less detail and lower contrast), and the main subject has not moved or changed size. A result that looks like a copy of the input is wrong.',
    conferencias: ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'],
  },
  'ajuste-livre': {
    id: 'ajuste-livre',
    rotulo: 'Ajuste livre',
    descricao: 'O que a pessoa escrever sobre a foto, com as proteções da casa.',
    parametros: { texto: 'O ajuste, em português ou inglês (até 500 caracteres).' },
    trecho: (p) => `The requested change to the photograph, and the only one: ${p.texto?.trim() ?? ''}`,
    protege: DA_CASA_PT,
    preserva: ['Everything the request does not name stays exactly as it is.'],
    conferencias: ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'],
  },
}

const caixaSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  largura: z.number().gt(0).max(1),
  altura: z.number().gt(0).max(1),
})

export const receitaPedidaSchema = z.object({
  id: z.enum(IDS_DAS_RECEITAS),
  gesto: z.string().max(200).optional(),
  lado: z.enum(['esquerda', 'direita', 'cima', 'baixo']).optional(),
  rosto: z.boolean().optional(),
  intensidade: z.enum(['leve', 'marcada']).optional(),
  area: caixaSchema.optional(),
  texto: z.string().max(500).optional(),
})

/**
 * As receitas do pedido, conferidas. Com qualquer erro a lista volta VAZIA e
 * todos os erros vêm juntos: pedido misto não é atendido pela metade.
 */
export function normalizarReceitas(entrada: unknown): { receitas: ReceitaPedida[]; erros: string[] } {
  if (entrada == null) return { receitas: [], erros: [] }
  if (!Array.isArray(entrada)) return { receitas: [], erros: ['receitas precisa ser uma lista'] }
  const receitas: ReceitaPedida[] = []
  const erros: string[] = []
  const vistas = new Set<string>()
  entrada.forEach((item, i) => {
    const bruto = typeof item === 'string' ? { id: item } : item
    const id = bruto && typeof bruto === 'object' ? String((bruto as { id?: unknown }).id ?? '') : ''
    if (!(IDS_DAS_RECEITAS as readonly string[]).includes(id)) {
      erros.push(`receita ${i + 1}: "${id}" não existe (as receitas são ${IDS_DAS_RECEITAS.join(', ')})`)
      return
    }
    if (vistas.has(id)) {
      erros.push(`receita ${i + 1}: "${id}" está repetida (cada receita entra uma vez; as receitas se combinam numa geração só)`)
      return
    }
    vistas.add(id)
    const lida = receitaPedidaSchema.safeParse(bruto)
    if (!lida.success) {
      erros.push(...lida.error.issues.map((e) => `receita ${i + 1} (${id}): ${e.path.join('.') || 'valor'} inválido (${e.message})`))
      return
    }
    if (id === 'ajuste-livre' && !lida.data.texto?.trim()) {
      erros.push(`receita ${i + 1} (ajuste-livre): falta o texto do ajuste`)
      return
    }
    // Só o que foi mandado: `undefined` não vira chave no registro.
    receitas.push(Object.fromEntries(Object.entries(lida.data).filter(([, v]) => v !== undefined)) as unknown as ReceitaPedida)
  })
  return erros.length > 0 ? { receitas: [], erros } : { receitas, erros: [] }
}

export function trechosFotograficos(receitas: ReceitaPedida[]): string[] {
  return receitas.map((r) => RECEITAS_DE_FOTO[r.id].trecho(r))
}

/**
 * O que NENHUMA receita pode mudar (seção 2 do plano), em linhas de prompt.
 * Frases afirmativas onde dá: o guia de edição do Google pede "mesa vazia ao
 * fundo", não "sem gente ao fundo".
 */
const REGRAS_DA_CASA = [
  'The food and drink are the restaurant\'s real ones: every ingredient, the portion size, the crockery and the drink stay exactly as photographed.',
  'The place is the real one: the same table, wall, furniture and background (they may fall softer in focus, they are never replaced).',
  'Every real person already in the photograph keeps the same face, the same features, the same expression and the same body.',
]
/** Foto limpa: o texto e a logo entram depois, por código. */
const SEM_TEXTO = 'The photograph carries no text, no logo, no watermark, no graphic, and no veil, gradient, band or darkened area added for text: light comes only from the scene.'
/** Reserva (arte chapada): o texto e a logo já estão na imagem e têm de sair como entraram. */
const TEXTO_INTACTO =
  'Every piece of text, the logo and every graphic element of the design stay exactly as they are, in the same place, letter by letter. No text is added, and no veil, gradient, band or darkened area is added: light comes only from the scene.'

/** O bloco que o Studio acrescenta POR CÓDIGO ao fim de todo prompt de foto, venha de quem vier. */
export function blocoDePreservacao(receitas: ReceitaPedida[], opcoes: { arteChapada?: boolean } = {}): string {
  const linhas = [...REGRAS_DA_CASA, opcoes.arteChapada ? TEXTO_INTACTO : SEM_TEXTO]
  for (const r of receitas) linhas.push(...RECEITAS_DE_FOTO[r.id].preserva)
  const humanizar = receitas.find((r) => r.id === 'humanizar')
  if (humanizar) {
    linhas.push(
      'Anyone added to the scene enters from the edge of the frame, in casual restaurant clothing: never a suit or blazer.',
      'The room stays as empty as it is: no crowd, no full house.',
    )
    if (!humanizar.rosto) linhas.push('Only hands and forearms are added: no face in focus.')
  }
  const unicas = [...new Set(linhas)]
  const fechos = receitas.map((r) => RECEITAS_DE_FOTO[r.id].fecho).filter((f): f is string => !!f)
  const manter = `Keep exactly as in the original photograph:\n${unicas.map((l) => `- ${l}`).join('\n')}`
  // O fecho vem DEPOIS da lista do que fica igual: é a última coisa que o gerador lê.
  return fechos.length > 0 ? `${manter}\n\nAnd in the result:\n${fechos.map((f) => `- ${f}`).join('\n')}` : manter
}

/** O prompt que vai ao gerador: o de quem escreveu, mais o bloco de preservação. Idempotente. */
export function montarPromptDeFoto(base: string, receitas: ReceitaPedida[], opcoes: { arteChapada?: boolean } = {}): string {
  const bloco = blocoDePreservacao(receitas, opcoes)
  const limpo = base.trim()
  return limpo.endsWith(bloco) ? limpo : `${limpo}\n\n${bloco}`
}

/**
 * O prompt quando o diretor de foto não respondeu: os trechos das receitas e o
 * pedido, sem a leitura da foto. Pior que o do diretor, e melhor que derrubar a
 * melhoria (o diretor nunca derruba, como o de arte).
 */
export function promptSemDiretor(receitas: ReceitaPedida[], pedido: string): string {
  const partes = ['Edit this photograph.', ...trechosFotograficos(receitas)]
  if (pedido.trim()) partes.push(`Also: ${pedido.trim()}`)
  return partes.join(' ')
}

const TODAS_AS_CONFERENCIAS: Conferencia[] = ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco']

/** Sem receita (prompt pronto do chat) rodam todas: não se sabe o que o prompt pediu. */
export function conferenciasDasReceitas(receitas: ReceitaPedida[]): Conferencia[] {
  if (receitas.length === 0) return [...TODAS_AS_CONFERENCIAS]
  return [...new Set(receitas.flatMap((r) => RECEITAS_DE_FOTO[r.id].conferencias))]
}

/** A chave da Fase 1. Desligada por padrão: sem ela, `alvo: 'foto'` é recusado e nada muda. */
export function melhoriaDeFotoLigada(valor: string | undefined = process.env.MELHORIA_DE_FOTO): boolean {
  const v = valor?.trim().toLowerCase()
  return v === 'true' || v === '1'
}
