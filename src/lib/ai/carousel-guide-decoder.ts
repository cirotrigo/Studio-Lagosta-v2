/**
 * Decodifica a camada gráfica do slide-guia por VISÃO.
 *
 * "Copie o estilo do guia" é instrução fraca: o modelo enxerga a imagem, mas
 * decide sozinho o que é essencial e o que é liberdade criativa. Foi assim
 * que, num carrossel de teste, o slide 2 saiu com a manchete toda branca e o
 * slide 3 com a segunda linha em vermelho — as duas dentro da paleta, mas a
 * série deixou de parecer uma peça só.
 *
 * A saída daqui vira texto no LOOK SPINE: a descrição transforma "copie" em
 * uma lista de decisões explícitas, que o modelo consegue seguir e que a
 * pessoa consegue conferir.
 *
 * Falha de visão NÃO derruba a série: o LOOK SPINE textual continua valendo.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

/** Modelo de visão barato — é descrição, não raciocínio. */
const VISION_MODEL = 'gpt-4o-mini'

const schema = z.object({
  posicaoDoBloco: z
    .string()
    .describe('Onde o bloco de texto fica: canto, altura e margem aproximada. Ex: "canto inferior esquerdo, começando a ~65% da altura, margem de ~8% da largura"'),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']),
  niveis: z
    .array(
      z.object({
        texto: z.string().describe('O texto deste nível, como aparece'),
        papel: z.string().describe('Papel: título, subtítulo, apoio, serviço'),
        cor: z.string().describe('Cor aparente: branco, vermelho, amarelo…'),
        caixa: z.enum(['alta', 'baixa', 'mista']),
        tamanhoRelativo: z.string().describe('Ex: "o maior", "metade do título"'),
      }),
    )
    .describe('Cada nível de texto, do maior para o menor'),
  elementosGraficos: z
    .array(z.string())
    .describe('Filetes, ondas, barras, ícones — com posição. Vazio se não houver.'),
  veuDeLeitura: z.string().describe('Direção e intensidade do gradiente sobre a foto'),
  tratamentoDaFoto: z.string().describe('Temperatura, contraste e clima da fotografia'),
})

export type GuiaDecodificado = z.infer<typeof schema>

/** Descrição em texto corrido, pronta para entrar no prompt. */
export function descricaoDoGuia(g: GuiaDecodificado): string {
  const niveis = g.niveis
    .map(
      (n, i) =>
        `  ${i + 1}. ${n.papel} — "${n.texto}" · cor ${n.cor} · caixa ${n.caixa} · ${n.tamanhoRelativo}`,
    )
    .join('\n')
  return [
    `- Bloco de texto: ${g.posicaoDoBloco}, alinhado à ${g.alinhamento}.`,
    `- Níveis de texto (repita a MESMA estrutura, trocando só as palavras):`,
    niveis,
    `- Elementos gráficos: ${g.elementosGraficos.length > 0 ? g.elementosGraficos.join('; ') : 'NENHUM — não acrescente nenhum'}.`,
    `- Véu de leitura: ${g.veuDeLeitura}.`,
    `- Tratamento da foto: ${g.tratamentoDaFoto}.`,
  ].join('\n')
}

/**
 * O que o chamador leva do guia: a descrição corrida (vai para o fim do LOOK
 * SPINE) e os elementos gráficos SOLTOS.
 *
 * Os elementos vêm separados porque precisam aparecer como ordem curta e ALTA
 * no prompt, não só como item de uma lista no rodapé. Medição de 10/08/2026:
 * num slide irmão do By Rock a linha "onda sonora" caía aos 98% de um prompt
 * de 13 mil caracteres — citada três vezes e obedecida nenhuma.
 */
export interface GuiaLido {
  descricao: string
  elementosGraficos: string[]
}

/**
 * Lê o slide-guia e devolve o que os irmãos precisam copiar, ou null quando a
 * visão não está disponível (o chamador segue sem ela).
 */
export async function decodificarGuia(imagem: Buffer): Promise<GuiaLido | null> {
  try {
    const { object } = await generateObject({
      model: openai(VISION_MODEL),
      temperature: 0,
      maxOutputTokens: 900,
      abortSignal: AbortSignal.timeout(45_000),
      schema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: imagem },
            {
              type: 'text',
              text: [
                'Descreva a CAMADA GRÁFICA desta arte de Instagram — não a fotografia em si, mas as decisões de diagramação que precisam ser repetidas em outros slides da mesma série.',
                'Seja concreto e mensurável: posição, alinhamento, cor de cada nível de texto, elementos gráficos presentes.',
                'Se não houver nenhum elemento gráfico além do texto, devolva a lista vazia — inventar um faria os outros slides ganharem um enfeite que este não tem.',
              ].join('\n'),
            },
          ],
        },
      ],
    })
    return { descricao: descricaoDoGuia(object), elementosGraficos: object.elementosGraficos }
  } catch (error) {
    console.warn('[carrossel] decodificação do guia indisponível — seguindo só com o LOOK SPINE:', error)
    return null
  }
}
