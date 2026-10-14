/**
 * `hojeViola` — o "expected failure" desta suíte, mais estrito que o
 * `it.fails` do Vitest.
 *
 * O `it.fails` passa com QUALQUER exceção: um mock quebrado, uma fixture que
 * não carregou ou um `undefined.x` contariam como "o bug ainda reproduz".
 * Aqui só conta a falha da ASSERÇÃO da propriedade (`AssertionError`):
 *
 * - a propriedade falha por asserção → o teste PASSA (o bug está
 *   caracterizado, o CI segue verde);
 * - a propriedade passa → o teste FALHA e manda converter em `it()` normal
 *   (o bug parou de reproduzir — no checkpoint que o corrigiu, ou por acaso);
 * - qualquer outro erro (setup, mock, render) → o teste FALHA com o erro
 *   original, sem mascarar.
 *
 * Regra do CP0 (owner, 13/10/2026): quando um checkpoint corrigir a
 * propriedade, este marcador sai e a propriedade vira `it()` no MESMO PR.
 */
import { it } from 'vitest'

export function hojeViola(nome: string, propriedade: () => unknown | Promise<unknown>, timeout?: number) {
  it(`[hoje viola] ${nome}`, async () => {
    let erro: unknown = null
    try {
      await propriedade()
    } catch (e) {
      erro = e
    }
    if (erro === null) {
      throw new Error(`A propriedade "${nome}" PASSOU: o defeito não reproduz mais. Troque hojeViola por it() — o marcador não pode ficar depois da correção.`)
    }
    if (!(erro instanceof Error) || erro.name !== 'AssertionError') throw erro
    // `MOSTRAR_VIOLACOES=1 npx vitest run …` imprime o que cada propriedade acusou hoje.
    if (process.env.MOSTRAR_VIOLACOES) console.info(`[hoje viola] ${nome}\n${erro.message}`)
  }, timeout)
}
