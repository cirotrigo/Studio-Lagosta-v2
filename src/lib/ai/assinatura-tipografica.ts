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
  '1. MANCHETE PEQUENA E ESPAÇADA: serifada elegante da identidade, em CAIXA ALTA com espaçamento generoso entre letras (tracking largo, as letras respiram). Cada linha ocupa ~4 a 6% da altura do quadro e o lockup inteiro fica em ~12% no máximo. A sofisticação vem do ESPAÇO entre as letras, nunca do tamanho nem do peso — manchete grande ou em negrito pesado quebra a marca.',
  '2. DUAS VOZES: com duas linhas de manchete, uma sai no tom cobre/terracota da paleta e a outra em branco — a alternância de cor É o destaque, no lugar de aumentar o corpo.',
  '3. APOIO LEVE: sans-serif fina, em caixa alta pequena espaçada ou em frase normal, sempre curto. UMA ou duas palavras-chave do apoio ganham o cobre (ou um peso a mais); todo o resto fica branco e leve.',
  '4. SERVIÇO MIÚDO: horário e endereço em sans muito pequena, caixa alta espaçada, com o dado (horas, número) num peso levemente maior que o rótulo. Ícones finos de relógio e de localização quando houver horário e endereço.',
  '5. O SEPARADOR DA CASA é um losango pequeno em cobre: sozinho entre seções, ou ao centro de um filete fino, ou entre meias-linhas que abraçam a linha de serviço. Sempre discreto — nunca barra, tarja ou caixa.',
  '6. DUAS CORES DE TEXTO no máximo: branco e o cobre/terracota da paleta. O cobre é acento — uma linha da manchete, a palavra-chave do apoio, o losango — nunca o corpo inteiro da peça.',
].join('\n')

/** A assinatura cadastrada do projeto, ou null (a maioria não tem — ainda). */
const ASSINATURA_POR_PROJETO = new Map<number, string>([[3, TERO]])

export function assinaturaTipografica(projectId?: number | null): string | null {
  return (typeof projectId === 'number' && ASSINATURA_POR_PROJETO.get(projectId)) || null
}
