/**
 * A saída `--json` de `scripts/medir-qualidade-da-copy.ts` (PR 15), em módulo PURO para ser testada sem rodar o
 * script — ele lê produção. Só `import type` do serviço: nada dele carrega aqui.
 */
import type { JanelaDeMedida, QualidadeDaCarteira } from '../../src/lib/relatorios/qualidade-da-copy'

/**
 * O bloco guarda só o NOME de quem não coube no prazo; o motivo é o mesmo para todos. A carteira não começa um
 * cliente quando o que resta do prazo é menos de um terço do teto por cliente (`medirQualidadeDaCarteira`): o prazo
 * pode não ter acabado, e o motivo não diz que acabou.
 */
export const MOTIVO_FORA_DO_ORCAMENTO = 'fora do orçamento de tempo: o que restava do prazo da medida não dava para começar este cliente'

/**
 * A medida por cliente e da carteira, e também quem NÃO foi medido, com o motivo (FINAL do Codex sobre 9648f441,
 * PR15-13). A falha da consulta do esquema e o orçamento esgotado deixam esses clientes só no bloco, fora de
 * `porCliente`: a saída que os descartava imprimia `carteira: null, clientes: []` na falha geral — igual a uma
 * seleção vazia — e a carteira parcial sem dizer quem ficou fora.
 * - `indisponiveis` repete o bloco: inclui quem também está em `clientes` com o motivo em `indisponivel`.
 * - `foraDoOrcamento` são os que nem começaram (não estão em `clientes`).
 */
export function saidaJsonDaMedida(janela: JanelaDeMedida, r: Pick<QualidadeDaCarteira, 'porCliente' | 'carteira' | 'bloco'>) {
  return {
    janela,
    carteira: r.carteira,
    clientes: [...r.porCliente.values()].map(({ medidas: _m, ...c }) => c),
    indisponiveis: r.bloco.indisponiveis.map(({ nome, motivo }) => ({ nome, motivo })),
    foraDoOrcamento: r.bloco.foraDoOrcamento.map((nome) => ({ nome, motivo: MOTIVO_FORA_DO_ORCAMENTO })),
  }
}
