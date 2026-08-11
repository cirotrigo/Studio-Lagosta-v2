/**
 * O que se testa aqui sem banco: a conversão de fuso e as chaves de
 * idempotência.
 *
 * As duas são o tipo de coisa que ninguém percebe estar errada — um slot
 * gravado em UTC vira "story das 21h" que o relatório mostra como meia-noite
 * do dia seguinte, e uma chave que não bate faz o mesmo post virar duas linhas
 * de cadência.
 *
 * ⚠️ O import é do CONTRATO, nunca do serviço: `sinal-de-agendamento.ts`
 * arrasta o Prisma por `captura` e por `fechar-copy-por-pagina`, e `@/lib/db`
 * lança no import quando falta `DATABASE_URL` — apontar para lá derruba o
 * arquivo inteiro antes do primeiro `it`.
 */

import { describe, expect, it } from 'vitest'
import { chaveDeSugestao } from '../chaves'
import { chaveDaCopy, chaveDoSlot, slotEmBrasilia } from '../sinal-de-agendamento-contrato'

describe('slotEmBrasilia', () => {
  it('converte para BRT — o horário da noite não escorrega para o dia seguinte', () => {
    // 11/08 00:30 UTC é 10/08 21:30 em Brasília: dia, hora e dia da semana
    // TÊM de ser os de lá, senão o slot típico da segunda à noite aparece como
    // terça de madrugada.
    const slot = slotEmBrasilia(new Date('2026-08-11T00:30:00Z'))
    expect(slot.data).toBe('2026-08-10')
    expect(slot.hora).toBe('21:30')
    expect(slot.diaDaSemana).toBe('segunda-feira')
  })

  it('usa relógio de 24 horas', () => {
    // 18:00 BRT = 21:00 UTC. Com hour12 ligado sairia "06:00", que numa
    // agregação de horário é meio dia de diferença.
    expect(slotEmBrasilia(new Date('2026-08-10T21:00:00Z')).hora).toBe('18:00')
  })

  it('meia-noite BRT sai como 00:00, não 24:00', () => {
    const slot = slotEmBrasilia(new Date('2026-08-11T03:00:00Z'))
    expect(slot.hora).toBe('00:00')
    expect(slot.data).toBe('2026-08-11')
  })

  it('guarda o instante original em ISO, para quem precisar recalcular', () => {
    const quando = new Date('2026-08-11T00:30:00Z')
    expect(slotEmBrasilia(quando).iso).toBe(quando.toISOString())
  })
})

describe('chaves de idempotência', () => {
  it('slot e copy do mesmo post não colidem entre si', () => {
    expect(chaveDoSlot('post-1')).not.toBe(chaveDaCopy('post-1'))
  })

  /**
   * A chave da copy é a da ESCOLHA ABSOLUTA — a linha que só nasce quando a
   * peça NÃO veio de leva. Quando veio, quem responde pela copy é a dica que a
   * propôs, achada pelo PREFIXO da chave de sugestão (`chaveDaDicaDeCopy`,
   * montada sobre a âncora do item). As duas famílias não podem se confundir:
   * uma decisão absoluta que caísse dentro do prefixo de uma proposta seria
   * devolvida como se fosse a dica, e o desfecho seria calculado contra o
   * próprio texto final.
   */
  it('a copy de um post fica FORA do prefixo que acha uma dica proposta', () => {
    // O mesmo prefixo que `fecharDicaDeCopyDoItem` usa no `startsWith`.
    const prefixoDaDica = `${chaveDeSugestao('copy', 8, '2026-08-11 19:00')}|`
    expect(chaveDaCopy('post-1').startsWith(prefixoDaDica)).toBe(false)
    // E o contrário: a chave do post não pode ser lida como chave de sugestão
    // do tipo copy, que separa os campos por `|`.
    expect(chaveDaCopy('post-1')).not.toContain('|')
  })

  it('a chave do slot depende SÓ do post — é o que faz agendar e aprovar gravarem uma linha', () => {
    // `agendarPost` e `processarAprovacao` chamam com dados diferentes
    // (situação, superfície, quem decidiu); se a chave dependesse de qualquer
    // um deles, o caminho normal (criar rascunho → aprovar) gravaria DUAS
    // linhas para o mesmo horário e dobraria a cadência do cliente.
    expect(chaveDoSlot('post-1')).toBe(chaveDoSlot('post-1'))
    expect(chaveDoSlot('post-1')).not.toBe(chaveDoSlot('post-2'))
  })
})
