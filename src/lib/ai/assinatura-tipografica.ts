/**
 * ASSINATURA TIPOGRÁFICA por projeto — como o texto daquela casa se veste,
 * destilado das artes PUBLICADAS e aprovadas.
 *
 * Nasceu do acordo Ciro+Roberta sobre o TERO (17/08/2026): o modelo-livre
 * fica, mas "seria bom um pouco mais de semelhança ao template escolhido…
 * as artes precisam ser mais delicadas e sofisticadas; a queixa é que o
 * título sai muito grande". A resposta não é voltar ao layout travado — é
 * dar ao gerador a ASSINATURA da marca: o jeito do texto, não o lugar dele.
 *
 * A fonte da verdade são as 24 artes publicadas do TERO na galeria do
 * Claudinho (analisadas em 17/08/2026, uma a uma): manchete serifada PEQUENA
 * em caixa alta com tracking largo, lockup de duas vozes (cobre + branco),
 * palavra-chave do apoio em cobre, losango como separador, serviço miúdo e
 * espaçado no rodapé. 23 das 24 seguem o sistema à risca.
 *
 * REGRAS DE ESCRITA deste bloco (aprendidas a caro na mesma semana):
 * - Nenhuma palavra de EXEMPLO desenhável entre aspas — string literal no
 *   prompt vira texto letrado na arte (lei medida três vezes).
 * - Números e frações verificáveis ("~5% da altura"), nunca adjetivo solto.
 * - O bloco fala do TEXTO, nunca de POSIÇÃO — posição é do modo livre.
 *
 * Módulo PURO (sem Prisma), mesmo precedente de `caixa-da-copy.ts` e
 * `modelo-livre.ts`. Projeto sem assinatura cadastrada segue como antes.
 */

const TERO = [
  '[ASSINATURA TIPOGRÁFICA DA MARCA — o jeito desta casa vestir o texto]',
  'Destilada das artes publicadas e aprovadas desta marca. Ela descreve COMO o texto se veste; ONDE ele pousa continua sendo decisão sua, lendo a foto.',
  /**
   * 🔴 A HISTÓRIA DO ESPAÇAMENTO, para ninguém reintroduzi-lo:
   * v1 pediu "tracking largo, generoso" → o modelo levou ao extremo (22:17,
   * "exagerou muito"). v2 deu o número "~1/5 do corpo, nunca mais" → nem
   * chegou a rodar, mas o diagnóstico do Ciro na leva seguinte enterrou a
   * abordagem: "não tem consistência — uma arte com um espaçamento, outra com
   * outro; deve ser padrão para todos os títulos". Tracking por instrução é
   * LOTERIA: o modelo não mede fração de corpo, e cada rodada interpreta
   * diferente. O único espaçamento que sai IGUAL em toda rodada é o natural
   * da fonte — então o pedido positivo sumiu e ficou só a trava.
   */
  '1. MANCHETE PEQUENA: serifada elegante da identidade, em CAIXA ALTA, no espaçamento NATURAL da própria fonte — ⛔ não aumente o espaço entre letras: título espaçado à mão sai diferente a cada peça e quebra o padrão da marca. Cada linha ocupa ~3,5 a 5% da altura do quadro e o lockup inteiro fica em ~10% no máximo. A sofisticação vem do corpo PEQUENO, nunca do tamanho nem do peso — manchete grande ou em negrito pesado quebra a marca.',
  '2. DUAS VOZES: com duas linhas de manchete, uma sai no tom cobre/terracota da paleta e a outra em branco — a alternância de cor É o destaque, no lugar de aumentar o corpo.',
  '3. APOIO LEVE: sans-serif fina, em caixa alta pequena ou em frase normal, sempre curto. UMA ou duas palavras-chave do apoio ganham o cobre (ou um peso a mais); todo o resto fica branco e leve.',
  '4. SERVIÇO MIÚDO: horário e endereço em sans muito pequena, em caixa alta, com o dado (horas, número) num peso levemente maior que o rótulo. Ícones finos de relógio e de localização quando houver horário e endereço.',
  // O losango existe nas artes publicadas, mas o gpt-image o solta ÓRFÃO no
  // quadro (17/08, 22:21). Decisão do Ciro: "pode manter o separador somente
  // com uma linha sem losango". Simplificar é o freio.
  // "Está abusando dos separadores" (22:30): além do losango órfão, saíam
  // VÁRIAS linhas na mesma peça. Um por peça, e só quando fizer falta.
  '5. O SEPARADOR é uma LINHA FINA em cobre, curta e horizontal — só isso, e NO MÁXIMO UMA por peça (nenhuma quando a hierarquia já separa sozinha). ⛔ Nenhum losango, ponto, símbolo ou ícone solto no quadro: ornamento sem texto colado a ele não existe nesta marca. Ícone fino de relógio ou de localização só IMEDIATAMENTE ao lado da própria linha de serviço.',
  '6. DUAS CORES DE TEXTO no máximo: branco e o cobre/terracota da paleta. O cobre é acento — uma linha da manchete, a palavra-chave do apoio, a linha separadora — nunca o corpo inteiro da peça.',
].join('\n')

/** A assinatura cadastrada do projeto, ou null (a maioria não tem — ainda). */
const ASSINATURA_POR_PROJETO = new Map<number, string>([[3, TERO]])

export function assinaturaTipografica(projectId?: number | null): string | null {
  return (typeof projectId === 'number' && ASSINATURA_POR_PROJETO.get(projectId)) || null
}
