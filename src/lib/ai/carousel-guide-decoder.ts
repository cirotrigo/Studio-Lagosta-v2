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

import { normalizeForComparison } from '@/lib/ai/text-comparison'

/**
 * 🔴 `gpt-4o`, e não o `gpt-4o-mini` — o mini NÃO enxerga ONDE o texto está.
 *
 * Medido em 17/08/2026 nas duas artes de referência do O Quintal, 2 rodadas
 * cada, temperatura 0, contra a posição medida à mão:
 *
 *              manchete real   4o-mini      4o
 *   Sabadouu   banda 2         2 ✓          2 ✓
 *   Kaftas     banda 6         3 e 4 ✗      6 ✓ (nas duas rodadas)
 *   lado        esquerda       "centro" ✗   esquerda ✓
 *
 * O erro do mini tem forma: ele numera as zonas pela ORDEM em que as lê, então
 * a primeira manchete cai sempre no alto — e o modelo escolhido pelo Quintal
 * tem a manchete no TERÇO INFERIOR. Mandar a peça nova pôr a manchete no topo
 * é exatamente o defeito que o papel `style-guide` nasceu para corrigir.
 *
 * "Barato" era a razão do mini e não se sustenta: a leitura é UMA chamada por
 * geração, contra US$ 0,165 da geração que ela dirige.
 */
const VISION_MODEL = 'gpt-4o'

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
const nivelSchema = z.object({
  /**
   * 🔴 A transcrição é INSUMO INTERNO — nunca vai para o prompt da peça nova.
   *
   * Ela serve a duas coisas que só se fazem com as letras na mão: medir a
   * CAIXA (`caixaDoTexto`) e detectar o VAZAMENTO depois (`textosDoGuia`, lido
   * pela conferência). Ver a nota em `descricaoDoGuia` para o que aconteceu
   * quando ela era escrita no prompt.
   */
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
})

/**
 * 🔴 Uma arte tem ZONAS de texto, não um bloco só — e descrevê-la como bloco
 * único faz a peça nova empilhar tudo no meio.
 *
 * Medido em 17/08/2026 no O Quintal Parrilla: a arte de referência tem a
 * manchete no ALTO ("Sabadouu", ~20% da altura) e o serviço no RODAPÉ
 * (funcionamento, endereço, logo). Com um campo só, o gpt-4o-mini devolveu
 * `"canto inferior esquerdo, começando a ~30% da altura"` — a média
 * contraditória das duas zonas: "inferior" do rodapé com a altura da manchete.
 * O gpt-image resolveu a contradição do jeito dele, pondo TUDO num bloco no
 * meio do quadro. Duas pessoas reclamaram disso no mesmo dia ("o título foi
 * deslocado para o meio e na cópia estava alinhado no canto superior
 * esquerdo").
 *
 * A posição também deixou de ser prosa livre: ela virou a BANDA numerada (o
 * fato medido) mais o `lado` em enum, e o rótulo "terço inferior" passou a ser
 * conclusão do código — a contradição acima só é possível em texto corrido.
 */
const zonaSchema = z.object({
  papel: z
    .string()
    .optional()
    .describe('O que esta zona é: manchete, serviço/rodapé, CTA, selo, assinatura'),
  /**
   * 🔴 BANDA numerada, não rótulo — e o rótulo é conclusão do CÓDIGO.
   *
   * Mesma trava do `caixaDoTexto` e do crivo: o modelo declara o fato bruto
   * (em qual das 8 faixas a primeira linha está) e quem conclui "terço
   * inferior" é `faixaDaBanda`. Pedindo o rótulo direto, a resposta saía pela
   * ORDEM de leitura — "faixa topo" para uma manchete que está a 66% da altura.
   */
  banda: z
    .number()
    .optional()
    .describe(
      'Faixa horizontal (1 a 8) onde a PRIMEIRA LINHA desta zona está: 1 encosta na borda de cima, 8 na de baixo.',
    ),
  lado: z.enum(['esquerda', 'centro', 'direita']).optional().describe('Lado HORIZONTAL da zona'),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']).optional(),
  niveis: z.array(nivelSchema).optional().describe('Níveis de texto desta zona, do maior para o menor'),
})

/** Total de faixas horizontais em que a arte é cortada para a leitura. */
const BANDAS = 8

/**
 * O rótulo da faixa, concluído da banda medida. Fora de 1..8 (ou ausente) não
 * conclui NADA — afirmar posição que ninguém leu é pior do que omiti-la.
 */
export function faixaDaBanda(banda?: number): string | null {
  if (typeof banda !== 'number' || !Number.isFinite(banda)) return null
  const n = Math.round(banda)
  if (n < 1 || n > BANDAS) return null
  const rotulo =
    n === 1 ? 'topo' : n <= 3 ? 'terço superior' : n <= 5 ? 'meio' : n <= 7 ? 'terço inferior' : 'rodapé'
  // A porcentagem vai junto porque é o que o modelo de imagem consegue seguir:
  // "terço inferior" ele interpreta, "~69% da altura" ele mede.
  const pct = Math.round(((n - 0.5) / BANDAS) * 100)
  return `${rotulo} (começa a ~${pct}% da altura)`
}

const schema = z.object({
  zonas: z
    .array(zonaSchema)
    .optional()
    .describe(
      'Uma entrada por ZONA de texto separada. Manchete no alto e serviço no rodapé são DUAS zonas, nunca uma.',
    ),
  // ── Forma ANTIGA, mantida para reconciliação ────────────────────────────
  // O modelo às vezes responde no formato de bloco único (é o que ele fazia
  // antes), e recusar isso seria descartar uma leitura aproveitável — a mesma
  // lição que o crivo aprendeu em 11/08. `zonasDoGuia` normaliza os dois.
  posicaoDoBloco: z
    .string()
    .optional()
    .describe('Só se houver UMA zona de texto: onde ela fica. Havendo mais de uma, use `zonas`.'),
  alinhamento: z.enum(['esquerda', 'centro', 'direita']).optional(),
  niveis: z.array(nivelSchema).optional().describe('Só se houver UMA zona: os níveis dela, do maior para o menor'),
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
  if (typeof e === 'string') return semPalavrasDoModelo(e.trim())
  if (e && typeof e === 'object') {
    return semPalavrasDoModelo(
      Object.values(e as Record<string, unknown>)
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .join(' — ')
        .trim(),
    )
  }
  return ''
}

/**
 * 🔴 A última porta por onde as palavras do modelo entravam no prompt.
 *
 * Tirar o texto dos NÍVEIS não bastou: a visão descreve o elemento gráfico pela
 * vizinhança e cita a vizinhança entre aspas — "ícone de relógio antes de
 * 'Funcionamento - 11h às 00h'", medido em 17/08/2026 na arte de referência do
 * O Quintal. E essa linha entra DUAS vezes no prompt, uma delas como ordem
 * imperativa no topo do MODELO SPINE. Seria o mesmo vazamento por outra porta.
 *
 * A instrução da visão já pede posição pelo PAPEL do texto; isto é a trava
 * mecânica, porque instrução sozinha já se provou insuficiente contra a string
 * literal. Trecho entre aspas com 4+ caracteres vira "do texto": a POSIÇÃO
 * sobrevive, a palavra não.
 */
export function semPalavrasDoModelo(descricao: string): string {
  return (
    descricao
      // "antes de 'Funcionamento'" → "antes do texto". A preposição entra na
      // troca para a frase não sair como "antes de do texto".
      .replace(/\b(?:de|do|da)\s+(?=['"“”‘’])['"“”‘’][^'"“”‘’]{4,}['"“”‘’]/gi, 'do texto')
      .replace(/['"“”‘’][^'"“”‘’]{4,}['"“”‘’]/g, 'do texto')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/**
 * 🔴 Como a visão chama a MARCA quando a encontra na arte.
 *
 * A marca NÃO é ornamento e NÃO é nível de texto: ela tem bloco próprio no
 * prompt (`instrucaoLogoPeloModelo`), que manda reproduzir o arquivo oficial.
 * Deixá-la entrar por estas duas outras portas faz a peça sair com DUAS
 * marcas — medido em 17/08/2026 no almoço executivo do O Quintal: o
 * decodificador devolveu "selo à direita do serviço" como elemento gráfico e
 * uma "Zona 3 (assinatura)" como zona de texto, o SPINE promoveu o selo a
 * "DESENHE ESTES ELEMENTOS GRÁFICOS, obrigatoriamente", e a arte saiu com o
 * lockup completo no topo mais o símbolo sozinho no rodapé. O cliente reprovou:
 * "está colocando o ícone da logo mais a logo, não precisa disso".
 *
 * "marcador" não casa com `\bmarca\b` (a fronteira protege), então o marcador
 * entre linhas continua sendo ornamento legítimo.
 */
const DA_MARCA = /\b(selo|logo|logotipo|logomarca|marca|emblema|s[íi]mbolo|bras[ãa]o|monograma|assinatura)\b/i

/** Elementos gráficos normalizados, ou `null` quando a visão não respondeu. */
export function elementosDoGuia(g: GuiaDecodificado): string[] | null {
  if (!g.elementosGraficos) return null
  // A marca sai da lista de ornamentos: quem a desenha é o bloco da logo, uma
  // vez só. Sobrando lista vazia, a afirmação "o modelo não tem ornamento" é
  // verdadeira — o selo dele era a marca.
  return g.elementosGraficos.map(textoDoElemento).filter((e) => e && !DA_MARCA.test(e))
}

/**
 * As zonas de texto, normalizadas — venha a resposta na forma nova (`zonas`)
 * ou na antiga (bloco único). Lista vazia quando não deu para ler nenhuma.
 */
export function zonasDoGuia(g: GuiaDecodificado): Array<z.infer<typeof zonaSchema>> {
  const zonas = (g.zonas ?? []).filter(
    (z) => faixaDaBanda(z.banda) || z.lado || (z.niveis ?? []).length > 0,
  )
  if (zonas.length > 0) return zonas
  // Forma antiga: um bloco só. `posicaoDoBloco` é prosa livre e entra como
  // `papel` para não se perder — o que ela diz de posição já é o que existe.
  if (g.posicaoDoBloco || g.alinhamento || (g.niveis ?? []).length > 0) {
    return [{ papel: g.posicaoDoBloco, alinhamento: g.alinhamento, niveis: g.niveis }]
  }
  return []
}

/**
 * Separa os níveis da zona entre a MARCA e o texto de verdade.
 *
 * 🔴 Nível a nível, nunca zona inteira. A primeira versão só reconhecia a
 * assinatura quando ela era a zona TODA, e o caso real é misto: no modelo do
 * "Puxadinho" a zona de rodapé é [assinatura, serviço, serviço]. Como a zona
 * não era "só a marca", a assinatura seguiu como nível de texto — e a marca foi
 * parar no topo, longe de onde a referência a põe ("a logomarca ficou
 * posicionada no topo e não posicionou como na referência", 17/08/2026).
 */
function separarAMarca(zona: z.infer<typeof zonaSchema>, nomeDaMarca?: string | null) {
  const niveis = zona.niveis ?? []
  const daMarca = niveis.filter((n) => ehAMarca(n, nomeDaMarca))
  return { daMarca, deTexto: niveis.filter((n) => !daMarca.includes(n)) }
}

/**
 * 🔴 O NOME DA MARCA é o sinal confiável; o rótulo do papel, não.
 *
 * A visão chama a mesma marca de "selo" numa arte, de "assinatura" em outra e
 * de "título" numa terceira — medido nas três referências do O Quintal em
 * 17/08/2026. Confiar no rótulo deixou a marca passar como nível de texto na
 * referência do "Puxadinho", e a logo foi para o topo. O texto transcrito,
 * esse, é fiel: a arte tem a marca escrita nela, e nós sabemos o nome dela.
 *
 * Casa nos dois sentidos porque a arte pode trazer o lockup completo
 * ("O Quintal Parrilla Bar") ou só o nome ("O Quintal").
 */
function ehAMarca(
  nivel: { texto?: string; papel?: string },
  nomeDaMarca?: string | null,
): boolean {
  if (nivel.papel && DA_MARCA.test(nivel.papel)) return true
  const nome = nomeDaMarca ? normalizeForComparison(nomeDaMarca) : ''
  if (!nome || nome.length < 4 || !nivel.texto) return false
  const texto = normalizeForComparison(nivel.texto)
  if (!texto) return false
  return texto.includes(nome) || nome.includes(texto)
}

/** A posição da assinatura da marca no guia, ou null se não houver. */
export function assinaturaDoGuia(g: GuiaDecodificado, nomeDaMarca?: string | null) {
  for (const zona of zonasDoGuia(g)) {
    if (separarAMarca(zona, nomeDaMarca).daMarca.length > 0) {
      return { banda: zona.banda, lado: zona.lado }
    }
  }
  return null
}

/** Todo texto transcrito do guia, em ordem — insumo interno, nunca prompt. */
export function textosDoGuia(g: GuiaDecodificado): string[] {
  return [...zonasDoGuia(g).flatMap((z) => z.niveis ?? []), ...(g.niveis ?? [])]
    .map((n) => n.texto?.trim())
    .filter((t): t is string => !!t)
}

/**
 * Descrição em texto corrido, pronta para entrar no prompt.
 *
 * 🔴 AS PALAVRAS DO MODELO NÃO ENTRAM AQUI. Não as reintroduza.
 *
 * Até 17/08/2026 cada nível era escrito como `1. título — "Sabadouuu"`, logo
 * abaixo do cabeçalho "repita a MESMA estrutura, trocando só as palavras". O
 * gpt-image letrou as palavras: as cinco peças do O Quintal saíram com o
 * "Funcionamento - 11h às 00h" e o "R. Aleixo Netto, 1158" da arte de
 * referência, dados que ninguém pediu e que o cliente reprovou uma a uma
 * ("você está incluindo endereço e funcionamento sem que seja solicitado no
 * briefing"; "misturou a cópia da arte de referência com a copy solicitada").
 *
 * É a mesma lei já registrada para a caixa das letras (`buildArtePrompt`): a
 * STRING literal no prompt vence qualquer regra escrita sobre ela — o
 * preâmbulo do papel `style-guide` mandava, em inglês e duas vezes, nunca
 * copiar texto da referência, e perdeu para as aspas. A trava é não escrever.
 *
 * A transcrição continua sendo pedida à visão porque é dela que saem a CAIXA
 * medida e a conferência de vazamento — só não vira texto de prompt.
 *
 * Campo que o modelo não respondeu simplesmente NÃO VIRA LINHA: uma linha
 * "Véu de leitura: undefined" seria pior que a ausência dela, e afirmar o que
 * não se leu é o defeito que a reconciliação existe para evitar.
 */
export function descricaoDoGuia(
  g: GuiaDecodificado,
  opcoes: { tratamentoDaFoto?: boolean; nomeDaMarca?: string | null } = {},
): string {
  const linhas: string[] = []

  const zonas = zonasDoGuia(g)
  // A zona da MARCA não conta como zona de TEXTO: contá-la faria o modelo
  // procurar um terceiro bloco de copy que não existe.
  const zonasDeTexto = zonas.filter((z) => {
    const { daMarca, deTexto } = separarAMarca(z, opcoes.nomeDaMarca)
    // Zona sem nível nenhum ainda é zona de texto (a visão só não detalhou).
    return deTexto.length > 0 || daMarca.length === 0
  }).length
  if (zonasDeTexto > 1) {
    linhas.push(
      `- ZONAS DE TEXTO: ${zonasDeTexto}, SEPARADAS. Mantenha cada uma na sua faixa — não junte tudo num bloco só.`,
    )
  }
  zonas.forEach((zona, iz) => {
    const faixa = faixaDaBanda(zona.banda)
    const lugar = [
      faixa ? `faixa ${faixa}` : null,
      zona.lado ? `lado ${zona.lado}` : null,
      zona.alinhamento ? `alinhado à ${zona.alinhamento}` : null,
    ]
      .filter(Boolean)
      .join(', ')
    const nome = zonas.length > 1 ? `Zona ${iz + 1}${zona.papel ? ` (${zona.papel})` : ''}` : 'Bloco de texto'
    linhas.push(`- ${nome}${lugar ? `: ${lugar}` : zona.papel && zonas.length === 1 ? `: ${zona.papel}` : ''}.`)

    /**
     * A zona da MARCA não vira lista de níveis para letrar — vira uma linha
     * dizendo onde ela mora. Ver `DA_MARCA`: a peça saía com duas marcas, e o
     * pedido do cliente é "usar somente a logomarca como na arte de referência".
     * Dizer o lugar ajuda; listar como texto faz o modelo DESENHAR de novo.
     */
    const { daMarca, deTexto } = separarAMarca(zona, opcoes.nomeDaMarca)
    if (daMarca.length > 0) {
      linhas.push(
        `  ↳ A MARCA fica AQUI${lugar ? ` (${lugar})` : ''}, como na referência: ela aparece UMA única vez na peça, desenhada conforme o bloco da logo. Não a repita em outro canto e não a trate como texto.`,
      )
    }

    const niveis = deTexto.map((n, i) => {
      // Medida no texto quando há texto; o rótulo do modelo é só o fallback.
      const caixa = (n.texto ? caixaDoTexto(n.texto) : null) ?? n.caixa
      const partes = [
        n.cor ? `cor ${n.cor}` : null,
        caixa ? `caixa ${caixa}` : null,
        n.tamanhoRelativo,
      ].filter(Boolean)
      // Sem o texto, de propósito — ver o cabeçalho desta função.
      return `    ${i + 1}. ${n.papel ?? 'nível'}${partes.length > 0 ? ` · ${partes.join(' · ')}` : ''}`
    })
    if (niveis.length > 0) {
      linhas.push('  níveis de texto, do maior para o menor:', ...niveis)
    }
  })
  if (zonas.some((z) => (z.niveis ?? []).length > 0)) {
    linhas.push(
      '- ⛔ As PALAVRAS do modelo foram omitidas de propósito: o que se copia dele é a FORMA (onde, em que cor, em que caixa, em que tamanho). As palavras desta peça são só as da COPY listada acima — nenhuma outra.',
    )
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
  /**
   * 🔴 O tratamento da foto do modelo NÃO se replica na peça avulsa, e por isso
   * a linha é opt-in.
   *
   * Ela é uma descrição da foto ANTIGA que chegava ao prompt como ordem sobre a
   * foto NOVA — mesma forma do vazamento de palavras consertado no mesmo dia.
   * Medido no TERO em 17/08/2026: o spine mandou "Tratamento da foto:
   * temperatura neutra, contraste alto, clima acolhedor", a peça saiu com a foto
   * estourada de contraste e o cliente reprovou com "a foto ficou muito
   * contrastada, você não precisa alterar a imagem". Contra isso, o bloco
   * [FIDELIDADE À FOTO] dizia "NÃO RELUMIE" seis parágrafos acima — e perdeu,
   * porque instrução colada à referência vence instrução geral.
   *
   * No carrossel (`incluir`) ela continua, e a assimetria é deliberada: lá o
   * guia ESTABELECE o look de uma série que precisa parecer a mesma sessão de
   * fotos, e é a regra da casa que o guia vence. Na peça avulsa não há série —
   * há uma foto real que o dono precisa reconhecer.
   */
  if (opcoes.tratamentoDaFoto && g.tratamentoDaFoto) {
    linhas.push(`- Tratamento da foto: ${g.tratamentoDaFoto}.`)
  }

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
  /**
   * As palavras que o guia/modelo tem escritas — INSUMO INTERNO, nunca prompt.
   *
   * Existe para fechar o ciclo do vazamento: a conferência compara a
   * transcrição da arte PRONTA com esta lista e avisa quando uma frase do post
   * antigo reaparece na peça nova. Sem isso, só os NÚMEROS eram conferidos
   * (`numerosSemLastro`), e foi por eles que o defeito de 17/08 apareceu no
   * registro — "11, 00, 1158" em 3 das 5 peças, enquanto o endereço por
   * extenso passava calado.
   */
  textos: string[]
  /**
   * Onde o modelo põe a MARCA, quando dá para ler. Vira o canto reservado no
   * bloco da logo — sem isto o gerador escolhe o canto sozinho, e a marca sai
   * no topo contra uma referência que a tem no rodapé (17/08/2026).
   *
   * `null` = a visão não identificou assinatura; aí o canto continua livre,
   * que é o comportamento antigo.
   */
  assinatura: { banda?: number; lado?: 'esquerda' | 'centro' | 'direita' } | null
}

/**
 * Lê o slide-guia e devolve o que os irmãos precisam copiar, ou null quando a
 * visão não está disponível (o chamador segue sem ela).
 *
 * `paraSerie` distingue os dois usos: no carrossel o guia estabelece o look de
 * uma série inteira e o tratamento da foto dele é para copiar; na peça avulsa
 * ele é só um modelo de diagramação, e descrever o tratamento da foto ANTIGA
 * vira ordem de retocar a foto NOVA — ver a nota em `descricaoDoGuia`.
 */
export async function decodificarGuia(
  imagem: Buffer,
  opcoes: {
    paraSerie?: boolean
    /** Nome da marca — é como a marca é distinguida do texto. Ver `ehAMarca`. */
    nomeDaMarca?: string | null
  } = {},
): Promise<GuiaLido | null> {
  try {
    const { object } = await generateObject({
      model: openai(VISION_MODEL),
      temperature: 0,
      // 900 era o teto de quando a resposta era um bloco só. Com as zonas a
      // estrutura ficou mais funda (uma lista de níveis POR zona), e resposta
      // truncada aqui não dá erro visível: o `catch` devolve null e a peça sai
      // sem a leitura, em silêncio — o defeito que o comentário do schema
      // registra desde 16/08.
      maxOutputTokens: 1400,
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
                // Sem esta separação o modelo devolve a MÉDIA das zonas: uma
                // arte com manchete no alto e serviço no rodapé virou "canto
                // inferior esquerdo, começando a ~30% da altura" (O Quintal,
                // 17/08/2026), e a peça nova saiu com tudo empilhado no meio.
                'ZONAS: devolva uma entrada em `zonas` para cada grupo de texto SEPARADO por espaço vazio. Manchete no alto e bloco de serviço no rodapé são DUAS zonas — nunca as descreva como uma só, e nunca faça a média entre elas. Havendo de fato um único grupo, devolva uma zona só.',
                // A redação abaixo é a que MEDIU certo em 17/08/2026 (ver a nota
                // do VISION_MODEL). O que a faz funcionar é mandar medir a
                // DISTÂNCIA ATÉ A BORDA DE CIMA, com dois exemplos de calibração
                // — sem eles a resposta volta a seguir a ordem de leitura.
                'BANDA: imagine a imagem cortada em 8 faixas horizontais de mesma altura, numeradas de 1 (encostada na borda de cima) a 8 (encostada na borda de baixo). Para cada zona, `banda` é o número da faixa onde a PRIMEIRA LINHA daquele texto está. Meça a distância da borda de CIMA até o texto: texto na metade da imagem é banda 4 ou 5; texto pouco acima da borda de baixo é 7 ou 8. Não use a ordem em que você leu as zonas para decidir a banda.',
                // "Lista vazia" é uma AFIRMAÇÃO forte (vira "não acrescente
                // nenhum" no prompt), então ela precisa ser barata de acertar:
                // sem a enumeração abaixo, o gpt-4o-mini devolveu vazio para uma
                // arte que tem filete com losango central logo abaixo da
                // manchete (Real Gelateria, 16/08/2026). Ornamento fino perto
                // do texto é justamente o que ele deixa passar.
                'ELEMENTOS GRÁFICOS: procure em volta e dentro do bloco de texto por filete ou linha fina (horizontal ou vertical), losango, ponto ou marcador entre linhas, selo, moldura, barra de cor, faixa e ícone. Descreva cada um com a posição, situando-o pelo PAPEL do texto vizinho ("antes da linha de serviço", "abaixo da manchete") — nunca citando as palavras que estão escritas ali.',
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
    const descricao = descricaoDoGuia(object, {
      tratamentoDaFoto: opcoes.paraSerie,
      nomeDaMarca: opcoes.nomeDaMarca,
    })
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
    return {
      descricao,
      elementosGraficos: elementosDoGuia(object),
      textos: textosDoGuia(object),
      assinatura: assinaturaDoGuia(object, opcoes.nomeDaMarca),
    }
  } catch (error) {
    console.warn('[guia] decodificação indisponível — seguindo só com o SPINE textual:', error)
    return null
  }
}
