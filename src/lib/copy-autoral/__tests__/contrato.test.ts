import { describe, expect, it } from 'vitest'
import {
  CopyLegadaIncompativel,
  HistoricoDaCopyCheio,
  MAX_REVISOES_DA_COPY,
  VERSAO_DO_CONTRATO,
  aplicarRevisao,
  autorDoBloco,
  blocosEmOrdem,
  blocosParaOCompositor,
  converterBlocosLegados,
  converterListaLegada,
  copyComparavel,
  copyDeBlocosLegados,
  copyDeListaLegada,
  diferencasDeBlocos,
  gruposDeLeitura,
  historicoCheio,
  lerCopyAutoral,
  mesmaCopy,
  serializarCopyAutoral,
  validarCopyAutoral,
  type BlocoAutoral,
  type CopyAutoral,
} from '..'

const copy: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'pre', funcao: 'pre', grupoDeLeitura: 'frase-1', ordem: 0, linhas: ['Na sexta o'] },
    { id: 'headline', funcao: 'headline', grupoDeLeitura: 'frase-1', ordem: 1, linhas: ['Milk-shake', 'vem [em dobro]'], estilo: { linhasNaVoz2: [1] } },
    { id: 'apoio', funcao: 'apoio', ordem: 2, linhas: ['Praia do Canto e Shopping Vitória,', 'durante todo o horário de funcionamento'] },
    { id: 'servico', funcao: 'servico', ordem: 3, linhas: ['Seg a sáb · 11h às 22h'], fatos: [{ entradaId: 'kb-horario', trecho: '11h às 22h' }] },
  ],
  revisoes: [],
}

describe('o contrato da copy autoral — ida e volta EXATA', () => {
  it('serializa e volta idêntico: caixa mista, acento, quebra e [colchetes] preservados', () => {
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(copy))
    expect(problemas).toEqual([])
    expect(lida).toEqual(copy)
    expect(lida!.blocos[1].linhas).toEqual(['Milk-shake', 'vem [em dobro]'])
    expect(lida!.blocos[2].linhas[0]).toBe('Praia do Canto e Shopping Vitória,')
    expect(mesmaCopy(copy, lida!)).toBe(true)
  })

  it('caixa e acento diferentes NÃO são a mesma copy', () => {
    const gritada = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['MILK-SHAKE', 'vem [em dobro]'] } : b)) }
    const semAcento = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'apoio' ? { ...b, linhas: ['Praia do Canto e Shopping Vitoria,', b.linhas[1]] } : b)) }
    expect(mesmaCopy(copy, gritada)).toBe(false)
    expect(mesmaCopy(copy, semAcento)).toBe(false)
  })

  it('a ordem do array não é contrato: blocosEmOrdem segue `ordem`', () => {
    const embaralhada = { ...copy, blocos: [copy.blocos[3], copy.blocos[1], copy.blocos[0], copy.blocos[2]] }
    expect(validarCopyAutoral(embaralhada).problemas).toEqual([])
    expect(blocosEmOrdem(embaralhada).map((b) => b.id)).toEqual(['pre', 'headline', 'apoio', 'servico'])
    expect(mesmaCopy(copy, embaralhada)).toBe(true)
  })

  it('campo OMITIDO ≠ bloco VAZIO: o bloco vazio existe, com id, e volta vazio', () => {
    const comVazio = { ...copy, blocos: [...copy.blocos, { id: 'cta', funcao: 'cta' as const, ordem: 4, linhas: [] }] }
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(comVazio))
    expect(problemas).toEqual([])
    expect(lida!.blocos.find((b) => b.id === 'cta')?.linhas).toEqual([])
    expect(copy.blocos.some((b) => b.id === 'cta')).toBe(false)
  })

  it('grupos de leitura: o pré-título e a manchete formam UMA frase declarada pelo autor', () => {
    const grupos = gruposDeLeitura(copy)
    expect(grupos[0]).toMatchObject({ grupo: 'frase-1', declarado: true })
    expect(grupos[0].blocos.map((b) => b.id)).toEqual(['pre', 'headline'])
    expect(grupos.map((g) => g.blocos.length)).toEqual([2, 1, 1])
  })

  it('grupo declarado com nome parecido com um id não engole o bloco independente (F03)', () => {
    const c: CopyAutoral = {
      ...copy,
      blocos: [
        // Grupo declarado com o MESMO nome que o id de um bloco independente:
        // a chave interna (prefixos "g" e "solo") separa os dois. O nome do
        // grupo é livre — "_aviso" também vale (teste R01).
        { id: 'a', funcao: 'pre', grupoDeLeitura: 'aviso', ordem: 0, linhas: ['a'] },
        { id: 'b', funcao: 'headline', grupoDeLeitura: 'aviso', ordem: 1, linhas: ['b'] },
        { id: 'aviso', funcao: 'apoio', ordem: 2, linhas: ['c'] },
      ],
    }
    expect(validarCopyAutoral(c).problemas).toEqual([])
    const grupos = gruposDeLeitura(c)
    expect(grupos.map((g) => [g.declarado, g.blocos.map((b) => b.id)])).toEqual([[true, ['a', 'b']], [false, ['aviso']]])
  })

  it('mesmaCopy não depende da ordem das propriedades do estilo (F04)', () => {
    const a = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, estilo: { herdaDe: 'headline' as const, linhasNaVoz2: [1] } } : b)) }
    const b = { ...copy, blocos: copy.blocos.map((x) => (x.id === 'headline' ? { ...x, estilo: { linhasNaVoz2: [1], herdaDe: 'headline' as const } } : x)) }
    expect(mesmaCopy(a, b)).toBe(true)
    const c = { ...copy, blocos: copy.blocos.map((x) => (x.id === 'headline' ? { ...x, estilo: { linhasNaVoz2: [0], herdaDe: 'headline' as const } } : x)) }
    expect(mesmaCopy(a, c)).toBe(false)
  })

  it('a segunda voz alcança qualquer linha que exista no bloco (F05)', () => {
    const sete = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['1', '2', '3', '4', '5', '6', '7'], estilo: { linhasNaVoz2: [6] } } : b)) }
    expect(validarCopyAutoral(sete).problemas).toEqual([])
    const doze = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: Array.from({ length: 12 }, (_, i) => String(i)), estilo: { linhasNaVoz2: [11] } } : b)) }
    expect(validarCopyAutoral(doze).problemas).toEqual([])
    const fora = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['1', '2'], estilo: { linhasNaVoz2: [7] } } : b)) }
    expect(validarCopyAutoral(fora).problemas.some((p) => p.tipo === 'estilo')).toBe(true)
  })
})

describe('validação: o que o schema não vê', () => {
  it('id duplicado', () => {
    const dup = { ...copy, blocos: [...copy.blocos, { id: 'apoio', funcao: 'apoio' as const, ordem: 4, linhas: ['outro'] }] }
    const r = validarCopyAutoral(dup)
    expect(r.copy).toBeNull()
    expect(r.problemas.map((p) => p.tipo)).toContain('id')
  })

  it('ordem repetida e ordem com buraco', () => {
    const repetida = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'servico' ? { ...b, ordem: 2 } : b)) }
    const buraco = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'servico' ? { ...b, ordem: 7 } : b)) }
    expect(validarCopyAutoral(repetida).problemas.some((p) => p.tipo === 'ordem' && /repetida/.test(p.mensagem))).toBe(true)
    expect(validarCopyAutoral(buraco).problemas.some((p) => p.tipo === 'ordem' && /buraco/.test(p.mensagem))).toBe(true)
  })

  it('grupo de leitura com um bloco só, voz 2 fora da manchete e voz 2 apontando para linha inexistente', () => {
    const grupoSolto = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'pre' ? { ...b, grupoDeLeitura: 'sozinho' } : b)) }
    expect(validarCopyAutoral(grupoSolto).problemas.some((p) => p.tipo === 'grupo')).toBe(true)
    const voz2NoApoio = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'apoio' ? { ...b, estilo: { linhasNaVoz2: [0] } } : b)) }
    expect(validarCopyAutoral(voz2NoApoio).problemas.some((p) => p.tipo === 'estilo')).toBe(true)
    const voz2Fora = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'headline' ? { ...b, estilo: { linhasNaVoz2: [5] } } : b)) }
    expect(validarCopyAutoral(voz2Fora).problemas.some((p) => p.tipo === 'estilo')).toBe(true)
  })

  it('revisão que cita bloco inexistente; id com espaço recusado pelo schema; JSON ilegível', () => {
    const revisaoRuim = { ...copy, revisoes: [{ em: '2026-09-12T11:00:00.000Z', autor: 'equipe' as const, motivo: 'x', blocos: ['fantasma'] }] }
    expect(validarCopyAutoral(revisaoRuim).problemas.some((p) => p.tipo === 'revisao')).toBe(true)
    const idRuim = { ...copy, blocos: copy.blocos.map((b) => (b.id === 'pre' ? { ...b, id: 'pré título' } : b)) }
    expect(validarCopyAutoral(idRuim).problemas[0].tipo).toBe('schema')
    expect(lerCopyAutoral('{isto não é json').problemas[0].mensagem).toBe('JSON ilegível')
  })

  it('todos os problemas voltam de uma vez, não só o primeiro', () => {
    const varios = { ...copy, blocos: [...copy.blocos.map((b) => (b.id === 'pre' ? { ...b, grupoDeLeitura: 'sozinho' } : b)), { id: 'apoio', funcao: 'apoio' as const, ordem: 2, linhas: ['x'] }] }
    const tipos = validarCopyAutoral(varios).problemas.map((p) => p.tipo)
    expect(tipos).toContain('id')
    expect(tipos).toContain('ordem')
    expect(tipos).toContain('grupo')
  })
})

describe('revisões: autor, data e motivo em toda mudança', () => {
  it('mudar caixa ou acento é revisão (o diff é EXATO), e o autor do bloco passa a ser quem mexeu', () => {
    const novos = copy.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['MILK-SHAKE', 'vem [em dobro]'] } : b))
    const { copy: revisada, mudancas } = aplicarRevisao(copy, novos, { autor: 'equipe', motivo: 'a Roberta pôs a manchete em caixa alta', em: '2026-09-12T12:00:00.000Z', superficie: 'editor' })
    expect(mudancas).toEqual([{ id: 'headline', tipo: 'alterado', campos: ['linhas'], antes: ['Milk-shake', 'vem [em dobro]'], depois: ['MILK-SHAKE', 'vem [em dobro]'] }])
    expect(revisada.revisoes).toHaveLength(1)
    expect(revisada.revisoes[0]).toMatchObject({ autor: 'equipe', blocos: ['headline'], superficie: 'editor' })
    expect(autorDoBloco(revisada, 'headline').autor).toBe('equipe')
    expect(autorDoBloco(revisada, 'apoio').autor).toBe('claude')
    // a original não foi mutada
    expect(copy.revisoes).toEqual([])
    expect(copy.blocos[1].linhas[0]).toBe('Milk-shake')
  })

  it('sem mudança nenhuma não há revisão vazia; bloco tirado e bloco posto aparecem no diff', () => {
    expect(aplicarRevisao(copy, copy.blocos, { autor: 'sistema', motivo: 'nada' }).copy).toBe(copy)
    const semServico = copy.blocos.filter((b) => b.id !== 'servico').concat([{ id: 'cta', funcao: 'cta', ordem: 3, linhas: ['Vem pra cá'] }])
    const d = diferencasDeBlocos(copy, { ...copy, blocos: semServico })
    expect(d.map((m) => [m.id, m.tipo])).toEqual([['cta', 'acrescentado'], ['servico', 'removido']])
  })

  it('remover um bloco produz copy que o LEITOR aceita: a remoção fica no histórico com o que o bloco dizia (F01)', () => {
    const semServico = copy.blocos.filter((b) => b.id !== 'servico')
    const { copy: revisada } = aplicarRevisao(copy, semServico, { autor: 'equipe', motivo: 'tirou o serviço', em: '2026-09-12T13:00:00.000Z' })
    expect(revisada.revisoes[0].removidos).toEqual([{ id: 'servico', funcao: 'servico', linhas: ['Seg a sáb · 11h às 22h'] }])
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(revisada))
    expect(problemas).toEqual([])
    expect(lida!.blocos.some((b) => b.id === 'servico')).toBe(false)
    expect(autorDoBloco(lida!, 'servico').autor).toBe('equipe')
    // uma revisão que cita id sem lastro nenhum continua sendo problema
    const fantasma = { ...revisada, revisoes: [{ ...revisada.revisoes[0], blocos: ['fantasma'], removidos: undefined }] }
    expect(validarCopyAutoral(fantasma).problemas.some((p) => p.tipo === 'revisao')).toBe(true)
  })

  it('mudar só a ordem, a função, o grupo, o estilo ou os fatos É revisão, com os campos nomeados (F02)', () => {
    const casos: Array<[string, (b: (typeof copy.blocos)[number]) => (typeof copy.blocos)[number], string]> = [
      ['ordem', (b) => (b.id === 'apoio' ? { ...b, ordem: 3 } : b.id === 'servico' ? { ...b, ordem: 2 } : b), 'ordem'],
      ['estilo', (b) => (b.id === 'headline' ? { ...b, estilo: { linhasNaVoz2: [0] } } : b), 'estilo'],
      ['grupo', (b) => (b.id === 'apoio' ? { ...b, grupoDeLeitura: 'frase-1' } : b), 'grupoDeLeitura'],
      ['fatos', (b) => (b.id === 'servico' ? { ...b, fatos: [{ entradaId: 'kb-outro' }] } : b), 'fatos'],
      ['funcao', (b) => (b.id === 'apoio' ? { ...b, funcao: 'cta' as const } : b), 'funcao'],
    ]
    for (const [nome, muda, campo] of casos) {
      const { copy: revisada, mudancas } = aplicarRevisao(copy, copy.blocos.map(muda), { autor: 'claude', motivo: nome })
      expect(mudancas.length, nome).toBeGreaterThan(0)
      expect(mudancas.every((m) => m.tipo === 'alterado' && m.campos?.includes(campo as never)), nome).toBe(true)
      expect(revisada.revisoes, nome).toHaveLength(1)
      const alterado = mudancas[0].id
      expect(revisada.revisoes[0].campos?.[alterado], nome).toContain(campo)
      expect(validarCopyAutoral(revisada).problemas, nome).toEqual([])
    }
    // combinada com texto noutro bloco: os dois ids ficam registrados
    const combinada = copy.blocos.map((b) => (b.id === 'headline' ? { ...b, estilo: { linhasNaVoz2: [0] } } : b.id === 'apoio' ? { ...b, linhas: ['outro apoio'] } : b))
    const { copy: r2 } = aplicarRevisao(copy, combinada, { autor: 'equipe', motivo: 'duas' })
    expect(r2.revisoes[0].blocos.sort()).toEqual(['apoio', 'headline'])
    expect(r2.revisoes[0].campos).toEqual({ headline: ['estilo'], apoio: ['linhas'] })
    expect(autorDoBloco(r2, 'headline').autor).toBe('equipe')
  })
})

describe('adaptadores do legado: declaram o que não sabem, não inventam autoria', () => {
  it('blocos por papel (spec) → contrato, autor desconhecido, ordem pela posição, sem grupos', () => {
    const c = copyDeBlocosLegados([
      { papel: 'pre', linhas: ['Na sexta o'] },
      { papel: 'headline', linhas: ['Milk-shake', 'vem [em dobro]'] },
      { papel: 'servico', linhas: ['11h às 22h'] },
      { papel: 'servico', linhas: ['Praia do Canto'] },
    ])
    expect(validarCopyAutoral(c).problemas).toEqual([])
    expect(c.origem.autor).toBe('desconhecido')
    expect(copyComparavel(c)).toBe(false)
    expect(c.blocos.map((b) => [b.id, b.funcao, b.ordem])).toEqual([['pre', 'pre', 0], ['headline', 'headline', 1], ['servico', 'servico', 2], ['servico-2', 'servico', 3]])
    expect(c.blocos.every((b) => !b.grupoDeLeitura)).toBe(true)
    expect(c.blocos[1].linhas).toEqual(['Milk-shake', 'vem [em dobro]'])
    expect(c.lacunas?.some((l) => /autoria desconhecida/.test(l))).toBe(true)
    expect(c.lacunas?.some((l) => /grupos de leitura/.test(l))).toBe(true)
  })

  it('lista posicional (copyProposta) → contrato: função "livre" sem palpite de papel, \\n vira quebra, texto exato', () => {
    const c = copyDeListaLegada(['Almoço em família', 'Seg a sex\n11h às 15h', 'Vem pra cá'])
    expect(validarCopyAutoral(c).problemas).toEqual([])
    expect(c.blocos.map((b) => b.funcao)).toEqual(['livre', 'livre', 'livre'])
    expect(c.blocos[1].linhas).toEqual(['Seg a sex', '11h às 15h'])
    expect(c.blocos[0].linhas[0]).toBe('Almoço em família')
    expect(c.lacunas?.some((l) => /função dos blocos não informada/.test(l))).toBe(true)
    const comFuncoes = copyDeListaLegada(['Almoço em família', 'Vem pra cá'], { funcoes: ['headline', 'cta'] })
    expect(comFuncoes.blocos.map((b) => [b.id, b.funcao])).toEqual([['headline', 'headline'], ['cta', 'cta']])
    expect(comFuncoes.lacunas?.some((l) => /função dos blocos não informada/.test(l))).toBe(false)
  })

  it('papel desconhecido vira livre COM lacuna, nunca some', () => {
    const c = copyDeBlocosLegados([{ papel: 'rodape', linhas: ['x'] }])
    expect(c.blocos[0].funcao).toBe('livre')
    expect(c.lacunas?.some((l) => /papel desconhecido "rodape"/.test(l))).toBe(true)
  })

  it('contrato → blocos do compositor: só uma conversão de saída, em ordem, e o bloco livre volta em `semPapel` em vez de sumir', () => {
    const comLivre = { ...copy, blocos: [...copy.blocos, { id: 'aviso', funcao: 'livre' as const, ordem: 4, linhas: ['Só hoje'] }] }
    const { blocos, semPapel } = blocosParaOCompositor({ ...comLivre, blocos: [...comLivre.blocos].reverse() })
    expect(blocos.map((b) => b.papel)).toEqual(['pre', 'headline', 'apoio', 'servico'])
    expect(blocos[1].linhas).toEqual(['Milk-shake', 'vem [em dobro]'])
    expect(semPapel.map((b) => b.id)).toEqual(['aviso'])
  })

  it('R01: grupo de leitura com nome livre (v1) continua sendo lido, e não engole o bloco solto de nome parecido', () => {
    const c = structuredClone(copy)
    c.blocos = [
      { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Sexta é dia de'], grupoDeLeitura: '_aviso' },
      { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Rodízio'], grupoDeLeitura: '_aviso' },
      { id: 'aviso', funcao: 'livre', ordem: 2, linhas: ['Só hoje'] },
    ]
    const lida = lerCopyAutoral(serializarCopyAutoral(c))
    expect(lida.problemas).toEqual([])
    expect(lida.copy?.blocos[0].grupoDeLeitura).toBe('_aviso')
    const grupos = gruposDeLeitura(lida.copy!)
    expect(grupos.find((g) => g.declarado)?.blocos.map((b) => b.id)).toEqual(['pre', 'headline'])
    expect(grupos.find((g) => !g.declarado)?.blocos.map((b) => b.id)).toEqual(['aviso'])
  })

  it('R02: remoção registrada fora de `blocos` é recusada; a sequência equipe → sistema (remoção) relida dá autoria sistema', () => {
    const c = structuredClone(copy)
    const editada = aplicarRevisao(c, c.blocos.map((b) => (b.id === 'servico' ? { ...b, linhas: ['das 12h às 15h'] } : b)), { autor: 'equipe', motivo: 'horário' }).copy
    const removida = aplicarRevisao(editada, editada.blocos.filter((b) => b.id !== 'servico'), { autor: 'sistema', motivo: 'sem serviço nesta variante' }).copy
    const relida = lerCopyAutoral(serializarCopyAutoral(removida))
    expect(relida.problemas).toEqual([])
    expect(autorDoBloco(relida.copy!, 'servico').autor).toBe('sistema')

    const torta = JSON.parse(serializarCopyAutoral(removida)) as { revisoes: Array<{ blocos: string[] }> }
    torta.revisoes[torta.revisoes.length - 1].blocos = []
    const lida = lerCopyAutoral(torta)
    expect(lida.copy).toBeNull()
    expect(lida.problemas.some((p) => /remoção do bloco "servico"/.test(p.mensagem))).toBe(true)
  })
})

describe('PR2-01: o adaptador do legado nunca devolve contrato que o leitor rejeita', () => {
  /** Toda conversão bem-sucedida tem de sobreviver à ida e volta com o conteúdo EXATO. */
  function relidaIgual(copy: CopyAutoral) {
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(copy))
    expect(problemas).toEqual([])
    expect(lida).toEqual(copy)
  }

  it('lista: 301 caracteres numa linha é incompatibilidade explícita, com o original intacto; 300 converte exato', () => {
    const itens = ['x'.repeat(301)]
    const r = converterListaLegada(itens)
    expect(r.copy).toBeNull()
    expect(r.problemas.some((p) => p.tipo === 'schema' && p.mensagem.startsWith('blocos.0.linhas.0'))).toBe(true)
    expect(r.original).toEqual(['x'.repeat(301)])
    expect(itens).toEqual(['x'.repeat(301)])
    let erro: unknown
    try {
      copyDeListaLegada(itens)
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(CopyLegadaIncompativel)
    expect((erro as CopyLegadaIncompativel).original).toEqual(itens)
    expect((erro as CopyLegadaIncompativel).problemas.length).toBeGreaterThan(0)

    const cabe = converterListaLegada(['x'.repeat(300)])
    expect(cabe.problemas).toEqual([])
    expect(cabe.copy!.blocos[0].linhas).toEqual(['x'.repeat(300)])
    relidaIgual(cabe.copy!)
  })

  it('lista: 13 linhas num item é incompatível (nada é cortado nem vira outro bloco); 12 converte exato', () => {
    const treze = Array.from({ length: 13 }, (_, i) => `linha ${i + 1}`).join('\n')
    const r = converterListaLegada(['Manchete', treze])
    expect(r.copy).toBeNull()
    expect(r.problemas.some((p) => p.mensagem.startsWith('blocos.1.linhas'))).toBe(true)
    expect(r.original).toEqual(['Manchete', treze])
    expect(() => copyDeListaLegada(['Manchete', treze])).toThrow(CopyLegadaIncompativel)

    const doze = Array.from({ length: 12 }, (_, i) => `linha ${i + 1}`).join('\n')
    const ok = converterListaLegada(['Manchete', doze])
    expect(ok.problemas).toEqual([])
    expect(ok.copy!.blocos).toHaveLength(2)
    expect(ok.copy!.blocos[1].linhas).toEqual(doze.split('\n'))
    relidaIgual(ok.copy!)
  })

  it('lista vazia é incompatível: o contrato exige um bloco, e o adaptador não inventa um', () => {
    const r = converterListaLegada([])
    expect(r.copy).toBeNull()
    expect(r.problemas.some((p) => p.mensagem.startsWith('blocos'))).toBe(true)
    expect(r.original).toEqual([])
    expect(() => copyDeListaLegada([])).toThrow(CopyLegadaIncompativel)
  })

  it('blocos por papel: linha longa, 13 linhas e lista vazia são incompatíveis; o que cabe volta exato', () => {
    const longa = [{ papel: 'headline', linhas: ['Sexta', 'y'.repeat(301)] }]
    const r1 = converterBlocosLegados(longa)
    expect(r1.copy).toBeNull()
    expect(r1.problemas.some((p) => p.mensagem.startsWith('blocos.0.linhas.1'))).toBe(true)
    expect(r1.original).toEqual(longa)
    expect(() => copyDeBlocosLegados(longa)).toThrow(CopyLegadaIncompativel)

    const treze = [{ papel: 'apoio', linhas: Array.from({ length: 13 }, (_, i) => String(i)) }]
    expect(converterBlocosLegados(treze).copy).toBeNull()
    expect(() => copyDeBlocosLegados(treze)).toThrow(CopyLegadaIncompativel)

    expect(converterBlocosLegados([]).copy).toBeNull()
    expect(() => copyDeBlocosLegados([])).toThrow(CopyLegadaIncompativel)

    const cabe = copyDeBlocosLegados([{ papel: 'headline', linhas: ['y'.repeat(300)] }, { papel: 'apoio', linhas: Array.from({ length: 12 }, (_, i) => `l${i}`) }])
    expect(cabe.blocos[0].linhas).toEqual(['y'.repeat(300)])
    relidaIgual(cabe)
  })
})

describe('PR2-02: a revisão que aplicarRevisao acrescenta sempre passa no leitor', () => {
  const blocosCom = (prefixo: string, n: number): BlocoAutoral[] => Array.from({ length: n }, (_, i) => ({ id: `${prefixo}-${i}`, funcao: 'livre' as const, ordem: i, linhas: [`${prefixo} ${i}`] }))

  it('trocar 40 blocos por 40 novos registra os 80 ids tocados, e a copy relida mantém todos e as 40 remoções', () => {
    const c40: CopyAutoral = { versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos: blocosCom('a', 40), revisoes: [] }
    expect(validarCopyAutoral(c40).problemas).toEqual([])
    const { copy: revisada } = aplicarRevisao(c40, blocosCom('b', 40), { autor: 'equipe', motivo: 'troca tudo', em: '2026-09-13T10:00:00.000Z' })
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(revisada))
    expect(problemas).toEqual([])
    const tocados = [...lida!.revisoes[0].blocos].sort()
    expect(tocados).toEqual([...blocosCom('a', 40), ...blocosCom('b', 40)].map((b) => b.id).sort())
    expect(lida!.revisoes[0].removidos).toHaveLength(40)
    expect(lida!.revisoes[0].removidos![39]).toEqual({ id: 'a-39', funcao: 'livre', linhas: ['a 39'] })
    expect(autorDoBloco(lida!, 'a-0').autor).toBe('equipe')
    expect(autorDoBloco(lida!, 'b-39').autor).toBe('equipe')
  })

  const comHistorico = (n: number): CopyAutoral => ({
    ...copy,
    revisoes: Array.from({ length: n }, (_, i) => ({ em: `2026-09-12T10:${String(i % 60).padStart(2, '0')}:00.000Z`, autor: i % 2 ? ('equipe' as const) : ('claude' as const), motivo: `r${i}`, blocos: ['apoio'] })),
  })
  const mudaManchete = (c: CopyAutoral) => c.blocos.map((b) => (b.id === 'headline' ? { ...b, linhas: ['Outra', 'manchete'] } : b))

  it('com 199 revisões a mudança entra como a 200ª e a copy relida é válida', () => {
    const c199 = comHistorico(MAX_REVISOES_DA_COPY - 1)
    const { copy: revisada } = aplicarRevisao(c199, mudaManchete(c199), { autor: 'sistema', motivo: 'a 200ª' })
    expect(revisada.revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
    expect(historicoCheio(revisada)).toBe(true)
    const { copy: lida, problemas } = lerCopyAutoral(serializarCopyAutoral(revisada))
    expect(problemas).toEqual([])
    expect(autorDoBloco(lida!, 'headline').autor).toBe('sistema')
  })

  it('com 200 revisões a mudança é RECUSADA explicitamente — nenhuma revisão apagada, a original intacta', () => {
    const c200 = comHistorico(MAX_REVISOES_DA_COPY)
    expect(validarCopyAutoral(c200).problemas).toEqual([])
    expect(historicoCheio(c200)).toBe(true)
    let erro: unknown
    try {
      aplicarRevisao(c200, mudaManchete(c200), { autor: 'equipe', motivo: 'a 201ª' })
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(HistoricoDaCopyCheio)
    const recusa = erro as HistoricoDaCopyCheio
    expect(recusa.copy).toBe(c200)
    expect(recusa.copy.revisoes).toHaveLength(MAX_REVISOES_DA_COPY)
    expect(recusa.copy.revisoes[0].motivo).toBe('r0')
    expect(recusa.mudancas.map((m) => m.id)).toEqual(['headline'])
    expect(recusa.problemas[0].tipo).toBe('revisao')
    expect(c200.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['Milk-shake', 'vem [em dobro]'])
    // sem mudança nenhuma não há o que recusar
    expect(aplicarRevisao(c200, c200.blocos, { autor: 'equipe', motivo: 'nada' }).copy).toBe(c200)
  })
})
