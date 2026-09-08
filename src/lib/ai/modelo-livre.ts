/**
 * O MODELO escolhido manda também no LAYOUT — para TODOS os clientes, desde
 * 07/09/2026. O pêndulo já esteve do outro lado; a história inteira está aqui
 * porque é ela que impede a terceira virada sem dado novo.
 *
 * ── 17/08/2026: o modo livre vira padrão ────────────────────────────────────
 * "O Claudinho estava fazendo artes melhores quando não travava muito o
 * modelo, pois o modelo já manda bem e é bem criativo — agora está engessando
 * muito. A ideia de selecionar o modelo de referência seria apenas passar uma
 * referência de FONTES que são usadas e de ORGANIZAÇÃO DE TEXTO, deixando ele
 * livre para identificar o melhor lugar de acordo com a imagem" (Ciro).
 * Nasceu como experimento no O Quintal, foi aprovado no mesmo dia e virou
 * padrão da carteira — quem opera todos os clientes é a mesma equipe, e dois
 * comportamentos para o mesmo gesto da bancada seria pior que qualquer uma das
 * duas semânticas.
 *
 * ── 24/08 e 07/09: dois clientes voltam, um a um ────────────────────────────
 * O Quintal (0 "gostei" × 14) e a Wine Vix (5 × 9, com "não seguiu o template
 * escolhido" quatro vezes) saíram do modo livre por opt-out. Aí o argumento da
 * uniformidade que sustentava o padrão já estava perdido: eram dois
 * comportamentos em produção.
 *
 * ── 07/09/2026: o padrão inverte ────────────────────────────────────────────
 * O Ciro testou a Real Gelateria e relatou o mesmo defeito. O placar de toda a
 * carteira, contado no dia (feedback real da equipe, desde julho):
 *
 * | cliente          | modo    | gostei | melhorar | "não seguiu a referência" |
 * |------------------|---------|-------:|---------:|--------------------------:|
 * | O Quintal        | estrito |      2 |       29 |                        10 |
 * | Wine Vix         | estrito |      5 |        9 |                         3 |
 * | TERO             | livre   |      1 |       64 |                         2 |
 * | Real Gelateria   | livre   |      8 |        7 |                         2 |
 * | By Rock          | livre   |      3 |       10 |                         1 |
 * | Espeto Gaúcho    | livre   |     11 |       30 |                         0 |
 * | Lagosta Criativa | livre   |      3 |        6 |                         0 |
 *
 * Cinco dos sete clientes reclamaram de a peça não seguir a referência; 18
 * queixas ao todo. Nenhuma delas é anterior a 17/08.
 *
 * 🔴 As 10 queixas do Quintal em modo ESTRITO não desmentem isto: são de
 * agosto, quando o prompt vinha do `buildArtePrompt` de 16 mil caracteres. O
 * planejador só existe desde 05/09, e a causa que fazia o estrito não pegar —
 * a decisão de design do planejador reinventando a posição, contra o "match
 * its text placement" da linha da referência — só foi corrigida em 07/09.
 * Antes disso, "estrito" era uma promessa que o prompt não cumpria.
 *
 * O que o modo ESTRITO faz: do modelo vêm tipografia, caixa, cor, hierarquia,
 * ornamentos E a posição de cada bloco. A autonomia de composição (regra 10)
 * sai do prompt quando há modelo — ela competia com o modelo e vencia, por ser
 * mais concreta e vir depois.
 *
 * 🔴 E o estrito não conserta só a POSIÇÃO: foi a única variante em que a
 * FOTOGRAFIA sobreviveu. Na mesma foto e na mesma copy, o modo livre devolveu
 * uma peça com a diagramação certa e o salão VAZIO — o gpt-image recriou a
 * cena e apagou as pessoas, o laptop e os pratos. É o mesmo efeito que a F0 do
 * PR #93 mediu ("o redesenho vence na tabela do editor e destrói a foto em
 * peça aprovada"). A frase "só a fotografia e as palavras mudam" é o que
 * ancora a cena, e ela só existe no spine estrito.
 *
 * ⚠️ O CARROSSEL não passa por aqui, de propósito: o LOOK SPINE do slide irmão
 * sempre foi estrito, porque a série é uma peça só e slides com layouts
 * diferentes é o defeito que ele existe para evitar.
 *
 * Módulo PURO (sem Prisma), mesmo precedente de `caixa-da-copy.ts`.
 */

/**
 * Opt-in: clientes que voltam ao modo LIVRE (o modelo manda só no estilo, e a
 * posição é do gerador lendo a foto).
 *
 * Vazio hoje, e de propósito: a inversão de 07/09/2026 não tem cliente
 * excluído. Se uma marca regredir com o layout travado — layouts repetitivos,
 * texto pousado onde a foto não deixa —, o caminho é adicionar o id aqui, não
 * reescrever o prompt. O spine livre continua no código e coberto por teste
 * exatamente para esse retorno.
 *
 * Quem vier para cá merece uma linha dizendo QUAL foi a regressão e em que
 * data — é assim que a próxima virada do pêndulo terá dado, e não memória.
 *
 * Candidatos naturais, se o assunto voltar: Espeto Gaúcho (11 × 30) e Lagosta
 * Criativa (3 × 6) foram os dois clientes que nunca reclamaram de a peça não
 * seguir a referência.
 */
export const PROJETOS_COM_MODELO_LIVRE = new Set<number>([])

/** O modelo escolhido deste projeto manda só no estilo (não no layout)? */
export function modeloLivre(projectId?: number | null): boolean {
  return typeof projectId === 'number' && PROJETOS_COM_MODELO_LIVRE.has(projectId)
}
