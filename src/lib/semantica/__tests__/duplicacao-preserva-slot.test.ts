/**
 * A regra de identidade, provada contra a DUPLICAÇÃO REAL de página
 * (`duplicarCamadasDaPagina`, que este PR não altera):
 *   layer.id         → regenerado (identidade física);
 *   metadata.slot.id → preservado (identidade lógica, local ao template).
 * Se a duplicação um dia passar a descartar metadata, este teste quebra — e o
 * PR B fica bloqueado até ela voltar a preservá-lo.
 */
import { describe, expect, it } from 'vitest'
import { duplicarCamadasDaPagina } from '@/lib/copy-autoral/duplicacao'
import { lerSlotId } from '../ler'
import { resolverAlvo } from '../resolver-alvo'
import { servicosComSlot } from './fixtures'

let seq = 0
const novoId = () => `copia-${++seq}`

describe('duplicação: layer.id muda, metadata.slot.id fica', () => {
  it('sem contrato da copy', () => {
    const { camadas } = duplicarCamadasDaPagina(servicosComSlot, novoId, null)
    const copia = camadas as typeof servicosComSlot
    expect(copia.map((c) => c.id)).not.toEqual(servicosComSlot.map((c) => c.id))
    expect(copia.map((c) => lerSlotId(c))).toEqual([
      { status: 'valido', slotId: 'servico-endereco' },
      { status: 'valido', slotId: 'servico-horario' },
    ])
  })

  it('o mesmo slot resolve na cópia, apontando para o NOVO id', () => {
    const { camadas, idsDeCamada } = duplicarCamadasDaPagina(servicosComSlot, novoId, null)
    const r = resolverAlvo(camadas as typeof servicosComSlot, { slotId: 'servico-horario' })
    expect('camada' in r && r.camada.id).toBe(idsDeCamada.get('text-17ca2'))
  })

  it('com contrato da copy (o caminho que materializa vínculos antes de trocar os ids)', () => {
    const contrato = {
      versao: 'copy-autoral-v1',
      origem: { autor: 'claude', superficie: 'chat' },
      blocos: [{ id: 'b1', funcao: 'servico', ordem: 1, linhas: ['Rua A, 1'] }],
      revisoes: [],
    } as never
    const { camadas } = duplicarCamadasDaPagina(servicosComSlot, novoId, contrato)
    expect((camadas as typeof servicosComSlot).map((c) => lerSlotId(c).status)).toEqual(['valido', 'valido'])
  })
})
