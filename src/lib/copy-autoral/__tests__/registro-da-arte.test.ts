import { describe, expect, it } from 'vitest'
import { comConferencia, conferenciaDoCheck, identidadeDoContrato, LACUNA_SEM_CAMADAS, registroParaIA, revisaoDoRefino, revisaoPosicional, textoEnviadoDoContrato, type CopyAutoral } from '..'

const contrato: CopyAutoral = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat', em: '2026-09-12T10:00:00.000Z' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake', 'em [dobro]'], estilo: { linhasNaVoz2: [1] } },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: [] },
    { id: 'servico', funcao: 'servico', ordem: 2, linhas: ['Seg a sáb · 11h às 22h'] },
  ],
  revisoes: [],
}

describe('o registro da copy numa arte SEM camadas (via de IA e melhoria)', () => {
  it('o texto enviado é cada bloco COM texto, em ordem, com as linhas do autor unidas por quebra; bloco vazio fica de fora', () => {
    expect(textoEnviadoDoContrato(contrato)).toEqual(['Milk-shake\nem [dobro]', 'Seg a sáb · 11h às 22h'])
  })

  it('registroParaIA declara a lacuna das camadas e só é comparável com autoria conhecida', () => {
    const r = registroParaIA(contrato, ['MILK-SHAKE\nEM DOBRO', 'Seg a sáb · 11h às 22h'])
    expect(r.comparavel).toBe(true)
    expect(r.lacunas[0]).toBe(LACUNA_SEM_CAMADAS)
    expect(r.enviada[0]).toBe('MILK-SHAKE\nEM DOBRO')
    const legado = registroParaIA({ ...contrato, origem: { autor: 'desconhecido', superficie: 'legado' } }, ['x'])
    expect(legado.comparavel).toBe(false)
  })

  it('a conferência entra como registro: transcrição, o que faltou, se passou; sem check, passou é null', () => {
    const c = conferenciaDoCheck({ passed: false, missing: ['SEG A SAB 11H AS 22H'], extracted: ['MILK-SHAKE EM DOBRO'], grafiaDivergente: [] }, 'copy')
    expect(c).toEqual({ lida: ['MILK-SHAKE EM DOBRO'], faltando: ['SEG A SAB 11H AS 22H'], passou: false, regua: 'copy' })
    expect(conferenciaDoCheck(null, 'nenhuma (visão indisponível)')).toEqual({ lida: [], faltando: [], passou: null, regua: 'nenhuma (visão indisponível)' })
    const r = comConferencia(registroParaIA(contrato, ['a']), c)
    expect(r.conferencia?.faltando).toEqual(['SEG A SAB 11H AS 22H'])
  })

  it('revisaoPosicional: o pedido de refino que troca UM bloco vira revisão de quem pediu, com o motivo; a voz 2 acompanha a linha', () => {
    const r = revisaoPosicional(contrato, ['Milk-shake\nem [dobro]', 'Ter a dom · 11h às 23h'], { autor: 'claude', superficie: 'melhoria' }, 'pedido de refino: troque o horário')
    expect('copy' in r).toBe(true)
    if (!('copy' in r)) return
    expect(r.mudou).toBe(true)
    expect(r.copy.blocos.find((b) => b.id === 'servico')?.linhas).toEqual(['Ter a dom · 11h às 23h'])
    expect(r.copy.blocos.find((b) => b.id === 'headline')?.estilo?.linhasNaVoz2).toEqual([1])
    expect(r.copy.blocos.find((b) => b.id === 'cta')?.linhas).toEqual([])
    const ultima = r.copy.revisoes.at(-1)
    expect(ultima?.autor).toBe('claude')
    expect(ultima?.motivo).toBe('pedido de refino: troque o horário')
    expect(ultima?.blocos).toEqual(['servico'])
  })

  it('revisaoPosicional: a MESMA copy não abre revisão; número de blocos diferente é descartado com motivo', () => {
    const igual = revisaoPosicional(contrato, ['Milk-shake\nem [dobro]', 'Seg a sáb · 11h às 22h'], { autor: 'claude', superficie: 'melhoria' }, 'x')
    expect('copy' in igual && igual.mudou).toBe(false)
    const r = revisaoPosicional(contrato, ['só um bloco'], { autor: 'claude', superficie: 'melhoria' }, 'x')
    expect('descartado' in r && r.descartado).toMatch(/mudou o número de blocos com texto \(2 → 1\)/)
  })

  describe('revisaoDoRefino: o par entrada→saída do planejador, com o bloco localizado pelo texto', () => {
    const quem = { autor: 'claude' as const, superficie: 'melhoria' }
    const misto: CopyAutoral = {
      ...contrato,
      blocos: [
        { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Hoje tem'] },
        { id: 'headline', funcao: 'headline', ordem: 1, linhas: ['Costela'] },
      ],
    }
    it('a ordem dos slots da arte NÃO é a do contrato: a headline trocada vai para o bloco headline, o pré-título fica intacto (PR5-03)', () => {
      const r = revisaoDoRefino(misto, ['COSTELA', 'HOJE TEM'], ['COSTELA NO BAFO', 'HOJE TEM'], quem, 'pedido de refino: acrescente "no bafo"')
      expect('copy' in r).toBe(true)
      if (!('copy' in r)) return
      expect(r.mudou).toBe(true)
      expect(r.copy.blocos.find((b) => b.id === 'headline')!.linhas).toEqual(['COSTELA NO BAFO'])
      expect(r.copy.blocos.find((b) => b.id === 'pre')!.linhas).toEqual(['Hoje tem'])
      expect(r.copy.revisoes).toHaveLength(1)
      expect(r.copy.revisoes[0].autor).toBe('claude')
      expect(r.copy.revisoes[0].blocos).toEqual(['headline'])
    })
    it('só acento, ou só uma quebra de linha, É revisão: a comparação é exata entre o que o planejador recebeu e devolveu (PR5-04)', () => {
      const so = (linhas: string[]): CopyAutoral => ({ ...contrato, blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas }] })
      const acento = revisaoDoRefino(so(['Almoço em familia']), ['ALMOÇO EM FAMILIA'], ['ALMOÇO EM FAMÍLIA'], quem, 'pedido de refino: corrija família')
      expect('copy' in acento && acento.mudou).toBe(true)
      if ('copy' in acento) expect(acento.copy.blocos[0].linhas).toEqual(['ALMOÇO EM FAMÍLIA'])
      const quebra = revisaoDoRefino(so(['Almoço em família']), ['Almoço em família'], ['Almoço\nem família'], quem, 'pedido de refino: quebre a linha')
      expect('copy' in quebra && quebra.mudou).toBe(true)
      if ('copy' in quebra) expect(quebra.copy.blocos[0].linhas).toEqual(['Almoço', 'em família'])
    })
    it('a caixa da origem aplicada pelo sistema NÃO vira revisão: bloco devolvido igual ao recebido mantém as linhas do autor', () => {
      const r = revisaoDoRefino(misto, ['COSTELA', 'HOJE TEM'], ['COSTELA', 'HOJE TEM'], quem, 'pedido de refino: só a foto')
      expect(r).toEqual({ copy: misto, mudou: false })
    })
    it('texto enviado que não casa com bloco nenhum, ou casa com dois, é descartado com o motivo — nunca aplicado por posição', () => {
      const semPar = revisaoDoRefino(misto, ['OUTRA COISA', 'HOJE TEM'], ['OUTRA COISA X', 'HOJE TEM'], quem, 'm')
      expect('descartado' in semPar && /posição 1/.test(semPar.descartado)).toBe(true)
      const duplo: CopyAutoral = { ...misto, blocos: [...misto.blocos, { id: 'apoio', funcao: 'apoio', ordem: 2, linhas: ['Costela'] }] }
      const ambiguo = revisaoDoRefino(duplo, ['COSTELA', 'HOJE TEM', 'COSTELA'], ['COSTELA X', 'HOJE TEM', 'COSTELA'], quem, 'm')
      expect('descartado' in ambiguo && /2 blocos/.test(ambiguo.descartado)).toBe(true)
      const contagem = revisaoDoRefino(misto, ['COSTELA', 'HOJE TEM'], ['COSTELA'], quem, 'm')
      expect('descartado' in contagem).toBe(true)
    })
    it('a voz 2 declarada acompanha as linhas que sobraram', () => {
      const r = revisaoDoRefino(contrato, ['MILK-SHAKE\nEM DOBRO', 'Seg a sáb · 11h às 22h'], ['MILK-SHAKE', 'Seg a sáb · 11h às 22h'], quem, 'pedido de refino: tire o em dobro')
      expect('copy' in r).toBe(true)
      if (!('copy' in r)) return
      const h = r.copy.blocos.find((b) => b.id === 'headline')!
      expect(h.linhas).toEqual(['MILK-SHAKE'])
      expect(h.estilo?.linhasNaVoz2).toBeUndefined()
    })
  })

  it('identidadeDoContrato: mesmos textos com ids, papéis ou autoria diferentes são identidades diferentes; sem contrato é null (PR5-01)', () => {
    const a = identidadeDoContrato(contrato)
    expect(identidadeDoContrato(null)).toBeNull()
    expect(identidadeDoContrato({ ...contrato, revisoes: [], lacunas: ['x'] })).toBe(a)
    expect(identidadeDoContrato({ ...contrato, origem: { autor: 'desconhecido' } })).not.toBe(a)
    expect(identidadeDoContrato({ ...contrato, blocos: contrato.blocos.map((b) => (b.id === 'servico' ? { ...b, id: 'rodape' } : b)) })).not.toBe(a)
    expect(identidadeDoContrato({ ...contrato, blocos: contrato.blocos.map((b) => (b.id === 'servico' ? { ...b, funcao: 'apoio' as const } : b)) })).not.toBe(a)
    // o histórico autoral é identidade (PR5-05): mesmos blocos, última revisão de autores diferentes
    const revClaude = { ...contrato, revisoes: [{ autor: 'claude' as const, em: '2026-09-12T11:00:00.000Z', motivo: 'ajuste', superficie: 'chat', blocos: ['headline'] }] }
    const revEquipe = { ...contrato, revisoes: [{ autor: 'equipe' as const, em: '2026-09-12T11:00:00.000Z', motivo: 'ajuste', superficie: 'editor', blocos: ['headline'] }] }
    expect(identidadeDoContrato(revClaude)).not.toBe(identidadeDoContrato(revEquipe))
    expect(identidadeDoContrato(revClaude)).toBe(identidadeDoContrato({ ...revClaude }))
  })
})
