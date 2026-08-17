/**
 * O MODELO escolhido é referência de ESTILO, não de LAYOUT — para TODOS os
 * clientes, desde 17/08/2026.
 *
 * A origem: "o Claudinho estava fazendo artes melhores quando não travava
 * muito o modelo, pois o modelo já manda bem e é bem criativo — agora está
 * engessando muito. A ideia de selecionar o modelo de referência seria apenas
 * passar uma referência de FONTES que são usadas e de ORGANIZAÇÃO DE TEXTO,
 * deixando ele livre para identificar o melhor lugar de acordo com a imagem"
 * (Ciro). Nasceu como experimento só no O Quintal Parrilla, o resultado foi
 * aprovado no mesmo dia ("funcionou melhor") e virou o PADRÃO — quem opera
 * todos os clientes é a mesma equipe, e dois comportamentos para o mesmo gesto
 * da bancada seria pior que qualquer uma das duas semânticas.
 *
 * O que o modo livre faz (ver `buildModeloSpineLivre`):
 * - do modelo vêm tipografia, caixa, cor, hierarquia e ornamentos;
 * - a POSIÇÃO de cada bloco é do gerador, lendo a foto — a regra 10 das
 *   regras de composição (autonomia) vale com modelo presente;
 * - a leitura por visão sai SEM bandas/faixas/lados (`semPosicoes`), senão a
 *   descrição viraria instrução de lugar por outra porta.
 *
 * O que NÃO afrouxa em nenhum modo, porque veio de feedback medido:
 * - as palavras do modelo continuam fora do prompt (vazamento);
 * - UMA marca por peça, no canto em que a referência a põe;
 * - horário/endereço no rodapé (é conteúdo, não layout);
 * - safe area do story;
 * - texto contido e foto protagonista (regras 1, 2 e 4 — "o assunto da foto
 *   nunca deve ser coberto pelo texto" é a regra 4, que segue integral).
 *
 * ⚠️ O CARROSSEL não passa por aqui, de propósito: o LOOK SPINE do slide
 * irmão continua estrito, porque a série é uma peça só e slides com layouts
 * diferentes é o defeito que ele existe para evitar.
 *
 * Módulo PURO (sem Prisma), mesmo precedente de `caixa-da-copy.ts`.
 */

/**
 * Opt-out: clientes que devem VOLTAR ao spine estrito (o modelo manda também
 * na posição). Vazia hoje. Se uma marca regredir com a liberdade — layouts
 * ruins recorrentes com modelo escolhido —, o caminho de volta é adicionar o
 * id aqui, não reescrever o prompt.
 */
export const PROJETOS_COM_MODELO_ESTRITO = new Set<number>([])

/** O modelo escolhido deste projeto manda só no estilo (não no layout)? */
export function modeloLivre(projectId?: number | null): boolean {
  return typeof projectId !== 'number' || !PROJETOS_COM_MODELO_ESTRITO.has(projectId)
}
