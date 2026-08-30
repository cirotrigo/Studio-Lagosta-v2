/**
 * Rascunho de resposta a avaliação do Google — proposto pela IA, decidido
 * por GENTE. A equipe edita e envia; o sistema nunca publica sozinho (mesma
 * lei do verificador: avisa/propõe, nunca age por conta própria).
 *
 * Sem cobrança de créditos — precedente da revisão ortográfica e da dica de
 * copy (`gpt-4o-mini`, trabalho interno da casa).
 *
 * Regras do rascunho, na ordem do que já queimou a casa antes:
 * - NUNCA inventar fato: preço, promoção, reembolso, cortesia, prazo,
 *   horário ou justificativa operacional ("estávamos sem gás") são proibidos
 *   — a resposta reconhece, agradece e convida; quem oferece compensação é o
 *   dono, por fora.
 * - Tom de voz do DNA quando houver; sem ele, cordial e direto.
 * - Curto (WhatsApp e Google cortam parede de texto) e assinado pela equipe.
 */
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { loadBrandContext } from '@/lib/brand/brand-context'

const MODELO = 'gpt-4o-mini'

const schema = z.object({
  resposta: z.string().describe('A resposta pronta para publicar, sem aspas em volta'),
})

export interface PedidoDeRascunho {
  projectId: number
  nomeCliente: string
  autor: string | null
  estrelas: number
  texto: string | null
}

/** Devolve o rascunho, ou null em qualquer falha — proposta nunca derruba coleta. */
export async function sugerirRespostaDeAvaliacao(pedido: PedidoDeRascunho): Promise<string | null> {
  try {
    const brand = await loadBrandContext(pedido.projectId).catch(() => null)
    const tom = brand?.dna?.toneOfVoice ?? null

    const negativa = pedido.estrelas <= 3
    const primeiroNome = (pedido.autor ?? '').trim().split(/\s+/)[0] || null

    const { object } = await generateObject({
      model: openai(MODELO),
      schema,
      temperature: 0.4,
      prompt: [
        `Escreva a resposta do restaurante "${pedido.nomeCliente}" a uma avaliação no Google.`,
        '',
        `Avaliação (${pedido.estrelas} de 5 estrelas)${pedido.autor ? `, de ${pedido.autor}` : ''}:`,
        pedido.texto ? `"${pedido.texto}"` : '(sem texto — só a nota)',
        '',
        'Regras inegociáveis:',
        '- Português do Brasil, tom humano, sem parecer robô nem template.',
        '- NUNCA invente fato, preço, promoção, reembolso, cortesia, prazo ou justificativa operacional. Nada de "vamos te compensar" ou explicar a causa do problema.',
        negativa
          ? '- Avaliação negativa: reconheça o problema ESPECÍFICO citado, peça desculpas sem se justificar, diga que o ponto será verificado internamente e convide a voltar. Nunca discuta nem duvide do cliente.'
          : '- Avaliação positiva: agradeça citando algo ESPECÍFICO do texto (prato, atendimento, pessoa elogiada) e convide a voltar. Sem exagero de pontos de exclamação.',
        primeiroNome ? `- Comece dirigindo-se a ${primeiroNome}.` : '- Não invente nome para o avaliador.',
        `- No máximo 400 caracteres. Assine "Equipe ${pedido.nomeCliente}".`,
        '- No máximo 1 emoji, ou nenhum.',
        tom ? `\nTom de voz da marca (siga-o):\n${tom.slice(0, 1200)}` : '',
      ].join('\n'),
    })

    const resposta = object.resposta?.trim()
    return resposta && resposta.length >= 20 ? resposta.slice(0, 1000) : null
  } catch (erro) {
    console.error('[avaliacoes] rascunho falhou (seguindo sem ele):', erro)
    return null
  }
}
