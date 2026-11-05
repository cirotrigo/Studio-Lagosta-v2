import { describe, expect, it } from 'vitest'
import { papelDaCamada } from '@/lib/compositor/defasagem'
import { PAPEIS_DO_COMPOSITOR } from '@/lib/compositor/papel-do-nome'
import { CARDINALIDADE_ESPERADA, SEMANTIC_ROLES, cardinalidadeEsperada } from '../papeis'
import { lerSemanticRole, lerSlotId } from '../ler'
import {
  camada,
  doisServicos,
  fotoELogo,
  headlineUnico,
  legadoPorNome,
  mesmoPapelIdsAleatorios,
  papelInvalidoComIdDePapel,
  servicosComSlot,
  slotMalformado,
} from './fixtures'

describe('vocabulário', () => {
  it('reaproveita os papéis do compositor e acrescenta só foto e logo', () => {
    expect(SEMANTIC_ROLES).toEqual([...PAPEIS_DO_COMPOSITOR, 'foto', 'logo'])
  })

  it('tem uma cardinalidade ESPERADA para cada papel', () => {
    for (const papel of SEMANTIC_ROLES) expect(CARDINALIDADE_ESPERADA[papel]).toMatch(/^(ONE|OPTIONAL|MANY)$/)
    expect(CARDINALIDADE_ESPERADA.servico).toBe('MANY')
    expect(CARDINALIDADE_ESPERADA.logo).toBe('ONE')
  })

  it('a expectativa pode ser sobrescrita (pelo template, no futuro)', () => {
    expect(cardinalidadeEsperada('logo')).toBe('ONE')
    expect(cardinalidadeEsperada('logo', { logo: 'MANY' })).toBe('MANY')
  })
})

describe('lerSemanticRole', () => {
  it('papel declarado em metadata', () => {
    expect(lerSemanticRole(headlineUnico[0])).toEqual({ status: 'valido', papel: 'headline', origem: 'metadata' })
  })

  it('foto e logo podem ser declarados em metadata', () => {
    const c = camada({ id: 'x', type: 'image', metadata: { compositor: { papel: 'foto' } } })
    expect(lerSemanticRole(c)).toEqual({ status: 'valido', papel: 'foto', origem: 'metadata' })
  })

  it('sem metadata: infere pelo id e depois pelo nome (compatibilidade legada)', () => {
    expect(lerSemanticRole(camada({ id: 'cta' }))).toEqual({ status: 'valido', papel: 'cta', origem: 'id' })
    expect(lerSemanticRole(legadoPorNome[0])).toEqual({ status: 'valido', papel: 'headline', origem: 'nome' })
  })

  it('logo pelo tipo, foto pelo id reservado bg-foto', () => {
    expect(lerSemanticRole(fotoELogo[0])).toEqual({ status: 'valido', papel: 'foto', origem: 'id-reservado' })
    expect(lerSemanticRole(fotoELogo[1])).toEqual({ status: 'valido', papel: 'logo', origem: 'tipo' })
  })

  it('imagem dinâmica NÃO vira foto (um modelo pode ter várias)', () => {
    expect(lerSemanticRole(camada({ id: 'img-1', type: 'image', isDynamic: true }))).toEqual({ status: 'ausente' })
  })

  it('nenhuma semântica', () => {
    expect(lerSemanticRole(legadoPorNome[1])).toEqual({ status: 'ausente' })
  })

  it('🔴 declaração INVÁLIDA não é substituída pela inferência do id', () => {
    expect(lerSemanticRole(papelInvalidoComIdDePapel[0])).toEqual({ status: 'invalido', valor: 'servicoo', motivo: 'valor' })
  })

  it('papel declarado que não é string também é inválido', () => {
    expect(lerSemanticRole(camada({ id: 'cta', metadata: { compositor: { papel: 3 } } }))).toEqual({ status: 'invalido', valor: 3, motivo: 'valor' })
  })

  it('paridade com o legado: concorda com papelDaCamada onde não há metadata inválida', () => {
    const casos = [...headlineUnico, ...doisServicos, ...legadoPorNome, ...mesmoPapelIdsAleatorios, camada({ id: 'cta' }), camada({ id: 'z', name: 'pre' })]
    for (const c of casos) {
      const nova = lerSemanticRole(c)
      expect(nova.status === 'valido' ? nova.papel : null).toBe(papelDaCamada(c))
    }
  })
})

describe('lerSlotId', () => {
  it('ausente quando não há metadata.slot', () => {
    expect(lerSlotId(headlineUnico[0])).toEqual({ status: 'ausente' })
  })

  it('válido', () => {
    expect(lerSlotId(servicosComSlot[0])).toEqual({ status: 'valido', slotId: 'servico-endereco' })
  })

  it('inválido: fora do formato', () => {
    expect(lerSlotId(slotMalformado[0])).toEqual({ status: 'invalido', valor: { id: 'cta principal é' } })
  })

  it('inválido: slot que não é objeto, ou sem id string', () => {
    expect(lerSlotId(camada({ id: 'a', metadata: { slot: 'cta' } }))).toEqual({ status: 'invalido', valor: 'cta' })
    expect(lerSlotId(camada({ id: 'b', metadata: { slot: { id: 7 } } }))).toEqual({ status: 'invalido', valor: { id: 7 } })
  })
})

describe('lerSemanticRole — papel compatível com o tipo (revisão adversarial F2)', () => {
  it('imagem chamada "headline" não vira headline', () => {
    expect(lerSemanticRole(camada({ id: 'img-1', name: 'headline', type: 'image' }))).toEqual({ status: 'ausente' })
  })

  it('logo de id "cta" continua logo, pelo tipo', () => {
    expect(lerSemanticRole(camada({ id: 'cta', type: 'logo' }))).toEqual({ status: 'valido', papel: 'logo', origem: 'tipo' })
  })

  it('papel de texto declarado numa imagem é inválido por tipo', () => {
    expect(lerSemanticRole(camada({ id: 'x', type: 'image', metadata: { compositor: { papel: 'headline' } } }))).toEqual({ status: 'invalido', valor: 'headline', motivo: 'tipo' })
  })

  it('foto declarada num texto é inválida por tipo', () => {
    expect(lerSemanticRole(camada({ id: 'x', metadata: { compositor: { papel: 'foto' } } }))).toEqual({ status: 'invalido', valor: 'foto', motivo: 'tipo' })
  })

  it('rich-text aceita papel de texto', () => {
    expect(lerSemanticRole(camada({ id: 'cta', type: 'rich-text' }))).toEqual({ status: 'valido', papel: 'cta', origem: 'id' })
  })
})

describe('lerSemanticRole — revisão do diff (codex review)', () => {
  it('texto com o id reservado bg-foto não é foto', () => {
    expect(lerSemanticRole(camada({ id: 'bg-foto', type: 'text' }))).toEqual({ status: 'ausente' })
  })

  it('metadata.compositor que não é objeto é declaração corrompida, sem cair na inferência', () => {
    expect(lerSemanticRole(camada({ id: 'servico', metadata: { compositor: 'servico' } }))).toEqual({ status: 'invalido', valor: 'servico', motivo: 'valor' })
  })

  it('compositor sem papel é legítimo (camada extra livre) e cai na inferência', () => {
    expect(lerSemanticRole(camada({ id: 'texto-1', metadata: { compositor: { bloco: 'b1' } } }))).toEqual({ status: 'ausente' })
  })

  it('papel null (guardável em JSON) é inválido', () => {
    expect(lerSemanticRole(camada({ id: 'cta', metadata: { compositor: { papel: null } } }))).toEqual({ status: 'invalido', valor: null, motivo: 'valor' })
  })
})
