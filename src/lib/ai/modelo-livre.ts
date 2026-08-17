/**
 * Em quais clientes o MODELO escolhido é referência de ESTILO, não de LAYOUT.
 *
 * Decisão do Ciro em 17/08/2026, depois de uma noite de artes travadas: "o
 * Claudinho estava fazendo artes melhores quando não travava muito o modelo,
 * pois o modelo já manda bem e é bem criativo — agora está engessando muito. A
 * ideia de selecionar o modelo de referência seria apenas para passar uma
 * referência de FONTES que são usadas e de ORGANIZAÇÃO DE TEXTO, deixando ele
 * livre para identificar o melhor lugar de acordo com a imagem."
 *
 * O que muda no modo livre (ver `buildModeloSpineLivre`):
 * - do modelo vêm tipografia, caixa, cor, hierarquia e ornamentos;
 * - a POSIÇÃO de cada bloco volta a ser do gerador, lendo a foto — a regra 10
 *   das regras de composição (autonomia) volta a valer com modelo presente;
 * - a leitura por visão sai SEM bandas/faixas/lados (`semPosicoes`), senão a
 *   descrição viraria instrução de lugar por outra porta.
 *
 * O que NÃO muda, porque veio de feedback do mesmo cliente no mesmo dia:
 * - as palavras do modelo continuam fora do prompt (vazamento);
 * - UMA marca por peça, no canto em que a referência a põe;
 * - horário/endereço no rodapé (é conteúdo, não layout);
 * - safe area do story;
 * - texto contido e foto protagonista (regras 1, 2 e 4 — "o assunto da foto
 *   nunca deve ser coberto pelo texto" é a regra 4, que segue integral).
 *
 * ⚠️ EXPERIMENTO: só o O Quintal Parrilla (2), por decisão explícita —
 * "modifique apenas o Quintal para testarmos e depois analisamos se é melhor
 * fazer da mesma forma nos outros clientes". Não adicione projeto sem medir.
 * Módulo PURO (sem Prisma), mesmo precedente de `caixa-da-copy.ts`.
 */
export const PROJETOS_COM_MODELO_LIVRE = new Set<number>([2])

/** O modelo escolhido deste projeto manda só no estilo (não no layout)? */
export function modeloLivre(projectId?: number | null): boolean {
  return typeof projectId === 'number' && PROJETOS_COM_MODELO_LIVRE.has(projectId)
}
