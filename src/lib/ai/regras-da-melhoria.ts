/**
 * REGRAS DA CASA NA MELHORIA — o que a arte pronta ainda precisa respeitar.
 *
 * A geração por IA acumulou, entre 17 e 24/08/2026, um corpo de regras duras
 * conquistadas peça a peça: serviço no rodapé, véu local, leitura da área
 * livre da foto. **Nada disso chegava à melhoria.** Contado por termo, o
 * prompt da melhoria (`DEFAULT_ART_DIRECTION`) tinha ZERO ocorrência de
 * "rodapé", "serviço", "véu" e "margem", contra 10, 15, 8 e 7 do
 * `image-prompt-builder`. O runner da melhoria importa 7 módulos; o da
 * geração, 17 — e nenhum dos que carregam aprendizado.
 *
 * Consequência medida em 01/09/2026, numa rodada de 7 correções do Ciro no By
 * Rock: QUATRO delas eram a mesma regra ("o horário/endereço devia estar no
 * rodapé"), que o sistema já sabia desde 17/08 e simplesmente não dizia aqui.
 * Cada repetição custou US$ 0,165 e ~95s para reensinar à mão o que já estava
 * escrito no código.
 *
 * ⚠️ ESTE MÓDULO NÃO É CÓPIA DO PROMPT DA GERAÇÃO. Os dois trabalhos são
 * diferentes — lá se compõe uma peça do zero a partir de foto + copy; aqui se
 * redesenha uma arte que JÁ está diagramada. Duas regras da geração foram
 * deliberadamente NÃO portadas porque contradizem o feedback do próprio Ciro
 * na mesma rodada; estão anotadas caso a caso abaixo. Não "complete" a
 * paridade com a geração sem reler aqueles feedbacks.
 *
 * Injetado pelo SISTEMA, fora do bloco editável (`DEFAULT_ART_DIRECTION` /
 * `Project.artImprovementPrompt`) — mesmo precedente da identidade da marca:
 * um prompt de projeto mal escrito não pode apagar as regras da casa.
 *
 * Módulo PURO (só `blocos-de-servico`, que também é puro): a prévia da aba
 * Marca é client e importar o SDK da OpenAI arrastaria tudo para o bundle.
 */

import { blocosDeServico } from './blocos-de-servico'

export interface RegrasDaMelhoriaArgs {
  /**
   * Textos que a arte deve reproduzir verbatim. **Vazio é o caso comum** na
   * arte vinda do canvas ou de upload (`source: 'arte-enviada'`): nas 6
   * melhorias medidas em 01/09, todas as 6 tinham `textCheck: 'skipped'` por
   * falta de texto esperado. Com a lista, o serviço é apontado NOMINALMENTE;
   * sem ela, a regra passa a ser condicional ao que o modelo LÊ na IMAGEM 1.
   */
  expectedTexts: string[]
  /** O pedido do cliente — só para detectar autorização de encurtar texto. */
  userRequest: string
  /**
   * Ajuste autorizado NA FOTO (o campo avançado do modal). Ausente ou vazio,
   * a fotografia é declarada INTOCÁVEL — ver `regraDeFidelidadeDaFoto`.
   */
  instrucaoImagem?: string | null
  /**
   * A arte de origem foi lida por visão e NÃO tem texto (capa de carrossel,
   * foto pura). Diferente de `expectedTexts: []`, que só diz que ninguém
   * transcreveu — ver `regraDaArteSemTexto`.
   */
  arteSemTexto?: boolean
}

/**
 * Verbos com que se pede menos texto. Existe por um conflito REAL do prompt
 * atual: `[LIMITES ABSOLUTOS]` proíbe "encurtar" qualquer palavra e a seção
 * `[PEDIDO DO CLIENTE]` declara que o pedido nunca vence os limites de
 * palavras — então "diminua a quantidade de texto" era literalmente proibido
 * de ser atendido. O Ciro pediu isso duas vezes em 01/09 ("a copy está muito
 * grande", "diminua a quantidade de texto e melhore a leitura").
 *
 * A liberação é ESTREITA de propósito: só vale quando não há texto esperado
 * (ninguém aprovou aquela copy no Studio) E o pedido pede explicitamente.
 * Arte com texto aprovado continua intocável, que é o que a verificação de
 * visão protege.
 */
const PEDE_MENOS_TEXTO =
  /\b(diminu|reduz|encurt|menos\s+text|menos\s+palavra|enxug|simplific|resum|tir[ae]\s+(o\s+)?excesso)/i

export function pedeMenosTexto(userRequest: string): boolean {
  return PEDE_MENOS_TEXTO.test(userRequest)
}

/**
 * A regra do serviço — a mais violada de todas (4 das 7 correções de 01/09).
 *
 * Dois caminhos, porque a melhoria nem sempre sabe qual é a copy:
 *  - COM texto esperado: aponta cada bloco pelo nome, como faz
 *    `instrucaoDeServico` na geração.
 *  - SEM: a condição passa a ser o que o modelo enxerga na arte. É o caso
 *    comum aqui, e por isso não dá para só reusar a função da geração.
 *
 * ⚠️ DIVERGE DA GERAÇÃO DE PROPÓSITO: lá o serviço vai "no MENOR nível de
 * texto". Aqui NÃO — em 01/09 o Ciro reprovou exatamente isso duas vezes ("as
 * fontes do horário do endereço ficaram muito pequena, não dá pra ler bem" e
 * "o horário o endereço no rodapé está muito pequeno, aumente o tamanho da
 * fonte"). O menor nível continua valendo como hierarquia, com um PISO de
 * legibilidade explícito.
 */
export function instrucaoDeServicoNaMelhoria(expectedTexts: string[]): string {
  const servico = blocosDeServico(expectedTexts)

  const alvo =
    servico.length > 0
      ? [
          'Estes blocos da arte são informação de serviço:',
          ...servico.map((b) => `- ${b.papel}: "${b.texto}"`),
        ].join('\n')
      : 'Se a arte tiver linha de horário de funcionamento ou de endereço, ela é informação de serviço.'

  return [
    '1. SERVIÇO VAI PARA O RODAPÉ.',
    alvo,
    'O serviço fica AGRUPADO NO RODAPÉ, um item por linha, alinhados entre si — nunca no meio do quadro, nunca colado à manchete, nunca ao lado dela. Se na arte original ele estiver junto do título ou no topo, MOVA para o rodapé: isto é uma correção, não uma opção.',
    'Ele sai da sequência de cima: o bloco principal fica só com a manchete e o apoio que NÃO são serviço. Não repita horário nem endereço em dois lugares da mesma peça.',
    'TAMANHO: o serviço é o menor nível de texto da peça, mas precisa ser CONFORTAVELMENTE LEGÍVEL num celular — nunca letra miúda, nunca menor que cerca de metade do corpo do texto de apoio. Havendo conflito entre "ser o menor" e "ser legível", a legibilidade vence.',
    'ESTILO: destaque o horário do resto (peso ou cor da marca) e, se a identidade da arte já usa ícones, um ícone pequeno pode separar horário de endereço. Ícone só existe se houver a linha que ele acompanha.',
    'O rodapé é a faixa logo ACIMA da borda, não a borda: o serviço não encosta no limite inferior da arte.',
  ].join('\n')
}

/**
 * As regras que não dependem da copy.
 *
 * A numeração é contínua com a do serviço porque no prompt elas formam uma
 * lista só — regra numerada é mais obedecida que parágrafo corrido, que é a
 * forma que o `image-prompt-builder` já usa.
 */
function regrasDeComposicao(): string[] {
  return [
    /**
     * 🔴 DIVERGE DA GERAÇÃO DE PROPÓSITO — e esta é a divergência mais
     * importante do módulo.
     *
     * `regraDeSafeArea` manda reservar 1/8 da altura no topo e no rodapé do
     * story (~242px em 1936). Portar isso aqui contradiria FRONTALMENTE a
     * correção do Ciro em 01/09: "a margem do topo e do rodapé estão GRANDES,
     * use por padrão 90 pixels". As artes dele vêm do canvas de design, que
     * tem margens próprias e já aprovadas — a melhoria não é quem redefine a
     * margem da marca, é quem a preserva. A safe area continua sendo assunto
     * de quem CRIA a peça.
     *
     * ⚠️ Isso deixa em aberto uma tensão real de produto: texto a 90px do topo
     * de um story fica sob o avatar que o Instagram desenha. Levantado com o
     * Ciro em 01/09/2026; enquanto ele não decidir, a melhoria PRESERVA o que
     * a arte já tem em vez de escolher um dos dois lados sozinha.
     */
    '2. MARGEM: preserve a margem da arte original. Não aumente o respiro das bordas, não "centralize melhor" e não recue os blocos para dentro — se a arte já tem uma margem consistente, ela é a margem da marca e permanece exatamente como está. Corrija margem apenas quando um elemento estiver encostado na borda ou visivelmente desalinhado dos demais.',

    // Portado da regra 4b do image-prompt-builder (17/08/2026), que nasceu do
    // véu virando escurecimento GLOBAL nas peças do O Quintal. O Ciro reprovou
    // o mesmo defeito na melhoria em 01/09: "aqui o véu ficou muito marcado".
    '3. VÉU DE LEITURA LOCAL E SUAVE: quando o texto precisar de contraste, use um sussurro de sombra APENAS na faixa onde ele pousa (no máximo cerca de um terço do quadro), sumindo antes de chegar ao assunto da foto. A foto continua nítida e tão clara quanto a original POR BAIXO do véu — nunca uma tarja. ⛔ Nunca escureça a foto inteira nem baixe o brilho geral da cena para destacar texto. Se o texto não ficar legível com um véu leve, MUDE O TEXTO DE LUGAR em vez de adensar o véu.',

    /**
     * O feedback que originou esta regra é de diagnóstico, não de gosto:
     * "você errou na leitura da imagem para definir a área livre, que nesse
     * caso o texto fica melhor no rodapé e não o topo". A direção de arte
     * atual só diz onde o texto PODE ir ("áreas desfocadas, cantos, paredes,
     * céu"); faltava a ordem de LER a foto antes de decidir, e a licença
     * explícita de contrariar a posição da arte original.
     */
    '4. LEIA A FOTO ANTES DE POSICIONAR O TEXTO. Identifique o assunto principal (o prato, a bebida, a pessoa, o produto) e onde a imagem é calma — desfocada, escura, lisa, sem informação. O bloco de texto vai na área calma, mesmo que isso signifique mudá-lo de lugar em relação à arte original: se o assunto está no topo, o texto desce; se está embaixo, o texto sobe. Nunca deixe texto sobre o assunto só porque a arte original o deixava ali. Nenhuma parte do assunto pode ser coberta.',

    /**
     * A direção de arte JÁ tinha uma seção de palavras-chave, mas permissiva
     * ("destaque apenas as palavras realmente importantes"). O Ciro pediu
     * destaque em 3 das 7 correções de 01/09 — ou seja, na prática o modelo
     * lia aquilo como opcional e não destacava nada. Aqui vira ordem.
     */
    '5. DESTAQUE AS PALAVRAS-CHAVE. Em todo bloco de texto com mais de três palavras, as palavras que carregam a informação (o prato, o dia, o preço, o benefício) recebem destaque por PESO da fonte ou pela cor de acento da marca — o resto fica no peso normal. Bloco inteiro no mesmo peso e na mesma cor é defeito: é o que transforma a peça num parágrafo. O destaque é de peso e cor, não de tamanho: a diferença de escala entre a palavra destacada e as vizinhas não passa de cerca de 20%.',

    /**
     * 🔴 Medido em 01/09/2026, com o prompt já consertado da foto: as TRÊS
     * rodadas inventaram horário E endereço — "Foz do Iguaçu, PR", "São José
     * dos Pinhais", "Jaraguá do Sul, SC" — para um cliente de Vitória. O
     * modelo lê o serviço da imagem, não entende um pedaço, e COMPLETA com o
     * que parece plausível. Nada no prompt dizia o que fazer nesse caso.
     *
     * É a mesma classe já registrada sobre os tiers baratos ("inventam
     * número, e a conferência não tem regra contra texto A MAIS") — só que
     * aqui sai endereço de outro estado, sobre o negócio do cliente.
     */
    '6. NÃO INVENTE DADO QUE VOCÊ NÃO CONSEGUE LER. Horário, endereço, telefone, preço e nome de prato são fatos do cliente: ou você os reproduz exatamente como estão na arte, ou os DEIXA DE FORA. Se um trecho estiver ilegível, cortado ou você tiver qualquer dúvida sobre o que está escrito, OMITA o bloco inteiro — nunca preencha com um valor parecido, plausível ou de outro estabelecimento. Faltar um dado é defeito pequeno; publicar o endereço errado do cliente é o maior de todos.',

    '7. TEXTO EM BLOCOS, NUNCA EM PARÁGRAFO. Quebre a informação em linhas curtas com hierarquia visível (manchete, apoio, serviço, CTA). Um bloco corrido de texto longo é defeito de leitura, mesmo quando cada palavra está correta. Nenhuma linha termina com palavra solta e sem sentido, e nenhuma palavra fica órfã numa linha só.',
  ]
}

/**
 * Arte SEM texto continua sem texto — a regra da capa de carrossel.
 *
 * 🔴 O caso real, medido em 01/09/2026: o Ciro mandou melhorar a CAPA do
 * carrossel de quinta (slide 1, duas taças de vinho) e recebeu uma peça
 * completa — manchete "Garanta sua mesa", horário e endereço, todos
 * inventados, porque a arte de origem não tinha texto NENHUM para copiar.
 *
 * A régua por visão não cobre isto: não há o que transcrever. E a regra de
 * omissão também não, porque ela fala do dado que existe e está ilegível —
 * aqui o modelo não estava lendo mal, estava PREENCHENDO um vazio.
 *
 * Capa de carrossel é foto pura por contrato da casa (o serviço recusa copy
 * no slide 1). Melhorar uma capa é ajustar a FOTOGRAFIA e o enquadramento —
 * nunca transformá-la em peça com texto.
 */
function regraDaArteSemTexto(args: RegrasDaMelhoriaArgs): string | null {
  // Só quando a régua rodou e não achou nada: `expectedTexts` vazio sozinho
  // é ambíguo (pode ser arte com texto que ninguém transcreveu ainda).
  if (!args.arteSemTexto) return null
  return [
    'ARTE SEM TEXTO: esta peça NÃO LEVA TEXTO NENHUM, e isso é deliberado.',
    'A arte original não tem uma única palavra — é uma fotografia pura, provavelmente a capa de um carrossel, onde o texto é proibido por contrato desta marca.',
    '⛔ NÃO escreva manchete, apoio, CTA, horário, endereço, telefone nem preço. NÃO acrescente selo, etiqueta, faixa ou qualquer elemento que contenha letra. A logomarca também não entra se ela já não estiver na arte.',
    'O seu trabalho aqui é APENAS a fotografia: enquadramento, e só o que o pedido do cliente autorizar. Uma peça sem texto que volta com texto está errada, por mais bonita que fique.',
  ].join('\n')
}

/**
 * O PAR da licença do ajuste de foto: quando ninguém pediu para mexer na
 * fotografia, ela é INTOCÁVEL — e isso precisa ser dito revogando as licenças
 * pelo nome.
 *
 * 🔴 O defeito que originou esta regra (relatado pelo Ciro em 01/09/2026): ele
 * pediu a melhoria SEM escrever nada e o modelo trocou o tratamento da imagem
 * de fundo. Não foi acaso — está escrito no prompt. Com o pedido vazio, a
 * seção `[PEDIDO DO CLIENTE]` deixa de existir e as instruções mais
 * específicas sobre a foto passam a ser duas da direção de arte:
 *
 *   [TRATAMENTO DA FOTOGRAFIA] "Priorize texturas bem definidas, contraste
 *   elegante, iluminação quente, profundidade de campo, fundo suavemente
 *   desfocado e acabamento cinematográfico."
 *   [ILUMINAÇÃO] "Priorize iluminação quente, natural e cinematográfica."
 *
 * São ordens de REPROCESSAR a imagem, e o modelo as cumpre. É a mesma brecha
 * que a trilha `arte` fechou em 17/08/2026, quando a licença de "ajuste global
 * MUITO sutil de contraste, exposição e nitidez" foi retirada do bloco de
 * fidelidade por ser justamente o que o modelo esticava. A melhoria nunca
 * recebeu aquele conserto.
 *
 * A trava é o par exato da regra 8: uma revoga a proibição de encurtar quando
 * o cliente pede; esta revoga a licença de retocar quando ele NÃO pede.
 */
function regraDeFidelidadeDaFoto(args: RegrasDaMelhoriaArgs): string | null {
  if (args.instrucaoImagem?.trim()) return null
  return [
    '9. A FOTOGRAFIA É INTOCÁVEL NESTA PEÇA, E ESTA REGRA REVOGA AS LICENÇAS DE TRATAMENTO ACIMA.',
    'Ninguém pediu para mexer na imagem. Onde as diretrizes falam em buscar aparência profissional, priorizar textura, contraste, profundidade de campo, fundo desfocado, acabamento cinematográfico ou iluminação quente — nada disso vale aqui: são descrições do que a foto JÁ é, nunca ordens de refazê-la.',
    '⛔ Não relumie, não recolora, não mude o contraste, a saturação ou a nitidez, não desfoque o fundo, não troque o enquadramento e não substitua a imagem. A foto sai do jeito que entrou, pixel por pixel, e o seu trabalho é APENAS a camada gráfica por cima dela.',
    'Se para a sua composição ficar melhor a foto precisasse mudar, a resposta é mudar a composição.',
  ].join('\n')
}

/**
 * A licença de encurtar — só quando ninguém aprovou aquela copy no Studio E o
 * pedido pede. Ver `PEDE_MENOS_TEXTO`.
 *
 * 🔴 A regra PRECISA se declarar vencedora, nominalmente. `[LIMITES
 * ABSOLUTOS]` proíbe encurtar "NENHUMA palavra" e `[PEDIDO DO CLIENTE]`
 * declara que o pedido nunca vence os limites de palavras — sem revogar as
 * duas por escrito, esta seção seria a terceira voz de uma contradição, e a
 * lei da casa (medida três vezes em 16-17/08 na caixa das letras) é que a
 * instrução que não se declara vencedora perde para a mais enfática.
 */
function regraDeEnxugar(args: RegrasDaMelhoriaArgs): string | null {
  if (args.expectedTexts.length > 0) return null
  if (!pedeMenosTexto(args.userRequest)) return null
  return [
    '8. ENXUGAR O TEXTO ESTÁ AUTORIZADO NESTA PEÇA, E ESTA REGRA REVOGA A PROIBIÇÃO DE ENCURTAR.',
    'Onde as diretrizes acima dizem que nenhuma palavra pode ser encurtada e que o pedido do cliente nunca vence os limites de palavras, esta peça é a exceção: o cliente pediu menos texto e esta arte não tem copy aprovada a preservar.',
    'Corte o que for descrição desnecessária e mantenha o que gera desejo, a informação de serviço e o CTA. Não invente informação nova, não altere preço, horário, endereço nem nome de prato, e não traduza nada — CORTAR é permitido, CRIAR não.',
  ].join('\n')
}

/**
 * O bloco inteiro, pronto para virar seção do prompt. Sempre existe: as regras
 * de composição não dependem de nada do runtime.
 */
export function regrasDaCasaNaMelhoria(args: RegrasDaMelhoriaArgs): string {
  const linhas = [
    '[REGRAS DA CASA — valem para esta peça e vencem a leitura que você fizer da arte original]',
    instrucaoDeServicoNaMelhoria(args.expectedTexts),
    ...regrasDeComposicao(),
  ]
  const enxugar = regraDeEnxugar(args)
  if (enxugar) linhas.push(enxugar)
  // Antes da fidelidade da foto: as duas falam do fim do prompt, e "não
  // escreva nada" precisa ser lida junto com "não mexa na foto".
  const semTexto = regraDaArteSemTexto(args)
  if (semTexto) linhas.push(semTexto)
  // Por ÚLTIMO de propósito: é a palavra final sobre a fotografia, e a lei da
  // casa é que a instrução mais próxima do fim tem mais peso.
  const fidelidade = regraDeFidelidadeDaFoto(args)
  if (fidelidade) linhas.push(fidelidade)
  return linhas.join('\n\n')
}
