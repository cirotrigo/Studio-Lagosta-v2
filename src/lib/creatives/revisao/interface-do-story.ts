/**
 * O PISO DE INTERFACE do story (seção 4.3 do CP5a) — o único lugar com os números da faixa.
 *
 * 29/10/2026, decisão do owner: topo 160 · rodapé 160 (eram 188/224 desde 13/10). Pesquisa da sessão que escreveu a
 * instrução das linhas-guia: a interface cobre uns 150–160 px no topo (barra de progresso e linha do perfil); nos
 * celulares altos a caixa "Enviar mensagem" fica quase toda abaixo da arte; a equipe já trabalha com o texto a
 * 94–153 px da base. São ESTIMATIVAS, não medição oficial — o Ciro tem duas artes de régua
 * (`docs/research/canva-guias-e-margens-2026-10/teste-de-regua/`) e pode ajustar com prints.
 *
 * Saiu de `gate.ts` em 29/10/2026 (L0 das linhas-guia) sem mudar uma linha da lógica: o editor
 * (`canvas-margin.ts`) precisa da faixa e o `gate.ts` puxa o revisor inteiro (que, por sua vez, lê as margens do
 * editor) — importar o gate de lá fechava um ciclo. O `gate.ts` reexporta com os mesmos nomes.
 *
 * Decisão do owner de 13/10/2026: a faixa da interface NÃO é a margem de composição. São duas camadas.
 * Módulo PURO.
 */

export const PISO_DE_INTERFACE_DO_STORY = { topo: 160, rodape: 160 } as const

/** Uma configuração do cliente pode ser MAIS restritiva, nunca menos. */
export function interfaceDoStory(doCliente?: { topo?: number; rodape?: number }): { topo: number; rodape: number } {
  return {
    // Configuração do cliente NUNCA afrouxa: só número finito acima do piso aperta (`NaN` em `Math.max` dava `NaN` — Codex R9).
    topo: Number.isFinite(doCliente?.topo) ? Math.max(PISO_DE_INTERFACE_DO_STORY.topo, doCliente!.topo!) : PISO_DE_INTERFACE_DO_STORY.topo,
    rodape: Number.isFinite(doCliente?.rodape) ? Math.max(PISO_DE_INTERFACE_DO_STORY.rodape, doCliente!.rodape!) : PISO_DE_INTERFACE_DO_STORY.rodape,
  }
}
