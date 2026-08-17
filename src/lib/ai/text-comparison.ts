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
