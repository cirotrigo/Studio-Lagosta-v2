/**
 * B1b — descoberta semântica: `analisarSlotFields` enriquece os campos que o
 * `escolher-modelo` já devolvia, sem mudar os cinco campos legados, e
 * diagnostica a página inteira em `semanticIssues`. `addressableBy` é o que o
 * Studio de HOJE executa de ponta a ponta — `layerId` seguro desde o B1b; o B1c
 * acrescenta slotId/semanticRole, que passou a preencher. Vem do `resolverAlvo`:
 * id, slot ou papel repetido não é endereço seguro.
 */
import { describe, expect, it } from 'vitest'
import { analisarSlotFields, slotFieldsFromLayers } from '../slot-fields'

const texto = (id: string, name: string, content: string, metadata?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, name, type: 'text', content, visible: true, ...(metadata ? { metadata } : {}), ...extra,
})
const papel = (p: unknown, slot?: unknown) => ({ compositor: { papel: p }, ...(slot !== undefined ? { slot: { id: slot } } : {}) })

/** A função de ANTES do B1b, como oráculo dos cinco campos legados. */
function legado(camadas: any[]) {
  return camadas
    .filter((l) => l.type === 'text' || (l.type === 'image' && l.isDynamic))
    .map((l) => ({ layerId: l.id, name: l.name, type: l.type, isDynamic: !!l.isDynamic, currentValue: l.type === 'text' ? (l.content ?? '') : (l.fileUrl ?? '') }))
}
const semSemantica = (fields: Array<Record<string, unknown>>) => fields.map(({ semantic: _s, ...resto }) => resto)

describe('compatibilidade aditiva', () => {
  const modeloAntigo = [
    texto('text-a1', 'headline', 'Almoço executivo'),
    texto('text-b2', 'Subtítulo', 'De terça a sexta'),
    { id: 'img-1', name: 'Foto', type: 'image', isDynamic: true, fileUrl: 'https://x/foto.jpg' },
    { id: 'shape-1', name: 'cta', type: 'shape' },
    { id: 'rt-1', name: 'Rico', type: 'rich-text', content: 'Rico' },
    { id: 'img-2', name: 'Estática', type: 'image', fileUrl: 'https://x/fixa.jpg' },
  ]

  it('modelo legado sem slots: os MESMOS fields, na mesma ordem, com os cinco valores legados idênticos', () => {
    const { slotFields } = analisarSlotFields(modeloAntigo)
    expect(semSemantica(slotFields as never)).toEqual(legado(modeloAntigo))
  })

  it('shape: cada field tem exatamente os cinco campos legados + semantic', () => {
    for (const f of analisarSlotFields(modeloAntigo).slotFields) {
      expect(Object.keys(f)).toEqual(['layerId', 'name', 'type', 'isDynamic', 'currentValue', 'semantic'])
      expect(Object.keys(f.semantic)).toEqual(['role', 'slot', 'addressableBy', 'problems'])
    }
  })

  it('slotFieldsFromLayers continua existindo e é a lista da análise', () => {
    expect(slotFieldsFromLayers(modeloAntigo)).toEqual(analisarSlotFields(modeloAntigo).slotFields)
  })

  it('papel inferido NÃO faz entrar: shape chamada "cta" e rich-text continuam fora', () => {
    expect(analisarSlotFields(modeloAntigo).slotFields.map((f) => f.layerId)).toEqual(['text-a1', 'text-b2', 'img-1'])
  })

  it('JSON.stringify/parse preserva a shape (é como a porta do MCP serializa)', () => {
    const r = analisarSlotFields(modeloAntigo)
    expect(JSON.parse(JSON.stringify(r))).toEqual(r)
  })

  it('camadas ilegíveis: lista vazia (como antes), mas DIAGNOSTICADA — não se confunde com modelo sem campos', () => {
    expect(analisarSlotFields('{nao-json')).toEqual({ slotFields: [], semanticIssues: [{ code: 'LAYERS_UNREADABLE', layerIds: [] }] })
  })

  it('página legível sem camadas: lista vazia e SEM issue', () => {
    expect(analisarSlotFields([])).toEqual({ slotFields: [], semanticIssues: [] })
  })
})

describe('role.status: declarado, inferido, ausente, inválido', () => {
  it('inferido pelo nome', () => {
    const [f] = analisarSlotFields([texto('text-a1', 'headline', 'X')]).slotFields
    expect(f.semantic.role).toEqual({ status: 'inferred', value: 'headline', origin: 'nome', expectedCardinality: 'ONE', occurrences: 1, ambiguous: false })
    // o papel é descrito, mas ainda não é capacidade executável
    expect(f.semantic.addressableBy).toEqual(['layerId'])
  })

  it('inferido pelo id', () => {
    const [f] = analisarSlotFields([texto('cta', 'Botão', 'X')]).slotFields
    expect(f.semantic.role).toMatchObject({ status: 'inferred', value: 'cta', origin: 'id' })
  })

  it('declarado em metadata', () => {
    const [f] = analisarSlotFields([texto('t1', 'Qualquer', 'X', papel('apoio'))]).slotFields
    expect(f.semantic.role).toMatchObject({ status: 'declared', value: 'apoio', origin: 'metadata' })
  })

  it('ausente', () => {
    const [f] = analisarSlotFields([texto('t1', 'Qualquer', 'X')]).slotFields
    expect(f.semantic.role).toEqual({ status: 'absent', value: null, origin: null, expectedCardinality: null, occurrences: 0, ambiguous: false })
  })

  it('inválido: sem o valor corrompido, com o motivo; vira issue da página', () => {
    const r = analisarSlotFields([texto('servico', 'servico', 'X', papel('servicoo'))])
    expect(r.slotFields[0].semantic.role).toEqual({ status: 'invalid', value: null, origin: null, expectedCardinality: null, occurrences: 0, ambiguous: false })
    expect(r.slotFields[0].semantic.problems).toEqual([{ code: 'ROLE_INVALID', reason: 'valor' }])
    expect(r.semanticIssues).toEqual([{ code: 'ROLE_INVALID', layerIds: ['servico'], reason: 'valor' }])
    expect(JSON.stringify(r)).not.toContain('servicoo')
  })

  it('foto pelo id reservado (imagem dinâmica) e logo com slot', () => {
    const r = analisarSlotFields([
      { id: 'bg-foto', name: 'Fundo', type: 'image', isDynamic: true, fileUrl: 'https://x' },
      { id: 'logo', name: 'Logo', type: 'logo', metadata: { slot: { id: 'logo-principal' } } },
    ])
    expect(r.slotFields[1].currentValue).toBe('')
    expect(r.slotFields.map((f) => [f.layerId, f.semantic.role.value, f.semantic.role.origin])).toEqual([
      ['bg-foto', 'foto', 'id-reservado'],
      ['logo', 'logo', 'tipo'],
    ])
    expect(r.slotFields[1].semantic.slot).toEqual({ status: 'declared', id: 'logo-principal' })
    // a logo é desenhada pelo logoId: content/fileUrl não chegam ao render — descrita, mas não prometida
    expect(r.slotFields[1].semantic.addressableBy).toEqual([])
    expect(r.slotFields[1].semantic.problems).toContainEqual({ code: 'TYPE_NOT_FILLABLE' })
  })
})

describe('slot e entrada de camadas', () => {
  it('slot explícito numa camada fora do filtro legado: entra, com isDynamic honesto e SEM expor o conteúdo dela', () => {
    const r = analisarSlotFields([{ id: 'img-fixa', name: 'Fixa', type: 'image', fileUrl: 'https://x/interno?token=1', metadata: { slot: { id: 'foto-fixa' } } }])
    expect(r.slotFields).toHaveLength(1)
    // a URL da imagem estática nunca constou da resposta: quem entra SÓ pelo slot não ganha currentValue
    expect(r.slotFields[0]).toMatchObject({ layerId: 'img-fixa', isDynamic: false, currentValue: '', semantic: { slot: { status: 'declared', id: 'foto-fixa' } } })
    expect(JSON.stringify(r)).not.toContain('interno')
  })

  it('texto e imagem dinâmica com slot continuam com o currentValue de sempre', () => {
    const r = analisarSlotFields([texto('t1', 'T', 'Olá', { slot: { id: 's1' } }), { id: 'i1', name: 'I', type: 'image', isDynamic: true, fileUrl: 'https://dyn', metadata: { slot: { id: 's2' } } }])
    expect(r.slotFields.map((f) => f.currentValue)).toEqual(['Olá', 'https://dyn'])
  })

  it('dois servico com slots: os dois slots descritos e prometidos, o papel ambíguo (semanticRole fora); não é issue', () => {
    const r = analisarSlotFields([texto('t-e', 'Endereço', 'Rua A', papel('servico', 'servico-endereco')), texto('t-h', 'Horário', '18h', papel('servico', 'servico-horario'))])
    expect(r.semanticIssues).toEqual([])
    for (const f of r.slotFields) {
      expect(f.semantic.role).toMatchObject({ value: 'servico', occurrences: 2, ambiguous: true, expectedCardinality: 'MANY' })
      // B1c: o slot de cada um é endereço executável; o papel, ambíguo, não
      expect(f.semantic.slot.status).toBe('declared')
      expect(f.semantic.addressableBy).toEqual(['layerId', 'slotId'])
    }
    expect(r.slotFields.map((f) => f.semantic.slot.id)).toEqual(['servico-endereco', 'servico-horario'])
  })

  it('dois servico, um sem slot: o sem slot só por layerId, e isso fica explícito', () => {
    const r = analisarSlotFields([texto('t-e', 'Endereço', 'Rua A', papel('servico', 'servico-endereco')), texto('t-h', 'Horário', '18h', papel('servico'))])
    expect(r.slotFields[1].semantic.slot).toEqual({ status: 'absent', id: null })
    expect(r.slotFields[1].semantic.addressableBy).toEqual(['layerId'])
  })

  it('dois papéis iguais SEM slot: ambiguous, nenhum semanticRole em addressableBy, e NÃO é semanticIssue', () => {
    const r = analisarSlotFields([texto('a', 'A', 'x', papel('cta')), texto('b', 'B', 'y', papel('cta'))])
    expect(r.semanticIssues).toEqual([])
    expect(r.slotFields.every((f) => f.semantic.role.ambiguous && !(f.semantic.addressableBy as string[]).includes('semanticRole'))).toBe(true)
  })

  it('slot inválido: status invalid, sem id, problema no field e na página', () => {
    const r = analisarSlotFields([texto('t1', 'T', 'x', { slot: { id: 'com espaço' } })])
    expect(r.slotFields[0].semantic.slot).toEqual({ status: 'invalid', id: null })
    expect(r.slotFields[0].semantic.problems).toEqual([{ code: 'SLOT_INVALID' }])
    expect(r.semanticIssues).toEqual([{ code: 'SLOT_INVALID', layerIds: ['t1'] }])
    expect(JSON.stringify(r)).not.toContain('com espaço')
  })

  it('slot duplicado: issue da página, fields com status duplicate, nenhum anuncia slotId', () => {
    const r = analisarSlotFields([texto('a', 'A', 'x', papel('cta', 'principal')), texto('b', 'B', 'y', papel('apoio', 'principal'))])
    expect(r.semanticIssues).toEqual([{ code: 'SLOT_DUPLICATE', layerIds: ['a', 'b'], slotId: 'principal' }])
    for (const f of r.slotFields) {
      expect(f.semantic.slot).toEqual({ status: 'duplicate', id: 'principal' })
      // sem slotId; o papel declarado de cada um (cta, apoio) é único, então semanticRole entra
      expect(f.semantic.addressableBy).toEqual(['layerId', 'semanticRole'])
      expect(f.semantic.problems).toContainEqual({ code: 'SLOT_DUPLICATE', layerIds: ['a', 'b'] })
    }
  })

  it('layerId duplicado: issue da página e layerId fora de addressableBy', () => {
    const r = analisarSlotFields([texto('dup', 'A', 'x'), texto('dup', 'B', 'y')])
    expect(r.semanticIssues).toEqual([{ code: 'LAYER_ID_DUPLICATE', layerIds: ['dup'], occurrences: 2 }])
    expect(r.slotFields.map((f) => f.semantic.addressableBy)).toEqual([[], []])
  })
})

describe('corrupção FORA dos fields aparece em semanticIssues', () => {
  it('shape com slot inválido: não vira field, mas é diagnosticada', () => {
    const r = analisarSlotFields([texto('t1', 'T', 'x'), { id: 'shape-1', name: 'Forma', type: 'shape', metadata: { slot: { id: 7 } } }])
    expect(r.slotFields.map((f) => f.layerId)).toEqual(['t1'])
    expect(r.semanticIssues).toEqual([{ code: 'SLOT_INVALID', layerIds: ['shape-1'] }])
  })

  it('papel inválido numa camada fora dos fields bloqueia a resolução por papel dos fields e aparece no diagnóstico', () => {
    const r = analisarSlotFields([texto('t1', 'T', 'x', papel('cta')), { id: 'shape-1', name: 'Forma', type: 'shape', metadata: { compositor: { papel: 'ctaa' } } }])
    expect(r.semanticIssues).toEqual([{ code: 'ROLE_INVALID', layerIds: ['shape-1'], reason: 'valor' }])
    expect(r.slotFields[0].semantic.role.status).toBe('declared')
    expect(r.slotFields[0].semantic.addressableBy).toEqual(['layerId'])
  })

  it('o diagnóstico não expõe conteúdo: nada de texto, URL ou metadata bruta', () => {
    const r = analisarSlotFields([{ id: 'shape-1', name: 'Forma', type: 'shape', content: 'segredo', fileUrl: 'https://interno', metadata: { slot: { id: 'x y' }, compositor: { papel: 'nada', bloco: 'b-secreto' } } }])
    const issues = JSON.stringify(r.semanticIssues)
    for (const proibido of ['segredo', 'https://interno', 'x y', 'b-secreto', 'nada']) expect(issues).not.toContain(proibido)
  })
})

describe('addressableBy = capacidade executável HOJE (F1 do B1b; B1c acrescenta slotId e semanticRole)', () => {
  const paginas: unknown[][] = [
    [texto('text-a1', 'headline', 'x')],
    [texto('t-e', 'E', 'x', papel('servico', 'servico-endereco')), texto('t-h', 'H', 'y', papel('servico', 'servico-horario'))],
    [texto('a', 'A', 'x', papel('cta', 's'))],
    [{ id: 'bg-foto', name: 'F', type: 'image', isDynamic: true }, { id: 'logo', name: 'L', type: 'logo', metadata: { slot: { id: 'logo-1' } } }],
  ]

  it('B1c: slotId só com slot único, semanticRole só com papel DECLARADO e único; logo não desenha o valor', () => {
    expect(paginas.map((p) => analisarSlotFields(p).slotFields.map((f) => f.semantic.addressableBy))).toEqual([
      [['layerId']],
      [['layerId', 'slotId'], ['layerId', 'slotId']],
      [['layerId', 'slotId', 'semanticRole']],
      [['layerId'], []],
    ])
  })

  it('a descrição semântica continua inteira: slot, papel e problemas aparecem', () => {
    const [f] = analisarSlotFields(paginas[2]).slotFields
    expect(f.semantic.slot).toEqual({ status: 'declared', id: 's' })
    expect(f.semantic.role).toMatchObject({ status: 'declared', value: 'cta', occurrences: 1, ambiguous: false })
  })
})

describe('layerId só é seguro se nenhuma OUTRA camada tem esse valor como nome (revisão adversarial curta do B1b)', () => {
  it('id "x" de uma camada é o nome de outra: o legado aplicaria nas duas → não anunciado, com o motivo', () => {
    const r = analisarSlotFields([texto('x', 'Título', 'a'), texto('y', 'x', 'b')])
    expect(r.slotFields[0].semantic.addressableBy).toEqual([])
    expect(r.slotFields[0].semantic.problems).toContainEqual({ code: 'LAYER_ID_MATCHES_OTHER_NAME', layerIds: ['y'] })
    // a outra camada continua segura pelo próprio id
    expect(r.slotFields[1].semantic.addressableBy).toEqual(['layerId'])
  })

  it('o nome igual ao PRÓPRIO id não é colisão (as camadas do compositor são assim)', () => {
    expect(analisarSlotFields([texto('headline', 'headline', 'a')]).slotFields[0].semantic.addressableBy).toEqual(['layerId'])
  })
})

describe('só tipos cujo valor o render desenha são prometidos (codex review do B1b)', () => {
  it('forma e gradiente com slot: continuam campos (descritos), mas sem addressableBy e com o motivo', () => {
    const r = analisarSlotFields([
      { id: 'shape-1', name: 'Botão', type: 'shape', metadata: { slot: { id: 'botao' } } },
      { id: 'grad-1', name: 'Gradiente', type: 'gradient', metadata: { slot: { id: 'grad' } } },
    ])
    expect(r.slotFields.map((f) => f.layerId)).toEqual(['shape-1', 'grad-1'])
    for (const f of r.slotFields) {
      expect(f.semantic.slot.status).toBe('declared')
      expect(f.semantic.addressableBy).toEqual([])
      expect(f.semantic.problems).toContainEqual({ code: 'TYPE_NOT_FILLABLE' })
    }
  })

  it('texto, rich-text e imagem com slot: layerId e slotId prometidos', () => {
    const r = analisarSlotFields([
      texto('t1', 'T', 'a', { slot: { id: 's1' } }),
      { id: 'rt-1', name: 'R', type: 'rich-text', content: 'b', metadata: { slot: { id: 's2' } } },
      { id: 'img-1', name: 'I', type: 'image', metadata: { slot: { id: 's3' } } },
    ])
    expect(r.slotFields.map((f) => f.semantic.addressableBy)).toEqual([['layerId', 'slotId'], ['layerId', 'slotId'], ['layerId', 'slotId']])
  })
})

describe('camada oculta no modelo não é prometida (codex review do B1b)', () => {
  it('visible: false → continua campo, sem addressableBy, com LAYER_HIDDEN (o preenchimento não a torna visível)', () => {
    const r = analisarSlotFields([texto('t1', 'Apoio', 'x', undefined, { visible: false }), texto('t2', 'Título', 'y')])
    expect(r.slotFields.map((f) => f.layerId)).toEqual(['t1', 't2'])
    expect(r.slotFields[0].semantic.addressableBy).toEqual([])
    expect(r.slotFields[0].semantic.problems).toContainEqual({ code: 'LAYER_HIDDEN' })
    expect(r.slotFields[1].semantic.addressableBy).toEqual(['layerId'])
  })
})

describe('página que a criação pode trocar por uma irmã (família "(3 layouts)") — decisão do Ciro, opção B', () => {
  const pagina = [
    texto('t-e', 'Endereço', 'Rua A', papel('servico', 'servico-endereco')),
    texto('t-h', 'Horário', '18h', papel('servico', 'servico-horario')),
    texto('t-t', 'headline', 'Título'),
  ]

  it('template normal: a camada segura promete layerId', () => {
    expect(analisarSlotFields(pagina).slotFields.map((f) => f.semantic.addressableBy)).toEqual([['layerId', 'slotId'], ['layerId', 'slotId'], ['layerId']])
    expect(analisarSlotFields(pagina, { paginaPodeSerSubstituida: false }).slotFields[2].semantic.addressableBy).toEqual(['layerId'])
  })

  it('a mesma página numa família que troca: nada prometido, com PAGE_MAY_CHANGE_BY_LAYOUT no field', () => {
    for (const f of analisarSlotFields(pagina, { paginaPodeSerSubstituida: true }).slotFields) {
      expect(f.semantic.addressableBy).toEqual([])
      expect(f.semantic.problems).toContainEqual({ code: 'PAGE_MAY_CHANGE_BY_LAYOUT' })
    }
  })

  it('a semântica continua inteira: slot, papel, ambiguidade e os outros problemas', () => {
    const comOculta = [...pagina, texto('t-o', 'Oculta', 'x', undefined, { visible: false })]
    const r = analisarSlotFields(comOculta, { paginaPodeSerSubstituida: true })
    expect(r.slotFields[0].semantic.slot).toEqual({ status: 'declared', id: 'servico-endereco' })
    expect(r.slotFields[0].semantic.role).toMatchObject({ status: 'declared', value: 'servico', occurrences: 2, ambiguous: true })
    expect(r.slotFields[2].semantic.role).toMatchObject({ status: 'inferred', value: 'headline' })
    expect(r.slotFields[3].semantic.problems).toEqual([{ code: 'LAYER_HIDDEN' }, { code: 'PAGE_MAY_CHANGE_BY_LAYOUT' }])
  })

  it('não é corrupção: nenhum semanticIssue a mais', () => {
    expect(analisarSlotFields(pagina, { paginaPodeSerSubstituida: true }).semanticIssues).toEqual(analisarSlotFields(pagina).semanticIssues)
    expect(analisarSlotFields(pagina, { paginaPodeSerSubstituida: true }).semanticIssues).toEqual([])
  })
})

describe('B1c: slotId e semanticRole entram em addressableBy — com as mesmas portas da escrita', () => {
  const ab = (camadas: any[], ctx = {}) => analisarSlotFields(camadas, ctx).slotFields.map((f) => f.semantic.addressableBy)

  it('slot válido e único + papel DECLARADO e único: os três endereços', () => {
    expect(ab([texto('t1', 'Título', 'a', papel('headline', 'manchete'))])).toEqual([['layerId', 'slotId', 'semanticRole']])
  })

  it('papel INFERIDO (pelo nome) não é prometido: a escrita recusa (PAPEL_NAO_DECLARADO)', () => {
    expect(ab([texto('t1', 'headline', 'a')])).toEqual([['layerId']])
  })

  it('papel declarado repetido: semanticRole fora (ambíguo), o slot de cada um continua', () => {
    expect(ab([texto('t1', 'A', 'a', papel('servico', 's1')), texto('t2', 'B', 'b', papel('servico', 's2'))])).toEqual([
      ['layerId', 'slotId'],
      ['layerId', 'slotId'],
    ])
  })

  it('slot duplicado: slotId fora', () => {
    expect(ab([texto('t1', 'A', 'a', { slot: { id: 's' } }), texto('t2', 'B', 'b', { slot: { id: 's' } })])).toEqual([['layerId'], ['layerId']])
  })

  it('id sombreado por nome tira só o layerId: slot e papel não passam pela chave legada', () => {
    expect(ab([texto('x', 'A', 'a', papel('headline', 'manchete')), texto('y', 'x', 'b')])).toEqual([['slotId', 'semanticRole'], ['layerId']])
  })

  it('oculta, tipo que não desenha e família "(3 layouts)": nenhum endereço', () => {
    expect(ab([texto('t1', 'A', 'a', papel('headline', 'm'), { visible: false })])).toEqual([[]])
    expect(ab([{ id: 's1', name: 'F', type: 'shape', metadata: { slot: { id: 'f' } } }])).toEqual([[]])
    expect(ab([texto('t1', 'A', 'a', papel('headline', 'm'))], { paginaPodeSerSubstituida: true })).toEqual([[]])
  })

  it('imagem com slot e papel foto declarado: os três', () => {
    expect(ab([{ id: 'i1', name: 'Foto', type: 'image', isDynamic: true, visible: true, metadata: { compositor: { papel: 'foto' }, slot: { id: 'foto-1' } } }])).toEqual([['layerId', 'slotId', 'semanticRole']])
  })
})
