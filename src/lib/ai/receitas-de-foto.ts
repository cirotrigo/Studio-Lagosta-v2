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
    parametros: { intensidade: 'leve (padrão) ou marcada.' },
    trecho: (p) =>
      p.intensidade === 'marcada'
        ? 'Re-photograph this exact scene as a professional food photograph: full-frame camera, 85mm lens at f/2, the dish tack sharp and the background falling into a smooth, clearly visible blur. Neutral white balance (clean whites, no colour cast), soft directional key light from the side with gentle fill, true-to-life food colours with natural saturation, fine texture visible on the food.'
        : 'Lightly retouch this exact photograph as a professional would: correct the white balance to neutral (clean whites, no colour cast), lift the exposure on the dish slightly, keep the dish sharp and let the background fall a little softer, as from a 50mm lens at f/2.8. Colours stay true to life.',
    protege: [...DA_CASA_PT, 'o enquadramento e o conteúdo da foto'],
    preserva: [
      'The content of the photograph stays the same: every ingredient, the portion, the crockery, the drink, every object and its position.',
      'The table, the wall, the furniture and the background stay the same place (softer focus is allowed, replacing them is not).',
      'The framing and the camera angle stay the same.',
    ],
    conferencias: ['assunto-no-lugar', 'fidelidade-da-cena', 'rosto-em-foco'],
  },
  'abrir-espaco': {
    id: 'abrir-espaco',
    rotulo: 'Abrir espaço para o texto',
    descricao: 'Recompõe ou estende a foto para deixar uma área calma onde o texto da arte está.',
    parametros: { area: 'Onde o texto está, em frações do quadro. Ausente, o Studio lê das camadas da página.' },
    trecho: (p) =>
      [
        `Recompose this photograph so that ${p.area ? ondeFica(p.area) : 'the area where the text of the design sits'} becomes a calm area: an even, uncluttered surface of the same scene (the same table, wall or background extended), with soft focus and no object, no bright highlight and no hard edge in it.`,
        'The dish moves or scales only as much as that needs and stays whole inside the frame, sharp and well lit.',
        'Same camera, same lens and same light as the original photograph.',
      ].join(' '),
    protege: ['o prato inteiro', 'o que não está na área do texto', 'o lugar'],
    preserva: [
      'The dish stays the same dish: same ingredients, same portion, same crockery, whole inside the frame.',
      'The calm area is made of the same scene (its own table, wall or background), never of a new place.',
      'Everything outside that area keeps its look.',
    ],
    conferencias: ['fidelidade-da-cena', 'rosto-em-foco'],
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
  return `Keep exactly as in the original photograph:\n${unicas.map((l) => `- ${l}`).join('\n')}`
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
