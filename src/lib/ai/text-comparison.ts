/**
 * Comparação de texto — as regras que decidem se dois textos são "o mesmo".
 *
 * Extraído de `creative-text-verification.ts` (que importa Prisma e o SDK de
 * IA) para poder ser usado por módulos PUROS: o diff de copy do aprendizado
 * precisa da mesma noção de "mudou de verdade × só mudou a diagramação", e
 * `@/lib/db` **lança no import** quando `DATABASE_URL` não está no ambiente.
 *
 * Continua re-exportado de `creative-text-verification.ts` — nenhum chamador
 * existente muda.
 */
/**
 * Normalização de comparação: uppercase, sem acento, espaços colapsados,
 * aspas/traços tipográficos reduzidos ao ASCII. Pontuação é MANTIDA — preço
 * ("R$ 49,90") é exatamente o caso que não pode passar com vírgula perdida.
 */
export function normalizeForComparison(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    // Separador de lista vira ESPAÇO, não ponto.
    //
    // Ele não é conteúdo: é diagramação. E o modelo escolhe como diagramar —
    // "R$ 89,00 por pessoa · Das 10h às 15h" ele pode desenhar com o ponto
    // médio, com barra, ou simplesmente QUEBRANDO A LINHA. Mapeando para ponto,
    // o esperado virava "…PESSOA.DAS 10H…" (a regra abaixo cola a pontuação nos
    // vizinhos) e a arte com quebra de linha virava "…PESSOA DAS 10H…": nunca
    // casavam. Reprovou duas artes boas do Espeto em 10/08 por causa de um
    // caractere de separação.
    //
    // Como espaço, as três formas convergem. Preço e hora seguem protegidos —
    // a vírgula de "R$ 49,90" e os dígitos não são tocados.
    .replace(/[•∙●・·|]/g, ' ')
    // A visão também espalha espaços em volta da pontuação ("VITÓRIA - ES",
    // "CANTO , VITÓRIA"). Colar a pontuação nos vizinhos normaliza os DOIS
    // lados da comparação sem tocar na pontuação em si.
    .replace(/\s*([.,;:!?\-])\s*/g, '$1')
    // "R$ 9,90" e "R$9,90" são o MESMO preço — o espaço após o símbolo é
    // tipografia, e o modelo usa a forma correta (com espaço) mesmo quando a
    // copy veio sem. Em 10/08/2026 isso reprovou uma arte do Espeto duas
    // vezes: todos os blocos batiam, só o espaço do "R$ 9,90" divergia.
    // O VALOR continua protegido: vírgula ou dígito trocado ainda reprova.
    .replace(/R\$\s+/gi, 'R$')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * Comprimento mínimo (já normalizado) de uma frase do modelo para valer alarme.
 *
 * "O QUINTAL" tem 9 e é a assinatura da marca — aparece em toda peça, por
 * desenho. "CHEGA MAIS" tem 10 e é CTA de casa. Abaixo de 12 o casamento é
 * coincidência, e alarme por coincidência é o caminho mais curto para ninguém
 * mais ler o alerta — a lição que derrubou a revisão visual em 10/08/2026.
 */
const MINIMO_PARA_ALARME = 12

/**
 * Frases da arte de REFERÊNCIA que reapareceram na peça nova sem estar na copy.
 *
 * 🔴 O irmão de `numerosSemLastro`, para PALAVRA. Os números foram o sintoma
 * pelo qual o defeito de 17/08/2026 ficou registrado ("11, 00, 1158" em 3 das
 * 5 peças do O Quintal), mas o que o cliente viu foi a frase inteira: o
 * "Funcionamento - 11h às 00h" e o "R. Aleixo Netto, 1158" da arte de
 * referência, letrados numa peça que não os pedia. A causa foi consertada em
 * `descricaoDoGuia` (as palavras do modelo não vão mais ao prompt); isto aqui é
 * a rede embaixo — o modelo ENXERGA a arte de referência, e enxergar já bastou
 * uma vez para ele copiar.
 *
 * ⚠️ AVISO, nunca reprovação — mesma regra do alerta de números. Repetição
 * legítima existe: a copy desta peça pode pedir o mesmo horário do post antigo,
 * e aí há lastro e nada é dito.
 *
 * O casamento é por FRASE inteira, nunca por palavra solta: "hoje" e "das"
 * aparecem em toda copy.
 */
export function textosVazadosDoModelo(
  extracted: string[],
  expectedTexts: string[],
  textosDoModelo: string[],
  /**
   * Nome da marca, para NÃO acusar a assinatura.
   *
   * 🔴 Sem isto o alerta viraria ruído de rodapé: toda peça leva a marca, a
   * visão transcreve o wordmark da logo como texto, e o decodificador lê o nome
   * como um nível do modelo — então "O Quintal Parrilla Bar" casaria em quase
   * toda geração. Alarme que toca sempre é alarme que ninguém lê, que é como
   * a revisão visual morreu em 10/08/2026.
   */
  nomeDaMarca?: string | null,
): string[] {
  const copy = normalizeForComparison(expectedTexts.join('\n'))
  const arte = normalizeForComparison(extracted.join('\n'))
  const marca = nomeDaMarca ? normalizeForComparison(nomeDaMarca) : ''
  /** Sobra da frase depois de tirar o nome da marca: só isso é conteúdo. */
  const semAMarca = (frase: string) => (marca ? frase.replace(marca, ' ').replace(/\s+/g, ' ').trim() : frase)
  const vazados: string[] = []
  for (const bruto of textosDoModelo) {
    const alvo = normalizeForComparison(bruto)
    if (alvo.length < MINIMO_PARA_ALARME) continue
    // "O QUINTAL PARRILLA BAR" menos "O QUINTAL PARRILLA" sobra "BAR": é a
    // assinatura, não um dado do post antigo.
    if (semAMarca(alvo).length < MINIMO_PARA_ALARME) continue
    if (!arte.includes(alvo)) continue
    if (copy.includes(alvo)) continue
    const limpo = bruto.trim()
    if (!vazados.includes(limpo)) vazados.push(limpo)
  }
  return vazados
}

/**
 * Um bloco de texto "parece DADO" — horário, endereço, preço, telefone, cidade.
 *
 * É o que separa o texto a mais que o cliente reprova (endereço de outro
 * estado, contagem de avaliação) do texto a mais decorativo (um "Vem" solto,
 * um CTA repetido). Regex e não modelo, de propósito: o alerta precisa ser
 * previsível e barato, e falso positivo aqui só custa uma leitura a mais.
 */
export function pareceDado(bloco: string): boolean {
  const t = bloco.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/\d/.test(t)) return true
  if (/\b(rua|r\.|av\.|avenida|alameda|travessa|rodovia|estrada|praca|praça|shopping)\b/.test(t)) return true
  if (/\b(telefone|whatsapp|zap|reservas?)\b/.test(t)) return true
  if (/[-,]\s*(es|mg|rj|sp|pr|sc|rs|ba|pe|ce|df|go|mt|ms|pa|am|ma|pb|rn|al|se|pi|to|ro|rr|ac|ap)\b/.test(t)) return true
  if (/\b(belo horizonte|sao paulo|são paulo|rio de janeiro|curitiba|porto alegre|salvador|recife|fortaleza|brasilia|brasília|savassi|vitoria|vitória)\b/.test(t)) return true
  return false
}

export interface BlocosAMais {
  /** Bloco a mais que carrega dado (endereço, hora, preço, cidade). O alerta vermelho. */
  comDado: string[]
  /** Bloco a mais sem dado (palavra decorativa, CTA extra). Aviso discreto. */
  semDado: string[]
}

/**
 * Blocos transcritos da arte GERADA que não estão na régua.
 *
 * 🔴 A metade que faltava da conferência. `passed` confere se o esperado
 * ESTÁ; isto confere o que SOBRA. Medido em 01/09/2026 no happy hour do
 * Quintal: régua de 6 blocos, `textCheck: passed`, e a arte saiu com "Rua
 * Fernandes Tourinho, 133 · Savassi, Belo Horizonte" — para um cliente de
 * Vitória. A conferência pegou o que faltava (na 1ª tentativa) e deixou passar
 * o que sobrava (na 2ª).
 *
 * ⚠️ AVISO, nunca reprovação — decisão do Ciro em 01/09/2026 ("texto a mais
 * com dado inventado só avisa"), coerente com o desfazimento da escada
 * automática de 12/08. O que muda é a cor do aviso: com dado é vermelho.
 *
 * Um bloco só é "a mais" quando não está contido em NENHUM esperado nem
 * contém um deles (a visão quebra e junta blocos à vontade: "Ter a Sex, das
 * 16h às 19h" pode voltar como duas linhas). O nome da marca é descontado
 * (a visão transcreve o wordmark da logo) e fragmentos curtos são ignorados —
 * abaixo de 4 caracteres é ruído de transcrição.
 */
export function blocosAMais(
  extracted: string[],
  expectedTexts: string[],
  nomeDaMarca?: string | null,
): BlocosAMais {
  const esperados = expectedTexts.map(normalizeForComparison).filter((e) => e.length > 0)
  const marca = nomeDaMarca ? normalizeForComparison(nomeDaMarca) : ''
  const comDado: string[] = []
  const semDado: string[] = []
  for (const bruto of extracted) {
    let alvo = normalizeForComparison(bruto)
    if (marca) alvo = alvo.replace(marca, ' ').replace(/\s+/g, ' ').trim()
    // Sobrou só "PARRILLA BAR" da assinatura, ou um fragmento: não é bloco.
    if (alvo.length < 4) continue
    // A assinatura vem quebrada ("O QUINTAL" / "PARRILLA BAR"): um bloco cujas
    // palavras são todas da marca (ou genérico de casa, como BAR) é a logo
    // transcrita, não texto a mais.
    if (marca) {
      const daMarca = new Set([...marca.split(' '), 'BAR', 'RESTAURANTE', 'BISTRO', 'GELATERIA', 'STEAKHOUSE', 'BOTEQUIM', 'PIZZARIA', 'CAFE', 'GRILL'])
      const palavras = alvo.split(' ').filter((p) => p.length >= 3)
      if (palavras.length > 0 && palavras.every((p) => daMarca.has(p))) continue
    }
    const coberto = esperados.some((e) => e.includes(alvo) || alvo.includes(e))
    if (coberto) continue
    // Pedaco de um esperado que a visao quebrou em duas linhas: cada metade
    // esta contida no esperado e nao e "a mais".
    const pedaco = esperados.some((e) => alvo.split(' ').every((palavra) => palavra.length < 3 || e.includes(palavra)))
    if (pedaco) continue
    const limpo = bruto.replace(/\s+/g, ' ').trim()
    if (pareceDado(limpo)) {
      if (!comDado.includes(limpo)) comDado.push(limpo)
    } else if (!semDado.includes(limpo)) semDado.push(limpo)
  }
  return { comDado, semDado }
}

/**
 * Desconta dos blocos "a mais" o que JÁ ESTAVA na arte de origem.
 *
 * 🔴 Medido na bancada da carteira (02/09/2026): a peça do Lagosta Criativa
 * traz um print de cardápio dentro de um mockup de celular, e a régua tem só
 * os 2 blocos da copy — "R$ 39,00 | R$ 43,00 | R$ 46,00" saíram como texto a
 * mais com dado nas 2 rodadas. Não era invenção: o print está na origem. O
 * que a melhoria acrescentou é o que não está na régua NEM na origem; o que
 * está na origem e não na régua é régua incompleta, que é outro assunto.
 */
export function descontarTextosDaOrigem(blocos: BlocosAMais, textosDaOrigem: string[]): BlocosAMais {
  if (textosDaOrigem.length === 0) return blocos
  const origem = normalizeForComparison(textosDaOrigem.join('\n'))
  // Sem a pontuação colada ("WHATSAPP." ≠ "WHATSAPP"): a normalização cola o
  // ponto na palavra vizinha, e a origem pode continuar a frase.
  const palavrasDe = (t: string) => t.split(' ').map((p) => p.replace(/[.,;:!?]+$/, '')).filter((p) => p.length >= 3)
  const palavrasDaOrigem = new Set(palavrasDe(origem))
  const jaEstava = (bloco: string) => {
    const alvo = normalizeForComparison(bloco)
    if (origem.includes(alvo)) return true
    // A visão quebra e junta blocos à vontade ("9 itens" pode voltar colado
    // ao título): vale se TODAS as palavras do bloco estão na origem.
    const palavras = palavrasDe(alvo)
    return palavras.length > 0 && palavras.every((p) => palavrasDaOrigem.has(p))
  }
  return {
    comDado: blocos.comDado.filter((b) => !jaEstava(b)),
    semDado: blocos.semDado.filter((b) => !jaEstava(b)),
  }
}
