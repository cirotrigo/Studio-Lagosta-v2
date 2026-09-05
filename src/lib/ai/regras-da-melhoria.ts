/**
 * REGRAS DA CASA NA MELHORIA — o que a arte pronta ainda precisa respeitar.
 *
 * ⚠️ ESTE MÓDULO PRESERVA, NÃO PRESCREVE (decisão do Ciro, 04/09/2026).
 *
 * Ele nasceu em 01/09 fazendo o oposto: mandava onde cada tipo de bloco tinha
 * de pousar ("serviço vai para o rodapé"), obrigava a destacar palavra-chave e
 * a quebrar o texto em blocos. Era o corpo de regras da GERAÇÃO portado para
 * cá — e ali elas fazem sentido, porque lá a peça nasce do zero e alguém tem
 * de decidir o layout. Aqui a peça JÁ ESTÁ DIAGRAMADA por quem cuida da marca.
 *
 * 🔴 O DEFEITO QUE INVERTEU O DESENHO, medido em 04/09/2026 na Wine Vix. A
 * arte era uma AGENDA de feriado: 13 blocos, dos quais 6 são "Funcionamento -
 * 10h às 22h" / "Happy Hour - 16h às 19h", um par por dia da semana.
 * `blocosDeServico` classificou os 6 como serviço — corretamente, pela regra
 * que ele foi escrito — e a regra 1 então mandava, com todas as letras,
 * "MOVA para o rodapé: isto é uma correção, não uma opção" e "ele sai da
 * sequência de cima". Isso desmonta a peça: os dias (Sexta-feira, Sábado,
 * Domingo e Segunda, Terça-feira) existem só para rotular aqueles horários, e
 * `[TEXTO EXATO]` manda reproduzir os 13 na ordem. Duas ordens incompatíveis,
 * e o gpt-image cumpriu AS DUAS — manteve a lista por dia E criou o rodapé,
 * que saiu sendo a programação inteira repetida. Nas duas rodadas. Uma delas
 * com o pedido "Não inclua textos extras" escrito pela Roberta.
 *
 * A regra tinha sido calibrada (17/08, 01/09) para o caso de UMA linha de
 * horário perdida perto da manchete. Ela não tinha guarda para "a peça inteira
 * É uma agenda" — e não adianta criar essa guarda: a variação é grande demais.
 * Há arte com serviço e sem serviço, comunicado que foge até do DNA, peça com
 * um título e mais nada. Qualquer regra que decida layout por conta própria
 * vai estar errada em alguma dessas.
 *
 * O DESENHO DE HOJE, em duas metades:
 *
 *  - **Sem pedido, o modelo só REDIAGRAMA**: reposiciona o conjunto do texto
 *    em relação à fotografia, arruma respiro, alinhamento e leitura. O
 *    conteúdo, a ordem, os agrupamentos, as cores, as fontes e a foto ficam
 *    como estão.
 *  - **Com pedido, manda o pedido.** Quem precisa de outra coisa — mandar o
 *    horário para o rodapé, destacar uma palavra, trocar um alinhamento —
 *    pede, e `[PEDIDO DO CLIENTE]` vence estas regras nominalmente.
 *
 * O CUSTO DO DESENHO ANTIGO, medido nos pedidos reais da Roberta (74
 * melhorias, 01/08 a 04/09): **36 deles (49%) eram, também, uma proibição** —
 * ela desligando na mão o que o sistema ligava sozinho. "Não inclua ícones"
 * apareceu **34 vezes**; "não mude as fontes", 11; "não mude o tamanho", 5;
 * "não mude as cores", 4; "não mude o alinhamento", 3. O único ponto do prompt
 * que autorizava ícone era a regra de serviço, e ela era injetada por padrão.
 *
 * O que NÃO mudou, porque nasceu de defeito medido e é preservação, não
 * prescrição: a foto intocável sem pedido, a proibição de inventar dado, a
 * contagem de blocos, a arte sem texto, o halo em vez de véu e a margem.
 *
 * Injetado pelo SISTEMA, fora do bloco editável (`DEFAULT_ART_DIRECTION` /
 * `Project.artImprovementPrompt`) — mesmo precedente da identidade da marca:
 * um prompt de projeto mal escrito não pode apagar as regras da casa.
 *
 * Módulo PURO (só `blocos-de-servico`, que também é puro): a prévia da aba
 * Marca é client e importar o SDK da OpenAI arrastaria tudo para o bundle.
 */

import { blocosDeServico, temEndereco } from './blocos-de-servico'

export interface RegrasDaMelhoriaArgs {
  /**
   * Textos que a arte deve reproduzir verbatim. **Vazio é o caso comum** — em
   * 60 das 74 melhorias medidas em 04/09 não havia régua nenhuma (arte vinda
   * do canvas ou de upload, `source: 'arte-enviada'`). Com a lista, a
   * preservação é dita com contagem; sem ela, fica condicional ao que o modelo
   * LÊ na IMAGEM 1 — que é o que torna a regra útil nos dois casos.
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
  /**
   * Fatos do cliente (endereço e horário oficiais, da base de conhecimento),
   * só para CONFERIR. Entram apenas quando a copy já tem endereço — ver
   * `fatosDoClienteNaMelhoria`.
   */
  fatosDoCliente?: string[]
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
 * A regra 1 de hoje: a estrutura da peça é DADA, e o trabalho é rediagramar.
 *
 * Ela substitui `instrucaoDeServicoNaMelhoria` (mantida abaixo, sem uso) e
 * herda o que aquela tinha de preservação — a proibição de criar linha que a
 * copy não tem —, generalizada: não se cria bloco NENHUM, seja ele serviço,
 * selo ou legenda de ícone. Era justamente o prompt FALAR em rodapé de serviço
 * e em endereço que abria o slot que o modelo preenchia com dado inventado
 * (Quintal 01/09: "Rua Fernandes Tourinho, 133 · Savassi"; Wine Vix 04/09:
 * "Dom. Pedro II, 716 | Higienópolis, São José do Rio Preto - SP", num cliente
 * de Vitória). Não dizendo nada sobre rodapé, o slot não existe.
 *
 * 🔴 A distinção que faz a regra funcionar: o CONJUNTO do texto pode mudar de
 * lugar sobre a foto — é a regra 3, e é o próprio serviço que a melhoria
 * presta. O que não muda é a ordem e o agrupamento DENTRO do conjunto. Sem
 * essa distinção escrita, "preserve a estrutura" e "leia a foto e reposicione"
 * viram a mesma contradição que este módulo veio desfazer.
 */
export function instrucaoDeEstrutura(expectedTexts: string[]): string {
  const linhas = [
    '1. A ESTRUTURA DA ARTE É DADA. VOCÊ REDIAGRAMA — NÃO REESCREVE NEM REPROJETA A PEÇA.',
    'Esta arte já foi escrita e organizada por quem cuida da marca. Quais blocos existem, em que ordem se leem, o que está agrupado com o que e qual bloco pesa mais que o outro são decisões TOMADAS, e você as recebe prontas.',
    'MANTENHA: os mesmos blocos, com as mesmas palavras, na mesma ordem de leitura, nos mesmos agrupamentos (o que está junto continua junto, o que está separado continua separado) e com a mesma hierarquia entre eles.',
    '⛔ NÃO mova um bloco para outra zona da peça — não mande nada "para o rodapé", "para o topo" nem "para o canto". NÃO separe o que está junto, não junte o que está separado, não transforme a lista num parágrafo nem o parágrafo numa lista, e não repita nenhum bloco em dois lugares da mesma arte.',
    '⛔ NÃO CRIE NADA: nem linha, nem rodapé, nem faixa de serviço, nem selo, nem etiqueta, nem legenda, nem ícone, nem hashtag, nem arroba. Se a arte não tem horário, endereço, telefone ou preço, a arte nova também não tem.',
    'O QUE VOCÊ MELHORA É OUTRA COISA: onde o conjunto do texto pousa sobre a fotografia, o respiro entre os blocos, o alinhamento, a quebra das linhas e o contraste de leitura. O conjunto inteiro pode mudar de lugar na peça (regra 3) — o que não muda é a ordem e o agrupamento DENTRO dele.',
    /**
     * 🔴 A ARBITRAGEM CONTRA A [IDENTIDADE DA MARCA] — sem ela, esta regra não
     * alcança cliente nenhum.
     *
     * Medido em 04-05/09/2026 numa varredura dos 11 projetos: o `composition` e
     * o `visualStyle` do BrandDNA descrevem layout, e essa prosa é injetada
     * INTEIRA em [IDENTIDADE DA MARCA] a ~22-35% do prompt. Exemplos verbatim do
     * banco de produção: "Endereço e horário, quando entram na arte, vão SEMPRE
     * no rodapé" e "separe o TÍTULO na parte superior" (Real Gelateria); "O
     * rodapé pode apresentar informações de funcionamento com ícones de relógio"
     * e "linha fina com losango central" (Real); "ícone de relógio antes do
     * horário e alfinete de mapa antes do endereço" (Espeto, By Rock, Empório);
     * ornamento e selo em quase todos. A regra 1 os contradiz a ~72-79% — e a
     * lei da casa, medida três vezes em 16-17/08 na caixa das letras, é que a
     * instrução que NÃO se declara vencedora perde para a mais enfática.
     *
     * 🔴 E o pior: a regra ANTIGA tinha esta ressalva ("Onde a identidade da
     * marca fala em 'endereço no rodapé', isso vale para peças que TÊM endereço
     * na copy — esta não tem"), e a reescrita de 04/09 a removeu JUNTO com a
     * autorização de ícone. Ou seja: tirar a licença das regras da casa não
     * bastava, porque para 4 dos 11 clientes ela também vive no DNA. A premissa
     * "o único ponto do prompt que autorizava ícone era a regra de serviço" era
     * FALSA — inclusive para o cliente onde o defeito foi medido.
     *
     * A revogação é ESTREITA de propósito: derruba prescrição de LUGAR e de
     * ORNAMENTO, nunca a paleta nem a tipografia — que é o que faz a peça
     * continuar sendo daquela marca.
     */
    'ESTA REGRA VENCE AS DESCRIÇÕES DE LAYOUT DA [IDENTIDADE DA MARCA] ACIMA. Aquela seção descreve como as peças desta marca COSTUMAM ser montadas — onde o serviço costuma ficar, que ícone ou filete o rodapé costuma ter, onde o título costuma entrar. É o repertório da marca, não uma ordem para ESTA peça: a arte que você recebeu já fez essas escolhas, e elas são as que valem.',
    '⛔ Onde a identidade disser que endereço ou horário vão "sempre no rodapé", que o título vai na parte superior, que o rodapé "pode" ter ícone de relógio, pino de localização, filete, losango, selo, faixa ou ornamento — nada disso vale como ordem aqui. Se a arte original tem esses elementos, mantenha-os exatamente como estão; se não tem, NÃO os crie. O que a identidade continua mandando, e você obedece: a paleta, a tipografia e o jeito da marca se parecer.',
  ]
  linhas.push(
    expectedTexts.length > 0
      ? contagemDeBlocos(expectedTexts)
      : 'CONTAGEM DE BLOCOS: os blocos de texto que você lê na IMAGEM 1 são TODOS os que existem — a arte nova tem exatamente aqueles, nem um a mais. Não corrija, não traduza, não abrevie e não complete nenhuma palavra do que está escrito ali.',
  )
  return linhas.join('\n')
}

/**
 * ⚠️ SEM USO desde 04/09/2026 — a regra que MANDAVA o serviço para o rodapé.
 *
 * Mantida no código e coberta por teste como o caminho de volta, mesmo
 * precedente do spine estrito do modo livre (17/08/2026). Foi ela que produziu
 * o defeito descrito no cabeçalho deste módulo, e o que a substituiu é
 * `instrucaoDeEstrutura`. Voltar a usá-la é trocar uma linha em
 * `regrasDaCasaNaMelhoria` — e reler antes o caso da Wine Vix.
 *
 * 🔴 O que ela tem de bom e NÃO se perdeu: o ramo "esta peça não tem linha de
 * serviço" virou a proibição geral de criar bloco, e o piso de legibilidade do
 * serviço virou desnecessário quando ninguém mais rebaixa o serviço a letra
 * miúda por ordem do prompt.
 */
export function instrucaoDeServicoNaMelhoria(expectedTexts: string[]): string {
  const servico = blocosDeServico(expectedTexts)

  if (expectedTexts.length > 0 && servico.length === 0) {
    return [
      '1. ESTA PEÇA NÃO TEM LINHA DE SERVIÇO.',
      'Nenhum dos blocos de [TEXTO EXATO] é horário de funcionamento ou endereço. Logo a arte NÃO tem rodapé de serviço, e você NÃO deve criar um: não escreva horário, endereço, rua, número, bairro, cidade, telefone nem "reservas", e não desenhe ícone de relógio, pino de localização ou calendário.',
      'Se a arte original mostrar algo assim que não está na lista, é ruído: deixe de fora. Onde a identidade da marca fala em "endereço no rodapé", isso vale para peças que TÊM endereço na copy — esta não tem.',
      contagemDeBlocos(expectedTexts),
    ].join('\n')
  }

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
    ...(expectedTexts.length > 0 ? [contagemDeBlocos(expectedTexts)] : []),
  ].join('\n')
}

/**
 * A contagem de blocos — o fecho da preservação.
 *
 * [TEXTO EXATO] diz o que a arte TEM; isto diz que ela não tem MAIS nada. Sem
 * a segunda metade o modelo completa a peça com o que a identidade da marca
 * sugere (rodapé de serviço, selo, contagem de avaliação), e a conferência de
 * texto — que só olha o que falta — aprova.
 */
export function contagemDeBlocos(expectedTexts: string[]): string {
  const n = expectedTexts.length
  return (
    `CONTAGEM DE BLOCOS: a arte tem exatamente ${n} bloco${n === 1 ? '' : 's'} de texto, os ${n === 1 ? 'listado' : 'listados'} em [TEXTO EXATO]. ` +
    `A arte nova tem os mesmos ${n} — nem um a mais. Não acrescente linha, rodapé, selo, etiqueta, legenda de ícone, hashtag, arroba nem qualquer texto que não esteja na lista. A única exceção é a logomarca, que não conta como bloco.`
  )
}

/**
 * Os fatos do cliente, SÓ para conferir.
 *
 * 🔴 Só quando a régua tem ENDEREÇO — não basta ter horário. Medido em
 * 02/09/2026, no happy hour do Quintal: a régua tinha "Ter a Sex, das 16h às
 * 19h" (serviço de horário), os fatos entraram "só para conferir", e o modelo
 * usou o endereço oficial que estava neles para preencher o rodapé numa peça
 * cuja copy não tem endereço. Certo desta vez, mas a mais, e é o mesmo
 * mecanismo do endereço inventado: dado disponível vira dado desenhado. Os
 * fatos só servem para conferir um endereço que a copy JÁ tem; o horário da
 * copy é a própria régua.
 */
export function fatosDoClienteNaMelhoria(args: RegrasDaMelhoriaArgs): string | null {
  const fatos = (args.fatosDoCliente ?? []).map((f) => f.trim()).filter(Boolean)
  if (fatos.length === 0) return null
  if (!temEndereco(args.expectedTexts)) return null
  return [
    '[FATOS DO CLIENTE — só para conferir, nunca para acrescentar]',
    ...fatos.slice(0, 8).map((f) => `- ${f}`),
    'Estes são o endereço e o horário oficiais. O bloco de serviço da arte é o de [TEXTO EXATO], letra por letra — se ele divergir destes fatos, a copy aprovada vence e você NÃO corrige. Jamais escreva um endereço, bairro, cidade ou horário que não esteja em [TEXTO EXATO].',
  ].join('\n')
}

/**
 * As regras que não dependem da copy.
 *
 * A numeração é contínua com a da estrutura porque no prompt elas formam uma
 * lista só — regra numerada é mais obedecida que parágrafo corrido, que é a
 * forma que o `image-prompt-builder` já usa.
 *
 * 🔴 DUAS REGRAS SAÍRAM EM 04/09/2026, e a razão é a mesma nas duas: elas
 * mandavam REPROJETAR, e quem decide reprojeto é quem pede.
 *
 *  - "DESTAQUE AS PALAVRAS-CHAVE" (peso e cor da marca em toda linha com mais
 *    de três palavras) nasceu de o Ciro pedir destaque em 3 das 7 correções de
 *    01/09. Mas ela obriga a mexer em COR e PESO da tipografia da peça — que é
 *    exatamente o que a Roberta proibia à mão 15 vezes ("não mude as fontes",
 *    11; "não mude as cores", 4). Duas pessoas, dois pedidos opostos, na mesma
 *    regra fixa: é o sinal de que a decisão não é do sistema. Quem quer
 *    destaque pede destaque, e o pedido vence estas regras.
 *  - "TEXTO EM BLOCOS, NUNCA EM PARÁGRAFO" (quebre em linhas curtas com
 *    hierarquia visível) foi absorvida pela regra 1 na forma preservadora: não
 *    transforme a lista num parágrafo — e nem o contrário.
 */
function regrasDeComposicao(): string[] {
  return [
    /**
     * 🔴 DIVERGE DA GERAÇÃO DE PROPÓSITO — e esta é a divergência mais
     * importante do módulo.
     *
     * `regraDeSafeArea` (geração) manda reservar 1/8 da altura no topo e no
     * rodapé do story (~242px em 1936). Portar isso aqui contradiria
     * FRONTALMENTE a correção do Ciro em 01/09: "a margem do topo e do rodapé
     * estão GRANDES, use por padrão 90 pixels". As artes dele vêm do canvas de
     * design, que tem margens próprias e já aprovadas — a melhoria não é quem
     * redefine a margem da marca, é quem a preserva. A safe area continua
     * sendo assunto de quem CRIA a peça.
     */
    '2. MARGEM: preserve a margem da arte original. Não aumente o respiro das bordas, não "centralize melhor" e não recue os blocos para dentro — se a arte já tem uma margem consistente, ela é a margem da marca e permanece exatamente como está. Corrija margem apenas quando um elemento estiver encostado na borda ou visivelmente desalinhado dos demais.',

    /**
     * O feedback que originou esta regra é de diagnóstico, não de gosto:
     * "você errou na leitura da imagem para definir a área livre, que nesse
     * caso o texto fica melhor no rodapé e não o topo". Ela É o trabalho da
     * melhoria quando ninguém pede nada — e por isso ficou logo depois da
     * regra 1, que diz o que NÃO muda.
     */
    '3. LEIA A FOTO ANTES DE POSICIONAR O TEXTO. Identifique o assunto principal (o prato, a bebida, a pessoa, o produto) e onde a imagem é calma — desfocada, escura, lisa, sem informação. O conjunto do texto vai na área calma, mesmo que isso signifique mudá-lo de lugar em relação à arte original: se o assunto está no topo, o texto desce; se está embaixo, o texto sobe. Nunca deixe texto sobre o assunto só porque a arte original o deixava ali. Nenhuma parte do assunto pode ser coberta. Este é o principal serviço que você presta a esta peça.',

    // Portado da regra 4b do image-prompt-builder (17/08/2026), que nasceu do
    // véu virando escurecimento GLOBAL nas peças do O Quintal. O Ciro reprovou
    // o mesmo defeito na melhoria em 01/09: "aqui o véu ficou muito marcado".
    // 🔴 A última frase entrou em 04/09: na agenda da Wine Vix, cujo texto
    // ocupa ~80% da altura, "halo local de no máximo 1/3" é impossível de
    // cumprir — e o modelo resolveu escurecendo a foto INTEIRA, de luz média
    // 100,8 para 55,1 e 47,8 nas duas rodadas. Peça cheia de texto precisa da
    // saída dita por escrito, senão ela vira véu.
    '4. HALO DE LEITURA, NÃO VÉU: quando o texto precisar de contraste, use uma mancha escura DESFOCADA só atrás do bloco de texto, sem borda visível, que desmancha para a foto em volta — nunca um gradiente de faixa de borda a borda, nunca uma tarja, nunca o topo ou o rodapé inteiros escurecidos. A foto continua nítida e tão clara quanto a original POR BAIXO do halo. ⛔ Nunca escureça a foto inteira nem baixe o brilho geral da cena para destacar texto. Se a peça tiver muito texto e o halo não couber, a resposta NÃO é escurecer tudo: escolha a região mais calma da foto, e mantenha o resto da imagem com o brilho original.',

    /**
     * 🔴 Medido em 01/09/2026, com o prompt já consertado da foto: as TRÊS
     * rodadas inventaram horário E endereço — "Foz do Iguaçu, PR", "São José
     * dos Pinhais", "Jaraguá do Sul, SC" — para um cliente de Vitória. O
     * modelo lê o serviço da imagem, não entende um pedaço, e COMPLETA com o
     * que parece plausível. Nada no prompt dizia o que fazer nesse caso.
     * Repetiu-se em 04/09 na Wine Vix, com "São José do Rio Preto - SP".
     */
    '5. NÃO INVENTE DADO QUE VOCÊ NÃO CONSEGUE LER. Horário, endereço, telefone, preço e nome de prato são fatos do cliente: ou você os reproduz exatamente como estão na arte, ou os DEIXA DE FORA. Se um trecho estiver ilegível, cortado ou você tiver qualquer dúvida sobre o que está escrito, OMITA o bloco inteiro — nunca preencha com um valor parecido, plausível ou de outro estabelecimento. Faltar um dado é defeito pequeno; publicar o endereço errado do cliente é o maior de todos.',
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
 * de fundo. Não foi acaso — está escrito no prompt: com o pedido vazio, as
 * instruções mais específicas sobre a foto passam a ser as da direção de arte
 * ("priorize contraste, profundidade de campo, fundo suavemente desfocado",
 * "priorize iluminação quente"), que são ordens de REPROCESSAR a imagem.
 *
 * É a mesma brecha que a trilha `arte` fechou em 17/08/2026, quando a licença
 * de "ajuste global MUITO sutil de contraste, exposição e nitidez" foi
 * retirada do bloco de fidelidade por ser justamente o que o modelo esticava.
 */
function regraDeFidelidadeDaFoto(args: RegrasDaMelhoriaArgs): string | null {
  if (args.instrucaoImagem?.trim()) return null
  return [
    '7. A FOTOGRAFIA É INTOCÁVEL NESTA PEÇA, E ESTA REGRA REVOGA AS LICENÇAS DE TRATAMENTO ACIMA.',
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
    '6. ENXUGAR O TEXTO ESTÁ AUTORIZADO NESTA PEÇA, E ESTA REGRA REVOGA A PROIBIÇÃO DE ENCURTAR.',
    'Onde as diretrizes acima dizem que nenhuma palavra pode ser encurtada e que o pedido do cliente nunca vence os limites de palavras, esta peça é a exceção: o cliente pediu menos texto e esta arte não tem copy aprovada a preservar.',
    'Corte o que for descrição desnecessária e mantenha o que gera desejo, a informação de serviço e o CTA. Não invente informação nova, não altere preço, horário, endereço nem nome de prato, e não traduza nada — CORTAR é permitido, CRIAR não.',
  ].join('\n')
}

/**
 * A cláusula que devolve o poder a quem está pedindo (04/09/2026).
 *
 * As regras acima são o comportamento PADRÃO — o que fazer quando ninguém
 * disse nada. Elas não podem virar a camisa de força que a Roberta passou um
 * mês desabotoando à mão: 36 dos 74 pedidos dela eram, também, uma proibição.
 *
 * 🔴 Precisa se declarar vencedora NOMINALMENTE, e listar o que ela NÃO
 * revoga. `[PEDIDO DO CLIENTE]` já diz que o pedido vence "as diretrizes de
 * diagramação acima" — mas as regras da casa se apresentam como REGRAS, com
 * "⛔" e "isto é uma correção, não uma opção", e a lei da casa (medida três
 * vezes em 16-17/08) é que a instrução mais enfática vence. Sem esta cláusula,
 * "passe o horário para o rodapé" perderia para o "⛔ não mova um bloco" da
 * regra 1 — trocando uma rigidez por outra.
 */
function regraDoPedidoVence(args: RegrasDaMelhoriaArgs): string | null {
  if (!args.userRequest.trim()) return null
  return [
    'O PEDIDO DO CLIENTE VENCE ESTAS REGRAS.',
    'As regras acima descrevem o que fazer quando ninguém pede nada. Há um [PEDIDO DO CLIENTE] nesta peça: NAQUILO QUE ELE PEDIR, faça o que ele mandou e por inteiro — se ele pedir para mover um bloco, mova; para destacar uma palavra, destaque; para trocar um alinhamento, uma cor ou um tamanho, troque; para acrescentar ou tirar um elemento, faça.',
    /**
     * 🔴 A licença precisa ser ESTREITA — medido em 04/09/2026, na agenda da
     * Wine Vix, com o pedido REAL da Roberta ("não inclua ícones. Não inclua
     * textos extras"), que é só uma proibição e não pede mudança nenhuma. A
     * primeira redação abria com "as regras 1 a 4 acima descrevem o que fazer
     * quando ninguém pede nada", e o modelo lia isso como "há um pedido, logo
     * as regras 1 a 4 não valem" — inclusive o "não repita nenhum bloco". Numa
     * leva de 2 rodadas o rodapé duplicado voltou nas DUAS (8 e 7 blocos
     * repetidos), pior que o prompt antigo na mesma leva.
     *
     * Pedido que só PROÍBE não revoga nada: ele estreita as regras, não as
     * afrouxa. É o formato de metade do que a equipe escreve.
     */
    'NO QUE O PEDIDO NÃO MENCIONAR, AS REGRAS ACIMA VALEM INTEIRAS. Um pedido que apenas PROÍBE algo ("não inclua ícones", "não mude as fontes") não revoga nada: ele acrescenta uma restrição às regras acima, que continuam de pé por completo.',
    /**
     * 🔴 MOVER É MOVER, e isto precisa ser dito ao lado da licença.
     *
     * Medido em 04/09/2026 na própria agenda da Wine Vix, já com as regras
     * novas: ao pedido "passe o horário e o happy hour de cada dia para um
     * rodapé agrupado", o gpt-image montou o rodapé pedido — E manteve a lista
     * de cima. Onze blocos repetidos. A cláusula, larga demais, revogava a
     * regra 1 INTEIRA, inclusive o "não repita nenhum bloco em dois lugares";
     * e `[TEXTO EXATO]` manda reproduzir cada bloco sem dizer quantas vezes,
     * então nada sobrava proibindo a cópia.
     *
     * É a mesma lição de 17/08/2026 na geração, com outra roupa: "dizer ONDE
     * eles vão não basta, é preciso dizer de onde eles SAEM".
     */
    'MOVER É MOVER, NUNCA COPIAR: se o pedido manda levar um bloco para outro lugar, ele SAI de onde estava. Cada bloco de texto aparece UMA ÚNICA VEZ na peça — esta parte da regra 1 o pedido não revoga, porque ninguém pede a mesma informação duas vezes na mesma arte.',
    'E o pedido também NÃO revoga, porque não são diagramação: inventar dado que você não consegue ler (regra 5) e mexer na fotografia sem autorização (regra 7). Para a foto existe um campo próprio, e ele aparece como [AJUSTE NA FOTO] quando é usado.',
  ].join('\n')
}

/**
 * O bloco inteiro, pronto para virar seção do prompt. Sempre existe: as regras
 * de composição não dependem de nada do runtime.
 */
export function regrasDaCasaNaMelhoria(args: RegrasDaMelhoriaArgs): string {
  const linhas = [
    '[REGRAS DA CASA — o padrão desta peça quando ninguém pede outra coisa]',
    instrucaoDeEstrutura(args.expectedTexts),
    ...regrasDeComposicao(),
  ]
  const fatos = fatosDoClienteNaMelhoria(args)
  if (fatos) linhas.push(fatos)
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
  // Depois da fidelidade, porque ela precisa dizer que NÃO revoga a foto.
  const pedidoVence = regraDoPedidoVence(args)
  if (pedidoVence) linhas.push(pedidoVence)
  return linhas.join('\n\n')
}
