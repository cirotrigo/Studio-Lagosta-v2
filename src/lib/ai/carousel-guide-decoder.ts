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

/**
 * 🔴 TODO campo é opcional, e o rigor mora na RECONCILIAÇÃO — mesma lição que
 * o crivo de aprovação aprendeu em 11/08/2026.
 *
 * Com os campos obrigatórios, o zod recusava a resposta INTEIRA quando o modelo
 * omitia um só. Medido em 16/08/2026 na arte do Dia dos Pais da Real Gelateria:
 * o gpt-4o-mini devolveu os três níveis de texto, o alinhamento e a posição do
 * bloco — tudo o que importa — e deixou de fora `veuDeLeitura` e
 * `tratamentoDaFoto`. A decodificação inteira foi descartada, e como a falha
 * degrada em silêncio (`catch` → null), o carrossel vinha rodando sem a lista
 * de decisões explícitas sempre que isso acontecia, sem ninguém saber.
 */
const schema = z.object({
  posicaoDoBloco: z
    .string()
    .optional()
    .describe('Onde o bloco de texto fica: canto, altura e margem aproximada. Ex: "canto inferior esquerdo, começando a ~65% da altura, margem de ~8% da largura"'),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']).optional(),
  niveis: z
    .array(
      z.object({
        texto: z.string().optional().describe('O texto deste nível, como aparece'),
        papel: z.string().optional().describe('Papel: título, subtítulo, apoio, serviço'),
        cor: z.string().optional().describe('Cor aparente: branco, vermelho, amarelo…'),
        /**
         * 🔴 A caixa se classifica letra a letra, e o modelo erra isso sozinho.
         *
         * Com o enum antigo (`alta | baixa | mista`) o gpt-4o-mini classificou
         * "Feliz" e "Dia dos Pais!" como caixa ALTA — são Title Case. O erro
         * não é acadêmico: a descrição vira instrução, e a peça nova sairia em
         * CAIXA ALTA justamente por causa do modelo que deveria evitá-la.
         * "Title Case" é valor próprio, e a definição de cada um vai escrita.
         */
        caixa: z
          .enum(['ALTA', 'Title Case', 'sentença', 'baixa', 'mista'])
          .optional()
          .describe(
            'ALTA = TODAS as letras maiúsculas ("TERÇA MERECE"). "Title Case" = inicial de cada palavra maiúscula ("Dia dos Pais"). sentença = só a primeira palavra ("Hoje é dia de"). baixa = tudo minúsculo. Olhe letra por letra: começar com maiúscula NÃO é caixa alta.',
          ),
        tamanhoRelativo: z.string().optional().describe('Ex: "o maior", "metade do título"'),
      }),
    )
    .optional()
    .describe('Cada nível de texto, do maior para o menor'),
  /**
   * String OU objeto, porque o modelo devolve os dois.
   *
   * Pedindo "descreva cada um com a posição", o gpt-4o-mini passou a responder
   * `{"tipo":"linha","posicao":"horizontal, entre o título e o apoio"}` — a
   * resposta CERTA, recusada por `z.array(z.string())`. Duas rodadas seguidas
   * perdidas assim em 16/08/2026, logo depois de a enumeração fazer ele
   * enfim ENXERGAR o filete que vinha ignorando. Aceitar as duas formas e
   * normalizar custa cinco linhas; recusar custa a assinatura da marca.
   */
  elementosGraficos: z
    .array(z.union([z.string(), z.object({}).passthrough()]))
    .optional()
    .describe('Filetes, ondas, barras, ícones — com posição. Lista vazia se não houver nenhum.'),
  veuDeLeitura: z.string().optional().describe('Direção e intensidade do gradiente sobre a foto'),
  tratamentoDaFoto: z.string().optional().describe('Temperatura, contraste e clima da fotografia'),
})

export type GuiaDecodificado = z.infer<typeof schema>

/**
 * 🔴 A CAIXA é calculada a partir do texto transcrito, não perguntada.
 *
 * Medido em 16/08/2026 na arte do Dia dos Pais: em 3 rodadas a temperatura 0, o
 * gpt-4o-mini classificou "Feliz" como ALTA em 2 e como Title Case em 1 — e
 * "Feliz" é Title Case nas três. A TRANSCRIÇÃO, no entanto, saiu idêntica nas
 * três ("Feliz", "Dia dos Pais!", o apoio em minúsculas): o modelo lê as letras
 * com fidelidade e erra o RÓTULO. Como a caixa vira instrução na peça nova, o
 * rótulo errado reintroduz exatamente a caixa alta que este conserto remove.
 *
 * Mesma trava do crivo: o modelo declara o fato, o código tira a conclusão. A
 * resposta dele só é usada quando não há texto transcrito para medir.
 */
export function caixaDoTexto(texto: string): 'ALTA' | 'Title Case' | 'sentença' | 'baixa' | 'mista' | null {
  const letras = [...texto].filter((c) => /\p{L}/u.test(c))
  if (letras.length < 2) return null
  const maiuscula = (c: string) => c !== c.toLocaleLowerCase('pt-BR')
  if (letras.every(maiuscula)) return 'ALTA'
  if (letras.every((c) => !maiuscula(c))) return 'baixa'

  const palavras = texto.split(/\s+/).filter((p) => [...p].some((c) => /\p{L}/u.test(c)))
  const inicial = (p: string) => [...p].find((c) => /\p{L}/u.test(c))!
  const temCaixaAltaInteira = palavras.some(
    (p) => [...p].filter((c) => /\p{L}/u.test(c)).length >= 2 && [...p].filter((c) => /\p{L}/u.test(c)).every(maiuscula),
  )
  if (temCaixaAltaInteira) return 'mista'

  const capitalizadas = palavras.filter((p) => maiuscula(inicial(p)))
  // Só a primeira palavra em maiúscula, com outras adiante: é frase, não título.
  if (palavras.length > 1 && capitalizadas.length === 1 && maiuscula(inicial(palavras[0]))) {
    return 'sentença'
  }
  return capitalizadas.length > 0 ? 'Title Case' : 'mista'
}

/**
 * Achata o elemento gráfico numa frase, venha ele como string ou como objeto
 * (`{tipo, posicao}` e variações). Os valores são unidos na ordem em que o
 * modelo os escreveu — "linha — horizontal, entre o título e o apoio" —, que é
 * como a descrição em string já vinha.
 */
function textoDoElemento(e: unknown): string {
  if (typeof e === 'string') return e.trim()
  if (e && typeof e === 'object') {
    return Object.values(e as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(' — ')
      .trim()
  }
  return ''
}

/** Elementos gráficos normalizados, ou `null` quando a visão não respondeu. */
export function elementosDoGuia(g: GuiaDecodificado): string[] | null {
  if (!g.elementosGraficos) return null
  return g.elementosGraficos.map(textoDoElemento).filter(Boolean)
}

/**
 * Descrição em texto corrido, pronta para entrar no prompt.
 *
 * Campo que o modelo não respondeu simplesmente NÃO VIRA LINHA: uma linha
 * "Véu de leitura: undefined" seria pior que a ausência dela, e afirmar o que
 * não se leu é o defeito que a reconciliação existe para evitar.
 */
export function descricaoDoGuia(g: GuiaDecodificado): string {
  const linhas: string[] = []

  if (g.posicaoDoBloco) {
    linhas.push(
      `- Bloco de texto: ${g.posicaoDoBloco}${g.alinhamento ? `, alinhado à ${g.alinhamento}` : ''}.`,
    )
  } else if (g.alinhamento) {
    linhas.push(`- Bloco de texto alinhado à ${g.alinhamento}.`)
  }

  const niveis = (g.niveis ?? [])
    .map((n, i) => {
      // Medida no texto quando há texto; o rótulo do modelo é só o fallback.
      const caixa = (n.texto ? caixaDoTexto(n.texto) : null) ?? n.caixa
      const partes = [
        n.cor ? `cor ${n.cor}` : null,
        caixa ? `caixa ${caixa}` : null,
        n.tamanhoRelativo,
      ].filter(Boolean)
      return `  ${i + 1}. ${n.papel ?? 'nível'}${n.texto ? ` — "${n.texto}"` : ''}${
        partes.length > 0 ? ` · ${partes.join(' · ')}` : ''
      }`
    })
  if (niveis.length > 0) {
    linhas.push('- Níveis de texto (repita a MESMA estrutura, trocando só as palavras):', ...niveis)
  }

  // Lista vazia é uma AFIRMAÇÃO ("não há elemento gráfico"); campo ausente não
  // afirma nada. Colapsar os dois faria a peça nova perder um filete que o
  // modelo tem — ou ganhar a ordem de não ter o que ninguém verificou.
  const graficos = elementosDoGuia(g)
  if (graficos) {
    linhas.push(
      `- Elementos gráficos: ${
        graficos.length > 0 ? graficos.join('; ') : 'NENHUM — não acrescente nenhum'
      }.`,
    )
  }
  if (g.veuDeLeitura) linhas.push(`- Véu de leitura: ${g.veuDeLeitura}.`)
  if (g.tratamentoDaFoto) linhas.push(`- Tratamento da foto: ${g.tratamentoDaFoto}.`)

  return linhas.join('\n')
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
  /**
   * `[]` significa "o guia NÃO tem elemento gráfico" — afirmação que vira ordem
   * no prompt ("não acrescente nenhum"). `null` significa "a visão não
   * respondeu isto", e aí NADA é afirmado. Colapsar os dois já seria mentira
   * numa direção ou na outra.
   */
  elementosGraficos: string[] | null
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
                'Descreva a CAMADA GRÁFICA desta arte de Instagram — não a fotografia em si, mas as decisões de diagramação que precisam ser repetidas em outra peça da mesma marca.',
                'Seja concreto e mensurável: posição, alinhamento, cor de cada nível de texto, elementos gráficos presentes.',
                // "Lista vazia" é uma AFIRMAÇÃO forte (vira "não acrescente
                // nenhum" no prompt), então ela precisa ser barata de acertar:
                // sem a enumeração abaixo, o gpt-4o-mini devolveu vazio para uma
                // arte que tem filete com losango central logo abaixo da
                // manchete (Real Gelateria, 16/08/2026). Ornamento fino perto
                // do texto é justamente o que ele deixa passar.
                'ELEMENTOS GRÁFICOS: procure em volta e dentro do bloco de texto por filete ou linha fina (horizontal ou vertical), losango, ponto ou marcador entre linhas, selo, moldura, barra de cor, faixa e ícone. Descreva cada um com a posição.',
                'Só devolva a lista vazia se, depois de procurar, não houver NENHUM — inventar um faria a peça nova ganhar um enfeite que esta não tem, e não ver um faria ela perder a assinatura da marca.',
                // A instrução é repetida aqui porque o erro é frequente e caro:
                // o modelo classificou Title Case como caixa alta com o enum
                // antigo, a temperatura 0.
                'CAIXA de cada nível: olhe LETRA POR LETRA. Só é "ALTA" quando TODAS as letras são maiúsculas. Palavra que começa com maiúscula e segue em minúsculas é "Title Case", nunca ALTA.',
              ].join('\n'),
            },
          ],
        },
      ],
    })
    const descricao = descricaoDoGuia(object)
    /**
     * Reconciliação: resposta que não descreveu NEM os níveis de texto nem a
     * posição do bloco não sobrou nada de aproveitável — devolver uma descrição
     * vazia faria o prompt ganhar um cabeçalho "O QUE O MODELO FAZ:" sem nada
     * embaixo, que é pior do que não ter a seção.
     */
    if (!descricao.trim()) {
      console.warn('[guia] a visão respondeu, mas sem nível de texto nem posição — seguindo sem a leitura')
      return null
    }
    return { descricao, elementosGraficos: elementosDoGuia(object) }
  } catch (error) {
    console.warn('[guia] decodificação indisponível — seguindo só com o SPINE textual:', error)
    return null
  }
}
