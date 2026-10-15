import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { resolverValoresSemanticos, validarEntradaSemantica, valorLegadoValido, validarFormatoDosSlotValues, validarEnderecosDosSlotValues } from '../resolver-valores'
import { camada } from './fixtures'

const papel = (p: string, slot?: string) => ({ compositor: { papel: p }, ...(slot ? { slot: { id: slot } } : {}) })

/** Página: headline com slot, dois `servico` com slots, um CTA sem slot. */
const pagina: Layer[] = [
  camada({ id: 'text-h', name: 'Título', metadata: papel('headline', 'titulo') }),
  camada({ id: 'text-e', name: 'Endereço', metadata: papel('servico', 'servico-endereco') }),
  camada({ id: 'text-o', name: 'Horário', metadata: papel('servico', 'servico-horario') }),
  camada({ id: 'text-c', name: 'cta-botao', metadata: papel('cta') }),
]

const codigos = (r: ReturnType<typeof resolverValoresSemanticos>) => r.erros.map((e) => e.codigo)

describe('resolverValoresSemanticos — só lê _slots e _papeis', () => {
  it('sem _slots nem _papeis: nada resolvido, nada de erro (o legado fica com o caminho de sempre)', () => {
    const r = resolverValoresSemanticos(pagina, { 'text-h': 'legado', headline: 'legado' })
    expect(r).toEqual({ valores: new Map(), erros: [], avisos: [] })
  })

  it('_slots: cada chave é um slotId → valor pelo ÍNDICE, com a origem', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { 'servico-horario': 'Ter a dom' } })
    expect(r.erros).toEqual([])
    expect([...r.valores.entries()]).toEqual([[2, { indice: 2, valor: 'Ter a dom', origem: { tipo: 'slotId', chave: 'servico-horario' } }]])
  })

  it('_papeis: papel único resolve, e o valor original (objeto) é preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { cta: { content: 'Reserve' } } })
    expect(r.valores.get(3)).toEqual({ indice: 3, valor: { content: 'Reserve' }, origem: { tipo: 'semanticRole', chave: 'cta' } })
  })

  it('não aplica nada: as camadas de entrada saem intocadas', () => {
    const antes = JSON.stringify(pagina)
    resolverValoresSemanticos(pagina, { _slots: { titulo: 'X' }, _papeis: { cta: 'Y' } })
    expect(JSON.stringify(pagina)).toBe(antes)
  })

  it('"" é valor fornecido e é preservado como veio (a aplicação decide por caminho)', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: { titulo: '' } }).valores.get(0)?.valor).toBe('')
  })
})

describe('erros de endereçamento: estruturados, sem escolher camada', () => {
  it('papel repetido → AMBIGUOUS_TARGET do resolverAlvo, com os candidatos', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { servico: 'X' } })
    expect(r.valores.size).toBe(0)
    expect(r.erros).toEqual([
      expect.objectContaining({ codigo: 'ALVO_NAO_RESOLVIDO', origem: { tipo: 'semanticRole', chave: 'servico' }, erro: expect.objectContaining({ codigo: 'AMBIGUOUS_TARGET' }) }),
    ])
  })

  it('slot inexistente → SLOT_NOT_FOUND preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { 'servico-telefone': 'X' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'ALVO_NAO_RESOLVIDO', erro: { codigo: 'SLOT_NOT_FOUND', slotId: 'servico-telefone' } })
  })

  it('papel fora do vocabulário → PAPEL_DESCONHECIDO preservado', () => {
    const r = resolverValoresSemanticos(pagina, { _papeis: { preco: 'X' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'ALVO_NAO_RESOLVIDO', erro: { codigo: 'PAPEL_DESCONHECIDO' } })
  })

  it('um erro não impede as outras entradas de resolverem (quem chama decide recusar o todo)', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'T', nada: 'X' } })
    expect(codigos(r)).toEqual(['ALVO_NAO_RESOLVIDO'])
    expect(r.valores.get(0)?.valor).toBe('T')
  })
})

describe('validação estrutural', () => {
  it('_slots que não é objeto → ENTRADA_INVALIDA', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: 'titulo' }))).toEqual(['ENTRADA_INVALIDA'])
    expect(codigos(resolverValoresSemanticos(pagina, { _papeis: ['cta'] }))).toEqual(['ENTRADA_INVALIDA'])
  })

  it('_slots null ou ausente → como ausente (a regra ?? do legado)', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: null, _papeis: undefined }).erros).toEqual([])
  })

  it('valor que não é string nem objeto → VALOR_INVALIDO', () => {
    for (const valor of [3, true, null, ['x']]) {
      expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: valor } }))).toEqual(['VALOR_INVALIDO'])
    }
  })
})

describe('conflito entre _slots e _papeis na MESMA camada', () => {
  it('mesmo valor → uma resolução só, sem erro (a origem mais forte, slotId, fica)', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: 'A' } })
    expect(r.erros).toEqual([])
    expect([...r.valores.values()]).toEqual([{ indice: 0, valor: 'A', origem: { tipo: 'slotId', chave: 'titulo' } }])
  })

  it('string e { content } com o mesmo texto não vazio são equivalentes', () => {
    expect(resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: { content: 'A' } } }).erros).toEqual([])
  })

  it('valores diferentes → VALOR_CONFLITANTE com as duas origens, e nenhum valor para a camada', () => {
    const r = resolverValoresSemanticos(pagina, { _slots: { titulo: 'A' }, _papeis: { headline: 'B' } })
    expect(r.valores.has(0)).toBe(false)
    expect(r.erros).toEqual([
      { codigo: 'VALOR_CONFLITANTE', indice: 0, layerId: 'text-h', origens: [{ tipo: 'slotId', chave: 'titulo' }, { tipo: 'semanticRole', chave: 'headline' }] },
    ])
  })

  it('"" NÃO equivale a { content: "" } (semânticas diferentes no render)', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: '' }, _papeis: { headline: { content: '' } } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('objeto com chave fora do contrato semântico é VALOR_INVALIDO (fail-closed), nunca entra na comparação', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { _slots: { titulo: { content: 'A', x: 1 } }, _papeis: { headline: { content: 'A', x: 1 } } }))).toEqual(['VALOR_INVALIDO', 'VALOR_INVALIDO'])
  })
})

describe('conflito com a chave LEGADA explicitamente enviada para a mesma camada', () => {
  it('chave pelo id com outro valor → VALOR_CONFLITANTE', () => {
    const r = resolverValoresSemanticos(pagina, { 'text-h': 'A', _slots: { titulo: 'B' } })
    expect(r.erros).toEqual([{ codigo: 'VALOR_CONFLITANTE', indice: 0, layerId: 'text-h', origens: [{ tipo: 'layerId', chave: 'text-h' }, { tipo: 'slotId', chave: 'titulo' }] }])
  })

  it('chave pelo nome com outro valor → VALOR_CONFLITANTE', () => {
    const r = resolverValoresSemanticos(pagina, { 'cta-botao': 'A', _papeis: { cta: 'B' } })
    expect(r.erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: 'cta-botao' }, { tipo: 'semanticRole', chave: 'cta' }] })
  })

  it('chave legada com valor equivalente → sem conflito', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': 'A', _slots: { titulo: { content: 'A' } } }).erros).toEqual([])
  })

  it('chave legada "" é FORNECIDA (não é ausente): conflita com um valor semântico diferente', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': '', _slots: { titulo: 'B' } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('chave legada null/undefined é ausente (a regra ?? do legado)', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': null, Título: undefined, _slots: { titulo: 'B' } }).erros).toEqual([])
  })

  it('chave legada para OUTRA camada não conflita', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-c': 'A', _slots: { titulo: 'B' } }).erros).toEqual([])
  })
})

describe('revisão adversarial B1a', () => {
  it('F1: só a fonte legada EFETIVA (id ?? nome) conta — nome ignorado pelo legado não gera conflito falso', () => {
    // o legado aplica 'A' (o id vence); 'B' pelo nome nunca chega a esta camada
    expect(resolverValoresSemanticos(pagina, { 'text-h': 'A', Título: 'B', _slots: { titulo: 'A' } }).erros).toEqual([])
  })

  it('F1: sem chave pelo id, o nome É a fonte efetiva e conflita', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { Título: 'B', _slots: { titulo: 'A' } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('F2: o índice é a posição no ARRAY RECEBIDO, não a ordem de desenho (`order`)', () => {
    const foraDeOrdem = [
      camada({ id: 'b', order: 1, metadata: papel('apoio', 'apoio') }),
      camada({ id: 'a', order: 0, metadata: papel('headline', 'titulo') }),
    ]
    const r = resolverValoresSemanticos(foraDeOrdem, { _slots: { titulo: 'X' } })
    expect([...r.valores.keys()]).toEqual([1])
    expect(foraDeOrdem[1].id).toBe('a')
  })
})

describe('contrato SEMÂNTICO: string ou { content?, fileUrl? } — fail-closed', () => {
  // a validade ESTRUTURAL do contrato (o tipo da camada é outra regra, testada à parte)
  const valida = (valor: unknown) => validarEntradaSemantica({ _slots: { titulo: valor } }).map((e) => e.codigo)

  it('válidos', () => {
    for (const v of ['X', '', { content: 'X' }, { content: '' }, { fileUrl: 'https://x' }, { content: 'X', fileUrl: 'https://x' }]) {
      expect(valida(v)).toEqual([])
    }
  })

  it('papel e bloco são identidade interna: inválidos no contrato semântico', () => {
    expect(valida({ papel: 'cta' })).toEqual(['VALOR_INVALIDO'])
    expect(valida({ bloco: 'b1' })).toEqual(['VALOR_INVALIDO'])
    expect(valida({ content: 'X', papel: 'cta' })).toEqual(['VALOR_INVALIDO'])
  })

  it('chave desconhecida, objeto vazio, array e null: inválidos', () => {
    for (const v of [{ banana: 123 }, {}, ['x'], null]) expect(valida(v)).toEqual(['VALOR_INVALIDO'])
  })

  it('tipos errados e operações sem efeito: inválidos', () => {
    for (const v of [{ content: 3 }, { fileUrl: '' }, { fileUrl: 7 }]) expect(valida(v)).toEqual(['VALOR_INVALIDO'])
  })

  it('hidden NÃO faz parte do contrato semântico (a via do render não o aplica): inválido, true ou false', () => {
    for (const v of [{ hidden: true }, { hidden: false }, { content: 'X', hidden: true }]) expect(valida(v)).toEqual(['VALOR_INVALIDO'])
  })
})

describe('a fonte legada espelha o casamento real (id ?? nome), inclusive com "_"', () => {
  // Imagem: texto em chave visual "_…" é CHAVE_VISUAL_RESERVADA (Codex #208); o espelho da fonte legada se prova com fileUrl.
  const comUnderscore: Layer[] = [camada({ id: '_x', name: '_n', type: 'image', metadata: papel('foto', 'titulo') })]

  it('id com "_" é fonte legada efetiva → conflita', () => {
    expect(resolverValoresSemanticos(comUnderscore, { _x: { fileUrl: 'A' }, _slots: { titulo: { fileUrl: 'B' } } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'layerId', chave: '_x' }, { tipo: 'slotId', chave: 'titulo' }] })
  })

  it('name com "_" sem id → fonte efetiva → conflita', () => {
    expect(resolverValoresSemanticos(comUnderscore, { _n: { fileUrl: 'A' }, _slots: { titulo: { fileUrl: 'B' } } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: '_n' }, { tipo: 'slotId', chave: 'titulo' }] })
  })

  it('id null deixa o nome ser a fonte efetiva', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': null, Título: 'B', _slots: { titulo: 'A' } }).erros[0]).toMatchObject({ codigo: 'VALOR_CONFLITANTE', origens: [{ tipo: 'name', chave: 'Título' }, { tipo: 'slotId', chave: 'titulo' }] })
  })
})

describe('_slots e _papeis são reservados: não podem colidir com id/name de layer', () => {
  it('layer com id "_slots" e o contrato novo em uso → CHAVE_RESERVADA_COLIDE_COM_LAYER, nada resolvido daquele campo', () => {
    const colide: Layer[] = [...pagina, camada({ id: '_slots', name: 'x' })]
    const r = resolverValoresSemanticos(colide, { _slots: { titulo: 'A' } })
    expect(r.erros).toEqual([{ codigo: 'CHAVE_RESERVADA_COLIDE_COM_LAYER', chave: '_slots', indice: 4, layerId: '_slots' }])
    expect(r.valores.size).toBe(0)
  })

  it('layer com name "_papeis" também colide', () => {
    const colide: Layer[] = [...pagina, camada({ id: 'l9', name: '_papeis' })]
    expect(codigos(resolverValoresSemanticos(colide, { _papeis: { cta: 'A' } }))).toEqual(['CHAVE_RESERVADA_COLIDE_COM_LAYER'])
  })

  it('sem o campo reservado em uso, a layer de nome reservado não é problema desta função', () => {
    const colide: Layer[] = [...pagina, camada({ id: 'l9', name: '_papeis' })]
    expect(resolverValoresSemanticos(colide, { _slots: { titulo: 'A' } }).erros).toEqual([])
  })
})

describe('equivalência legado ↔ semântico pelo EFEITO editável', () => {
  it('legado com papel/bloco internos e o mesmo content não conflita', () => {
    expect(resolverValoresSemanticos(pagina, { 'text-h': { content: 'Reserve', papel: 'headline', bloco: 'b1' }, _slots: { titulo: { content: 'Reserve' } } }).erros).toEqual([])
    expect(resolverValoresSemanticos(pagina, { 'text-h': { content: 'Reserve', papel: 'headline' }, _slots: { titulo: 'Reserve' } }).erros).toEqual([])
  })

  it('diferenças reais continuam conflito: content, fileUrl, hidden', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': { content: 'A', papel: 'headline' }, _slots: { titulo: { content: 'B' } } }))).toEqual(['VALOR_CONFLITANTE'])
    const comImagem: Layer[] = [camada({ id: 'img', type: 'image', metadata: { slot: { id: 'foto' } } })]
    expect(codigos(resolverValoresSemanticos(comImagem, { img: { fileUrl: 'https://a' }, _slots: { foto: { fileUrl: 'https://b' } } }))).toEqual(['VALOR_CONFLITANTE'])
    // hidden LEGADO é efeito real (a camada some): não equivale ao mesmo content sem ele
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': { content: 'A', hidden: true }, _slots: { titulo: { content: 'A' } } }))).toEqual(['VALOR_CONFLITANTE'])
  })

  it('"" × { content: "" } continua conflito, também contra o legado', () => {
    expect(codigos(resolverValoresSemanticos(pagina, { 'text-h': '', _slots: { titulo: { content: '' } } }))).toEqual(['VALOR_CONFLITANTE'])
  })
})

describe('B1c — validarEntradaSemantica: a parte estrutural, sem página', () => {
  it('valida só a forma de _slots/_papeis e o ValorSemantico — os mesmos códigos do resolvedor', async () => {
    const { validarEntradaSemantica } = await import('../resolver-valores')
    expect(validarEntradaSemantica({ _slots: { a: 'x' }, _papeis: { cta: { content: 'y' } } })).toEqual([])
    expect(validarEntradaSemantica({ _slots: 'x' }).map((e) => e.codigo)).toEqual(['ENTRADA_INVALIDA'])
    expect(validarEntradaSemantica({ _slots: { a: { papel: 'cta' } } }).map((e) => e.codigo)).toEqual(['VALOR_INVALIDO'])
    expect(validarEntradaSemantica({ titulo: 'legado' })).toEqual([])
  })
})

describe('B1c — PAPEL_NAO_DECLARADO: _papeis só escreve em papel declarado em metadata', () => {
  it('papel inferido pelo id resolve no resolverAlvo, mas a escrita recusa', () => {
    const inferido: Layer[] = [camada({ id: 'cta', name: 'Botão' })]
    expect(resolverValoresSemanticos(inferido, { _papeis: { cta: 'Reserve' } }).erros).toEqual([
      { codigo: 'PAPEL_NAO_DECLARADO', origem: { tipo: 'semanticRole', chave: 'cta' }, layerId: 'cta' },
    ])
  })

  it('papel inferido pelo nome, pelo tipo e pelo id reservado também recusam', () => {
    const r1 = resolverValoresSemanticos([camada({ id: 't1', name: 'headline' })], { _papeis: { headline: 'X' } })
    const r2 = resolverValoresSemanticos([camada({ id: 'l1', type: 'logo' })], { _papeis: { logo: { fileUrl: 'https://x' } } })
    const r3 = resolverValoresSemanticos([camada({ id: 'bg-foto', type: 'image' })], { _papeis: { foto: { fileUrl: 'https://x' } } })
    for (const r of [r1, r2, r3]) expect(r.erros.map((e) => e.codigo)).toEqual(['PAPEL_NAO_DECLARADO'])
  })

  it('papel declarado escreve', () => {
    expect(resolverValoresSemanticos(pagina, { _papeis: { cta: 'Reserve' } }).erros).toEqual([])
  })
})

describe('B1c — VALOR_INCOMPATIVEL_COM_CAMADA: o efeito pedido tem de ser desenhado pelo tipo', () => {
  const misto: Layer[] = [
    camada({ id: 't1', metadata: papel('headline', 'titulo') }),
    camada({ id: 'r1', type: 'rich-text', metadata: { slot: { id: 'rico' } } }),
    camada({ id: 'i1', type: 'image', metadata: { slot: { id: 'foto' } } }),
  ]
  const erroDe = (slotValues: Record<string, unknown>) => resolverValoresSemanticos(misto, slotValues).erros

  it('string e { content } em texto: ok; { fileUrl } em imagem: ok', () => {
    expect(erroDe({ _slots: { titulo: 'X', foto: { fileUrl: 'https://x' } } })).toEqual([])
    expect(erroDe({ _slots: { titulo: { content: 'Y' } } })).toEqual([])
  })

  it('rich-text em quarentena (#209): content pelo contrato novo é incompatível', () => {
    expect(erroDe({ _slots: { rico: { content: 'Y' } } })[0]).toMatchObject({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: 'r1', type: 'rich-text', efeito: 'content' })
  })

  it('{ fileUrl } em texto → incompatível, com o efeito e sem a URL', () => {
    const e = erroDe({ _slots: { titulo: { fileUrl: 'https://segredo' } } })
    expect(e).toEqual([{ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', layerId: 't1', type: 'text', origem: { tipo: 'slotId', chave: 'titulo' }, efeito: 'fileUrl' }])
    expect(JSON.stringify(e)).not.toContain('segredo')
  })

  it('string ou { content } em imagem → incompatível', () => {
    expect(erroDe({ _slots: { foto: 'texto' } })[0]).toMatchObject({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', type: 'image', efeito: 'content' })
    expect(erroDe({ _slots: { foto: { content: 'x' } } })[0]).toMatchObject({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', efeito: 'content' })
  })

  it('{ content, fileUrl } → incompatível em qualquer camada', () => {
    expect(erroDe({ _slots: { titulo: { content: 'x', fileUrl: 'https://x' } } })[0]).toMatchObject({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', efeito: 'content+fileUrl' })
    expect(erroDe({ _slots: { foto: { content: 'x', fileUrl: 'https://x' } } })[0]).toMatchObject({ codigo: 'VALOR_INCOMPATIVEL_COM_CAMADA', efeito: 'content+fileUrl' })
  })
})

describe('B1c (revisão adversarial): camada oculta não recebe valor semântico', () => {
  it('CAMADA_OCULTA: o valor seria gravado e o render pularia a camada', () => {
    const camadas = [{ id: 'h', name: 'T', type: 'text', visible: false, metadata: { slot: { id: 's' } } }] as never
    const r = resolverValoresSemanticos(camadas, { _slots: { s: 'x' } })
    expect(r.erros).toEqual([{ codigo: 'CAMADA_OCULTA', layerId: 'h', origem: { tipo: 'slotId', chave: 's' } }])
    expect(r.valores.size).toBe(0)
  })
})

describe('Codex #208 — CP5 (fail-closed): texto semântico em camada com chave visual "_…" é recusado', () => {
  it('nome "_n": CHAVE_VISUAL_RESERVADA (os leitores da copy descartariam o texto)', () => {
    const camadas = [{ id: '_x', name: '_n', type: 'text', visible: true, metadata: { slot: { id: 's' } } }] as never
    const r = resolverValoresSemanticos(camadas, { _slots: { s: 'x' } })
    expect(r.erros).toEqual([{ codigo: 'CHAVE_VISUAL_RESERVADA', layerId: '_x', origem: { tipo: 'slotId', chave: 's' } }])
  })
  it('sem nome e id "_x": a chave visual é o id — recusado', () => {
    const camadas = [{ id: '_x', type: 'text', visible: true, metadata: { slot: { id: 's' } } }] as never
    expect(resolverValoresSemanticos(camadas, { _slots: { s: 'x' } }).erros[0]).toMatchObject({ codigo: 'CHAVE_VISUAL_RESERVADA' })
  })
  it('id "_x" com nome legível: aceito (a chave visual é o nome)', () => {
    const camadas = [{ id: '_x', name: 'Título', type: 'text', visible: true, metadata: { slot: { id: 's' } } }] as never
    expect(resolverValoresSemanticos(camadas, { _slots: { s: 'x' } }).erros).toEqual([])
  })
  it('imagem com nome "_n" e {fileUrl}: aceito (não é copy)', () => {
    const camadas = [{ id: 'i', name: '_n', type: 'image', visible: true, metadata: { slot: { id: 's' } } }] as never
    expect(resolverValoresSemanticos(camadas, { _slots: { s: { fileUrl: 'https://f' } } }).erros).toEqual([])
  })
})

describe('CP4.2b — validação do legado de slotValues (uma fonte só, em duas fases)', () => {
  it('valorLegadoValido: string (qualquer), ou objeto não vazio só com content/fileUrl/hidden:true/papel/bloco; o resto é inválido', () => {
    for (const ok of ['x', '', '   ', '.', { content: '' }, { content: 'x' }, { fileUrl: 'https://f' }, { hidden: true }, { papel: 'cta' }, { bloco: 'b' }, { content: 'x', hidden: true }, { content: 'x', papel: 'cta', bloco: 'b' }]) expect(valorLegadoValido(ok)).toBe(true)
    for (const ruim of [123, 0, true, false, null, undefined, [], ['x'], {}, { hidden: 'true' }, { hidden: 1 }, { visible: false }, { text: 'x' }, { content: 123 }, { fileUrl: '' }, { papel: '' }, { content: 'x', visible: false }]) expect(valorLegadoValido(ruim)).toBe(false)
  })
  it('FASE 1 (sem página): legado inválido → VALOR_INVALIDO com origem { tipo: "chave" }; controles de foto só string não vazia (ausente/null = não fornecido); outro `_…` → CHAVE_DESCONHECIDA; _slots/_papeis ficam com a semântica', () => {
    expect(validarFormatoDosSlotValues({ cta: 'x', Chamada: { content: 'y' }, headline: { hidden: true } })).toEqual([])
    expect(validarFormatoDosSlotValues({ cta: 123, headline: ['x'], apoio: { visible: false } })).toEqual([
      { codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'cta' } },
      { codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'headline' } },
      { codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'apoio' } },
    ])
    expect(validarFormatoDosSlotValues({ cta: null })).toEqual([{ codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'cta' } }])
    expect(validarFormatoDosSlotValues({ _imageUrl: 'https://f', _driveImageId: 'd1', _slots: { x: 123 }, _papeis: null })).toEqual([])
    expect(validarFormatoDosSlotValues({ _imageUrl: 123, _driveImageId: '' })).toEqual([
      { codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: '_imageUrl' } },
      { codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: '_driveImageId' } },
    ])
    expect(validarFormatoDosSlotValues({ _qualquer: 'x' })).toEqual([{ codigo: 'CHAVE_DESCONHECIDA', origem: { tipo: 'chave', chave: '_qualquer' } }])
    // Misto: todos os erros vêm na lista (o pedido inteiro é recusado por quem chama).
    expect(validarFormatoDosSlotValues({ cta: 'Novo', headline: 123, _x: 1 }).map((e) => e.codigo)).toEqual(['VALOR_INVALIDO', 'CHAVE_DESCONHECIDA'])
  })
  it('FASE 2 (com as camadas): chave que não é id nem nome de camada → CHAVE_DESCONHECIDA; V18: id de uma camada e nome de outra, por CAMADA, sem prioridade global', () => {
    const camadas = [
      { id: 'cta', name: 'Chamada' },
      { id: 'b', name: 'cta' },
      { id: 'c', name: 'Rodape' },
    ]
    expect(validarEnderecosDosSlotValues({ cta: 'x', Rodape: 'y', Chamada: { hidden: true } }, camadas)).toEqual([])
    expect(validarEnderecosDosSlotValues({ naoExiste: 'x', cta: 'y', _slots: { a: 1 }, _imageUrl: 'u' }, camadas)).toEqual([{ codigo: 'CHAVE_DESCONHECIDA', origem: { tipo: 'chave', chave: 'naoExiste' } }])
  })
})
