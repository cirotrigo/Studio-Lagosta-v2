/**
 * T5 (24/10/2026) — C8: a escolha de variante do script de revisão de copy (`scripts/revisao-de-copy/montar-pagina.ts`)
 * mora num helper puro. Sem pedido, a primeira story DO RODÍZIO (antes: `doStory[0]`, que podia ser a promovida); só
 * promovidas e sem pedido → recusa com o motivo; pedido por id ou nome continua igual e acha a promovida.
 * O CLI não é executado.
 */
import { describe, expect, it } from 'vitest'
import { varianteDaRevisao } from '../../../../scripts/revisao-de-copy/variante-da-revisao'

const story = (id: string, tags: string[] = [], name = id) => ({ id, name, tags })
const promovida = (id: string, name = id) => story(id, ['fora-do-rodizio', 'story'], name)

describe('C8 · variante da página de revisão de copy', () => {
  it('sem pedido: a primeira story do rodízio, mesmo com a promovida antes na ordem', () => {
    expect(varianteDaRevisao([promovida('p1'), story('a'), story('b')], undefined)).toEqual({ pagina: story('a') })
    expect(varianteDaRevisao([story('a'), story('b')], null)).toEqual({ pagina: story('a') })
  })

  it('única story promovida e sem pedido → recusa com o motivo', () => {
    expect(varianteDaRevisao([promovida('p1')], undefined)).toEqual({ motivo: 'só há story fora do rodízio: peça a variante' })
  })

  it('pedido por id ou nome acha a promovida; ambíguo e inexistente seguem recusados como antes', () => {
    const doStory = [story('a', [], 'Clássica'), promovida('p1', 'Convite do chef')]
    expect(varianteDaRevisao(doStory, 'p1')).toEqual({ pagina: doStory[1] })
    expect(varianteDaRevisao(doStory, 'convite')).toEqual({ pagina: doStory[1] })
    expect(varianteDaRevisao([story('a', [], 'Convite 1'), story('b', [], 'Convite 2')], 'convite')).toEqual({ motivo: 'a variante "convite" é ambígua (use o id)' })
    expect(varianteDaRevisao(doStory, 'nenhuma')).toEqual({ motivo: 'a variante "nenhuma" não existe' })
  })
})
