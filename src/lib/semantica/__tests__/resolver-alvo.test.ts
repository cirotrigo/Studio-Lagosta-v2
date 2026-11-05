import { describe, expect, it } from 'vitest'
import { resolverAlvo } from '../resolver-alvo'
import {
  camada,
  doisLogos,
  doisServicos,
  fotoELogo,
  headlineUnico,
  legadoPorNome,
  mesmoPapelIdsAleatorios,
  servicoUnico,
  servicoValidoEUmCorrompido,
  servicosComSlot,
  slotDuplicado,
  slotMalformado,
} from './fixtures'

const idDe = (r: ReturnType<typeof resolverAlvo>) => ('camada' in r ? r.camada.id : null)
const erroDe = (r: ReturnType<typeof resolverAlvo>) => ('erro' in r ? r.erro : null)
const codigoDe = (r: ReturnType<typeof resolverAlvo>) => erroDe(r)?.codigo ?? null

describe('resolverAlvo — layerId', () => {
  it('resolve a instância física exata', () => {
    const r = resolverAlvo(doisServicos, { layerId: 'servico-2' })
    expect(r).toMatchObject({ ok: true, indice: 1, via: 'layerId' })
    expect(idDe(r)).toBe('servico-2')
  })

  it('layerId inexistente', () => {
    expect(resolverAlvo(doisServicos, { layerId: 'nao-ha' })).toEqual({ ok: false, erro: { codigo: 'LAYER_NOT_FOUND', layerId: 'nao-ha' } })
  })

  it('layerId repetido na página é erro de integridade, nunca a primeira', () => {
    const r = resolverAlvo([camada({ id: 'dup' }), camada({ id: 'dup' })], { layerId: 'dup' })
    expect(codigoDe(r)).toBe('LAYER_DUPLICADO')
  })
})

describe('resolverAlvo — slotId', () => {
  it('slot único resolve', () => {
    const r = resolverAlvo(servicosComSlot, { slotId: 'servico-horario' })
    expect(r).toMatchObject({ ok: true, via: 'slotId' })
    expect(idDe(r)).toBe('text-17ca2')
  })

  it('slot inexistente', () => {
    expect(resolverAlvo(servicosComSlot, { slotId: 'servico-telefone' })).toEqual({ ok: false, erro: { codigo: 'SLOT_NOT_FOUND', slotId: 'servico-telefone' } })
  })

  it('slot inexistente numa página legada sem slot nenhum', () => {
    expect(codigoDe(resolverAlvo(legadoPorNome, { slotId: 'headline' }))).toBe('SLOT_NOT_FOUND')
  })

  it('slot duplicado → SLOT_DUPLICADO com os candidatos', () => {
    const r = resolverAlvo(slotDuplicado, { slotId: 'cta-principal' })
    const erro = erroDe(r)
    expect(erro?.codigo).toBe('SLOT_DUPLICADO')
    expect(erro && 'candidatos' in erro && erro.candidatos.map((c) => c.layerId)).toEqual(['text-1', 'text-2'])
  })

  it('slot malformado em alguma camada bloqueia a resolução por slot', () => {
    expect(codigoDe(resolverAlvo([...slotMalformado, ...servicosComSlot], { slotId: 'servico-endereco' }))).toBe('SEMANTICA_INVALIDA')
  })
})

describe('resolverAlvo — semanticRole', () => {
  it('papel com uma ocorrência resolve', () => {
    expect(idDe(resolverAlvo(headlineUnico, { semanticRole: 'headline' }))).toBe('headline')
    expect(idDe(resolverAlvo(servicoUnico, { semanticRole: 'servico' }))).toBe('servico')
  })

  it('foto e logo resolvem pelos ids reservados e pelo tipo', () => {
    expect(idDe(resolverAlvo(fotoELogo, { semanticRole: 'foto' }))).toBe('bg-foto')
    expect(idDe(resolverAlvo(fotoELogo, { semanticRole: 'logo' }))).toBe('logo')
  })

  it('papel legado inferido pelo nome também conta', () => {
    expect(idDe(resolverAlvo(legadoPorNome, { semanticRole: 'headline' }))).toBe('text-aa11')
  })

  it('papel inexistente', () => {
    expect(resolverAlvo(headlineUnico, { semanticRole: 'cta' })).toEqual({ ok: false, erro: { codigo: 'ROLE_NOT_FOUND', semanticRole: 'cta' } })
  })

  it('papel repetido → AMBIGUOUS_TARGET, candidatos só com identidade (sem conteúdo)', () => {
    const r = resolverAlvo(servicosComSlot, { semanticRole: 'servico' })
    expect(r).toEqual({
      ok: false,
      erro: {
        codigo: 'AMBIGUOUS_TARGET',
        semanticRole: 'servico',
        candidatos: [
          { indice: 0, layerId: 'text-8f931', slotId: 'servico-endereco', semanticRole: 'servico', type: 'text', name: 'Endereço', visible: true },
          { indice: 1, layerId: 'text-17ca2', slotId: 'servico-horario', semanticRole: 'servico', type: 'text', name: 'Horário', visible: true },
        ],
      },
    })
  })

  it('candidato legado sem slot aparece com slotId null', () => {
    const r = resolverAlvo(mesmoPapelIdsAleatorios, { semanticRole: 'servico' })
    const erro = erroDe(r)
    expect(erro && 'candidatos' in erro && erro.candidatos.map((c) => c.slotId)).toEqual([null, null])
  })

  it('dois logos: ambiguidade, não escolha', () => {
    expect(codigoDe(resolverAlvo(doisLogos, { semanticRole: 'logo' }))).toBe('AMBIGUOUS_TARGET')
  })

  it('camada oculta conta (filtrá-la esconderia a ambiguidade)', () => {
    const paginas = [camada({ id: 'a', metadata: { compositor: { papel: 'cta' } } }), camada({ id: 'b', visible: false, metadata: { compositor: { papel: 'cta' } } })]
    expect(codigoDe(resolverAlvo(paginas, { semanticRole: 'cta' }))).toBe('AMBIGUOUS_TARGET')
  })

  it('🔴 um servico válido + um corrompido NÃO resolve para o válido', () => {
    const r = resolverAlvo(servicoValidoEUmCorrompido, { semanticRole: 'servico' })
    const erro = erroDe(r)
    expect(erro).toMatchObject({ codigo: 'SEMANTICA_INVALIDA', campo: 'papel' })
    expect(erro && 'candidatos' in erro && erro.candidatos.map((c) => c.layerId)).toEqual(['text-ruim'])
  })

  it('papel fora do vocabulário', () => {
    expect(resolverAlvo(headlineUnico, { semanticRole: 'preco' as never })).toEqual({ ok: false, erro: { codigo: 'PAPEL_DESCONHECIDO', semanticRole: 'preco' } })
  })

  it('a resolução por layerId ignora semântica inválida em outras camadas', () => {
    expect(idDe(resolverAlvo(servicoValidoEUmCorrompido, { layerId: 'text-ok' }))).toBe('text-ok')
  })
})

describe('resolverAlvo — combinações e entrada', () => {
  it('alvo vazio', () => {
    expect(resolverAlvo(headlineUnico, {})).toEqual({ ok: false, erro: { codigo: 'ALVO_VAZIO' } })
  })

  it('campos que concordam resolvem, pela precedência', () => {
    expect(resolverAlvo(servicosComSlot, { layerId: 'text-8f931', slotId: 'servico-endereco', semanticRole: 'servico' })).toMatchObject({ ok: true, via: 'layerId' })
  })

  it('campos que apontam para camadas diferentes → ALVO_CONFLITANTE, nunca o mais forte em silêncio', () => {
    const r = resolverAlvo(servicosComSlot, { layerId: 'text-8f931', slotId: 'servico-horario' })
    expect(r).toEqual({
      ok: false,
      erro: {
        codigo: 'ALVO_CONFLITANTE',
        campo: 'slotId',
        candidatos: [{ indice: 0, layerId: 'text-8f931', slotId: 'servico-endereco', semanticRole: 'servico', type: 'text', name: 'Endereço', visible: true }],
      },
    })
  })

  it('o campo secundário CONFERE a camada resolvida: slot que ela não tem é conflito', () => {
    expect(codigoDe(resolverAlvo(servicosComSlot, { layerId: 'text-8f931', slotId: 'nao-ha' }))).toBe('ALVO_CONFLITANTE')
  })

  it('papel secundário divergente é conflito', () => {
    expect(resolverAlvo(servicosComSlot, { slotId: 'servico-endereco', semanticRole: 'cta' })).toMatchObject({ ok: false, erro: { codigo: 'ALVO_CONFLITANTE', campo: 'semanticRole' } })
  })

  it('nenhum erro carrega a camada nem conteúdo da página', () => {
    const erros = [
      resolverAlvo(servicosComSlot, { semanticRole: 'servico' }),
      resolverAlvo(slotDuplicado, { slotId: 'cta-principal' }),
      resolverAlvo(servicoValidoEUmCorrompido, { semanticRole: 'servico' }),
    ]
    for (const r of erros) {
      expect(r.ok).toBe(false)
      const texto = JSON.stringify(r)
      expect(texto).not.toContain('"camada"')
      expect(texto).not.toContain('content')
      expect(texto).not.toContain('Rua A')
    }
  })
})

describe('resolverAlvo — id físico duplicado em qualquer via (revisão adversarial F3)', () => {
  const pagina = [
    camada({ id: 'dup', metadata: { compositor: { papel: 'apoio' } } }),
    camada({ id: 'dup', metadata: { compositor: { papel: 'cta' }, slot: { id: 'cta-principal' } } }),
  ]

  it('por slot: a camada achada tem id repetido → LAYER_DUPLICADO', () => {
    expect(codigoDe(resolverAlvo(pagina, { slotId: 'cta-principal' }))).toBe('LAYER_DUPLICADO')
  })

  it('por papel: idem', () => {
    expect(codigoDe(resolverAlvo(pagina, { semanticRole: 'cta' }))).toBe('LAYER_DUPLICADO')
  })
})

describe('resolverAlvo — tipo (revisão adversarial F2)', () => {
  it('imagem chamada "headline" não é resolvida como headline', () => {
    const pagina = [camada({ id: 'img', name: 'headline', type: 'image' }), camada({ id: 'headline' })]
    expect(idDe(resolverAlvo(pagina, { semanticRole: 'headline' }))).toBe('headline')
  })
})
