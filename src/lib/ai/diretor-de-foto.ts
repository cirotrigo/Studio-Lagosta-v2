/**
 * O DIRETOR DE FOTO (17/11/2026, `docs/PLANO-2026-11-17-MELHORAR-FOTO-COM-IA.md`, seção 5).
 *
 * Irmão do diretor de arte (`diretor-de-arte.ts`), na mesma infraestrutura:
 * o mesmo modelo com visão, o mesmo controle de prazo e de auditoria, a mesma
 * validação por código com rodadas de correção. O que muda é a tarefa: ele
 * OLHA a foto limpa (e a arte, para ver onde o texto mora), conhece as
 * receitas escolhidas e a direção de foto do DNA, e escreve o prompt longo de
 * EDIÇÃO para o Nano Banana, com câmera, lente, luz e a lista do que fica
 * igual. O texto da arte nunca passa por aqui: o Studio o renderiza por cima.
 *
 * O que é mecânico fica no código: o bloco de preservação da casa é
 * acrescentado depois (`montarPromptDeFoto`), venha o prompt de quem vier.
 */

import { z } from 'zod'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { ACEITA_TEMPERATURA, PLANNER_MODEL } from './diretor-de-arte'
import { criarControleDoDiretor, concluirFallback, limiteDaRodada, registrarContextoDoDiretor, registrarRodada, type ControleDoDiretor } from './controle-do-diretor'
import { RECEITAS_DE_FOTO, TETO_DO_PROMPT_DE_FOTO, type CaixaEmFracoes, type ReceitaPedida } from './receitas-de-foto'

const RODADAS = 3

export interface PlanejarMelhoriaDeFotoArgs {
  /** A foto limpa, no quadro da peça. Na reserva, a própria arte chapada. */
  foto: Buffer
  /** A arte pronta, só para o diretor ver onde o texto mora. */
  arte?: Buffer | null
  /** Reserva: `foto` é a arte pronta, com texto e logo, e eles têm de sair intactos. */
  arteChapada?: boolean
  receitas: ReceitaPedida[]
  /** O pedido curto de quem está no chat ou na tela. */
  pedido?: string
  marca?: string | null
  cozinha?: string | null
  /** `BrandDNA.photoDirection`. */
  direcaoDeFoto?: string | null
  /** O que o catálogo sabe da foto. */
  sobreAFoto?: { prato?: string | null; caixaDoAssunto?: CaixaEmFracoes | null }
  /** Onde o texto da arte está, em frações do quadro. */
  caixaDoTexto?: CaixaEmFracoes | null
  /** A proporção do quadro ("9:16"). */
  proporcao: string
  controle?: ControleDoDiretor
  timeoutMs?: number
}

export interface PlanoDeFoto {
  /** Duas ou três frases em português: o que vê e o que vai fazer. */
  leitura: string
  /** Em inglês, até 4.000 caracteres, sem o bloco de preservação da casa. */
  prompt: string
  /** O que pode sair errado nesta foto. Vira aviso ao lado da opção. */
  riscos: string[]
  /** Há rosto de pessoa em foco na foto de origem. */
  rostoEmFoco: boolean
  modelo: string
  ms: number
  tentativas: number
}

const saidaSchema = z.object({
  leitura: z.string().describe('Duas ou três frases em português simples: o que você vê na foto e o que a edição vai fazer. É o que a pessoa lê antes de gerar.'),
  prompt: z.string().describe('O prompt de edição para o Nano Banana, em inglês, na estrutura pedida.'),
  riscos: z.array(z.string()).max(6).describe('Em português, curto: o que pode sair errado NESTA foto (mão perto de copo, rótulo legível, toalha estampada, rosto ao fundo). Lista vazia se nada chama atenção.'),
  rostoEmFoco: z.boolean().describe('true se a foto de origem mostra o rosto de uma pessoa em foco (reconhecível).'),
})

const SYSTEM = `Você é DIRETOR DE FOTOGRAFIA de gastronomia numa agência que cuida do Instagram de restaurantes, e escreve prompts de EDIÇÃO de imagem para o modelo Nano Banana (Gemini), que recebe UMA fotografia e a devolve editada.

Você recebe a fotografia COMO IMAGEM (e, quando houver, a arte pronta com o texto por cima, só para ver onde o texto mora), as RECEITAS escolhidas por quem pediu, a direção de foto da marca e o que se sabe da foto. Você OLHA a foto e escreve UM prompt.

O texto, a logo e os elementos da arte NÃO são seu trabalho: eles são renderizados depois, por código, por cima da foto que o modelo devolver. Na foto limpa você nunca pede texto, logo, selo nem gráfico.

COMO O NANO BANANA LÊ UM PROMPT DE EDIÇÃO (guia do Google):
- O VERBO DA OPERAÇÃO vem primeiro: "Add…", "Retouch…", "Recompose…", "Extend…".
- Depois, O QUE MUDA, em frases concretas, localizadas na imagem ("on the right side of the plate", "the blurred wall behind the glass").
- Depois, a lista explícita do que FICA EXATAMENTE IGUAL ("Keep … exactly the same").
- Depois, CÂMERA, LENTE, ABERTURA E LUZ, como um fotógrafo descreveria: corpo full-frame, distância focal, f/, direção e qualidade da luz, temperatura de cor em Kelvin quando ajudar.
- Frases AFIRMATIVAS: "an empty table in the background" em vez de "no people in the background". Negação vira o objeto na imagem.
- Prosa de fotógrafo, sem adjetivo vazio ("stunning", "professional-looking" não dizem nada).

ESTRUTURA OBRIGATÓRIA DO PROMPT (em INGLÊS, no máximo ${TETO_DO_PROMPT_DE_FOTO} caracteres):
1. A operação, numa frase que começa pelo verbo.
2. O que muda, em 3 a 8 frases, escritas depois de OLHAR esta foto: onde, quanto, com que luz. Aproveite os trechos fotográficos das receitas, adaptando-os ao que a foto mostra.
3. "Keep exactly the same:" e a lista do que não muda NESTA foto, pelo nome das coisas que você vê (the burger, the wooden board, the beer glass, the brick wall).
4. Câmera, lente, abertura e luz.

REGRAS DA CASA (valem em qualquer receita):
- A comida é a do cliente: não acrescentar, tirar nem trocar ingrediente, porção, louça ou bebida. Tratar a foto não é mudar o prato.
- O lugar é o do cliente: mesa, parede, móveis e fundo são os mesmos. Desfocar pode; trocar não.
- Nenhum contraste para segurar texto: sem véu, gradiente, tarja ou escurecimento. Legibilidade se resolve com área calma da própria cena.
- Gente entra pelas bordas do quadro (mão, antebraço), nunca casa cheia, nunca rosto em foco sem autorização, homem nunca de terno ou blazer.
- Rosto de pessoa real que já está na foto não é refeito: se houver, o prompt manda manter cada pessoa exatamente como está.
- SÓ AS RECEITAS ESCOLHIDAS: não aproveite para "melhorar" o que ninguém pediu. Sem a receita Foto profissional, a luz, a cor, o contraste, o desfoque e a limpeza da cena ficam como estão (medido em 17/11/2026: com só Humanizar pedido, o prompt mandou esquentar a luz, escurecer o fundo e limpar a mesa, puxado pela direção de foto da marca). A direção de foto da marca diz COMO fazer o que a receita pede (como iluminar a mão que entra, que clima o tratamento busca); ela não acrescenta tarefa.

Se a imagem recebida for a ARTE PRONTA (com texto e logo por cima), você será avisado: aí o prompt manda manter todo o texto, a logo e os elementos gráficos exatamente como estão, no mesmo lugar, e mexe só na fotografia por baixo.

Responda em JSON: leitura (português), prompt (inglês), riscos (português) e rostoEmFoco.`

const pct = (n: number) => `${Math.round(n * 100)}%`
const caixaLegivel = (c: CaixaEmFracoes) => `começa a ${pct(c.x)} da esquerda e ${pct(c.y)} do topo, com ${pct(c.largura)} da largura e ${pct(c.altura)} da altura do quadro`

export function contextoDaFoto(args: PlanejarMelhoriaDeFotoArgs): string {
  const linhas: string[] = []
  if (args.marca) linhas.push(`MARCA: ${args.marca}${args.cozinha ? ` (${args.cozinha})` : ''}`)
  linhas.push(
    args.arteChapada
      ? `IMAGEM 1: a ARTE PRONTA (${args.proporcao}), com texto e logo por cima da foto. Não há foto limpa: mantenha todo o texto, a logo e os elementos gráficos exatamente como estão e mexa só na fotografia.`
      : `IMAGEM 1: a FOTO LIMPA (${args.proporcao}), já no enquadramento da peça. O texto e a logo entram depois, por código.`,
  )
  if (args.arte && !args.arteChapada) linhas.push('IMAGEM 2: a arte pronta, só para você ver onde o texto mora. Ela NÃO vai ao gerador.')
  linhas.push(
    args.receitas.length > 0
      ? `RECEITAS ESCOLHIDAS (combine todas num prompt só):\n${args.receitas
          .map((r) => {
            const receita = RECEITAS_DE_FOTO[r.id]
            return `- ${receita.rotulo}: ${receita.descricao}\n  Trecho fotográfico de partida: ${receita.trecho(r)}`
          })
          .join('\n')}`
      : 'RECEITAS: (nenhuma: siga só o pedido)',
  )
  if (args.pedido?.trim()) linhas.push(`PEDIDO DE QUEM PEDIU: ${args.pedido.trim()}`)
  if (args.direcaoDeFoto?.trim()) {
    linhas.push(`DIREÇÃO DE FOTO DA MARCA (DNA: é o clima da marca, para guiar o que as receitas mexem; não é tarefa a mais):\n${args.direcaoDeFoto.trim()}`)
  }
  if (args.sobreAFoto?.prato) linhas.push(`O QUE O ACERVO SABE DA FOTO: ${args.sobreAFoto.prato}`)
  if (args.sobreAFoto?.caixaDoAssunto) linhas.push(`ASSUNTO (o prato, marcado por alguém da equipe): ${caixaLegivel(args.sobreAFoto.caixaDoAssunto)}. Ele não sai daí.`)
  if (args.caixaDoTexto) linhas.push(`TEXTO DA ARTE: ${caixaLegivel(args.caixaDoTexto)}. Não cubra essa área com o assunto nem com o gesto.`)
  return linhas.join('\n\n')
}

/** Pedido de contraste para texto: véu, gradiente, tarja, escurecimento. A proibição ("no veil") não conta. */
const CONTRASTE = /\b(?:add|apply|use|place|put|with|create|overlay)\b[^.]{0,60}\b(?:veil|gradient|scrim|vignette|dark(?:en|ened|ening)?\s+(?:band|overlay|area|strip)|overlay)\b/i

/** O que o código confere no prompt escrito (pelo diretor OU pelo chat). */
export function problemasDoPromptDeFoto(prompt: string): string[] {
  const p = prompt.trim()
  if (!p) return ['o prompt veio vazio']
  const problemas: string[] = []
  if (p.length > TETO_DO_PROMPT_DE_FOTO) problemas.push(`o prompt tem ${p.length} caracteres e o teto é ${TETO_DO_PROMPT_DE_FOTO}: corte prosa, nunca a lista do que fica igual`)
  if (!/\b(keep|unchanged|exactly (?:the same|as)|stays? the same|preserve)\b/i.test(p)) problemas.push('falta a lista do que fica igual ("Keep exactly the same: …")')
  if (CONTRASTE.test(p)) problemas.push('o prompt pede contraste para texto (véu, gradiente, tarja ou escurecimento), e a melhoria não acrescenta contraste: resolva com área calma da própria cena')
  return problemas
}

/** Planeja a edição da foto. Devolve `null` quando não conseguiu (fora do ar, recusado nas três rodadas). Nunca lança. */
export async function planejarMelhoriaDeFoto(args: PlanejarMelhoriaDeFotoArgs): Promise<PlanoDeFoto | null> {
  const inicio = Date.now()
  const controle = args.controle ?? criarControleDoDiretor()
  const contexto = contextoDaFoto(args)
  const anexos = [args.foto, ...(args.arte && !args.arteChapada ? [args.arte] : [])]
  registrarContextoDoDiretor(controle, PLANNER_MODEL, SYSTEM, contexto, anexos)
  let feedback: string | null = null

  for (let rodada = 1; rodada <= RODADAS; rodada++) {
    const limiteMs = limiteDaRodada(controle, args.timeoutMs ?? 60_000)
    if (!limiteMs) break
    const inicioDaRodada = Date.now()
    const sinal = AbortSignal.timeout(limiteMs)
    try {
      const { object } = await generateObject({
        model: openai(PLANNER_MODEL),
        ...(ACEITA_TEMPERATURA ? { temperature: 0.4 } : {}),
        maxOutputTokens: 4000,
        abortSignal: sinal,
        maxRetries: 0,
        schema: saidaSchema,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              ...anexos.map((imagem) => ({ type: 'image' as const, image: imagem })),
              { type: 'text' as const, text: feedback ? `${contexto}\n\nSEU PROMPT ANTERIOR FOI RECUSADO:\n${feedback}\nReescreva corrigindo.` : contexto },
            ],
          },
        ],
      })
      const prompt = object.prompt.trim()
      const problemas = problemasDoPromptDeFoto(prompt)
      if (problemas.length === 0) {
        registrarRodada(controle, limiteMs, inicioDaRodada, 'aprovado')
        return {
          leitura: object.leitura.trim(),
          prompt,
          riscos: object.riscos.map((r) => r.trim()).filter(Boolean),
          rostoEmFoco: object.rostoEmFoco,
          modelo: PLANNER_MODEL,
          ms: Date.now() - inicio,
          tentativas: rodada,
        }
      }
      registrarRodada(controle, limiteMs, inicioDaRodada, 'recusado', problemas)
      feedback = problemas.join('\n')
      console.warn(`[diretor-de-foto] rodada ${rodada} recusada: ${feedback}`)
    } catch (erro) {
      registrarRodada(controle, limiteMs, inicioDaRodada, sinal.aborted ? 'timeout' : 'erro', [sinal.aborted ? 'Tempo da rodada esgotado' : 'Falha na chamada ou resposta estruturada do diretor'])
      console.warn(`[diretor-de-foto] rodada ${rodada} falhou:`, erro instanceof Error ? erro.message : erro)
      feedback = null
    }
  }
  concluirFallback(controle)
  return null
}

/**
 * Há rosto de pessoa em foco nesta foto? Só para o caminho do prompt pronto,
 * em que o diretor não olhou a foto. `null` = a visão não respondeu, e aí o
 * aviso sai como "não foi possível conferir", nunca como "sem rosto".
 */
export async function verRostoEmFoco(foto: Buffer): Promise<boolean | null> {
  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      temperature: 0,
      maxOutputTokens: 100,
      abortSignal: AbortSignal.timeout(30_000),
      schema: z.object({ rostoEmFoco: z.boolean() }),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: foto },
            { type: 'text', text: 'Esta fotografia mostra o rosto de alguma pessoa em foco, reconhecível? Rosto desfocado ao fundo, de costas ou cortado não conta. Mãos e braços não contam.' },
          ],
        },
      ],
    })
    return object.rostoEmFoco
  } catch {
    return null
  }
}
