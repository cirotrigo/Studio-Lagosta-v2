import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { comVisibilidadeDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { MAX_REVISOES_DA_COPY, VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, tentarCopyEfetivaDasCamadas, idDeExtra, idDeExtraLegado, lerCopyAutoral, renomearExtrasDuplicados, revisaoDaPaginaComCamadas, serializarCopyAutoral, type CopyAutoral } from '..'

function texto(id: string, y: number, content: string, extra: Partial<Layer> = {}): Layer {
  return { id, name: id, type: 'text', visible: true, locked: false, order: 1, content, position: { x: 100, y }, size: { width: 800, height: 60 }, style: { fontSize: 40 }, metadata: { compositor: { papel: id.replace(/-\d+$/, '') } }, ...extra } as Layer
}

const contrato: CopyAutoral = {
  versao: VERSAO_DO_CONTRATO,
  origem: { autor: 'claude', em: '2026-09-12T10:00:00.000Z', superficie: 'chat' },
  blocos: [
    { id: 'headline', funcao: 'headline', ordem: 0, linhas: ['Milk-shake'] },
    { id: 'cta', funcao: 'cta', ordem: 1, linhas: ['Conheça nossos pacotes'] },
  ],
  revisoes: [],
}

describe('a revisão da página a partir das camadas (puro — entra na MESMA escrita das camadas)', () => {
  it('sem contrato gravado: sem-contrato, nada é inventado', () => {
    expect(revisaoDaPaginaComCamadas(null, [texto('headline', 100, 'X')], { autor: 'equipe', motivo: 'm', superficie: 'editor' }).estado).toBe('sem-contrato')
  })

  it('camadas ilegíveis: ilegivel — nunca "nada mudou"', () => {
    expect(revisaoDaPaginaComCamadas(contrato, '{{{nao-json', { autor: 'equipe', motivo: 'm', superficie: 'editor' }).estado).toBe('ilegivel')
  })

  it('mesmo texto: sem-mudanca; texto diferente: registrada com o autor de quem escreveu, só nos blocos que mudaram', () => {
    const iguais = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes')]
    expect(revisaoDaPaginaComCamadas(serializarCopyAutoral(contrato), iguais, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
    const editadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Fale com a gente')]
    const r = revisaoDaPaginaComCamadas(contrato, editadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em: '2026-09-12T11:00:00.000Z' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['cta'])
    expect(r.copy!.revisoes).toEqual([{ em: '2026-09-12T11:00:00.000Z', autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', blocos: ['cta'], campos: { cta: ['linhas'] } }])
    expect(lerCopyAutoral(serializarCopyAutoral(r.copy!)).problemas).toEqual([])
  })

  it('ocultaPeloRevisor: a camada escondida pelo AJUSTE do revisor não é remoção autoral — sem revisão de quem pediu; a efetiva da arte segue dizendo o que foi desenhado', () => {
    const marca = { em: '2026-09-12T12:00:00.000Z', ajuste: 0 }
    const camadas = [texto('headline', 100, 'Milk-shake'), comVisibilidadeDoRevisor(texto('cta', 300, 'Conheça nossos pacotes'), false, marca)]
    expect(camadas[1].visible).toBe(false)
    const r = revisaoDaPaginaComCamadas(contrato, camadas, { autor: 'claude', motivo: 'ajuste de diagramação (revisor)', superficie: 'chat' })
    expect(r.estado).toBe('sem-mudanca')
    expect(r.blocos).toEqual([])
    expect(r.copy!.revisoes).toEqual([])
    expect(r.copy!.blocos.find((b) => b.id === 'cta')!.linhas).toEqual(['Conheça nossos pacotes'])
    // Mostrar a camada de novo (a marca sai) também não é mudança autoral.
    const mostrada = [camadas[0], comVisibilidadeDoRevisor(camadas[1], true, marca)]
    expect(revisaoDaPaginaComCamadas(r.copy, mostrada, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' }).estado).toBe('sem-mudanca')
    // O que a ARTE mostra continua medido sobre as camadas cruas: o CTA não foi desenhado, e quem assina é o sistema.
    const efetiva = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'ajuste-arte' })
    expect(efetiva.efetiva.blocos.find((b) => b.id === 'cta')!.linhas).toEqual([])
    expect(efetiva.efetiva.revisoes.at(-1)!.autor).toBe('sistema')
  })

  it('ocultaPeloRevisor: com a camada escondida pelo revisor, a edição de texto em OUTRO bloco é revisão só daquele bloco', () => {
    const camadas = [texto('headline', 100, 'Milk-shake duplo'), comVisibilidadeDoRevisor(texto('cta', 300, 'Conheça nossos pacotes'), false, { em: '2026-09-12T12:00:00.000Z', ajuste: 1 })]
    const r = revisaoDaPaginaComCamadas(contrato, camadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em: '2026-09-12T13:00:00.000Z' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['headline'])
    expect(r.copy!.blocos.find((b) => b.id === 'cta')!.linhas).toEqual(['Conheça nossos pacotes'])
    expect(r.copy!.revisoes).toEqual([{ em: '2026-09-12T13:00:00.000Z', autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', blocos: ['headline'], campos: { headline: ['linhas'] } }])
  })

  it('controle: camada escondida SEM a marca do revisor é a pessoa apagando — revisão autoral com o bloco vazio', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes', { visible: false })]
    const r = revisaoDaPaginaComCamadas(contrato, camadas, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor', em: '2026-09-12T13:00:00.000Z' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['cta'])
    expect(r.copy!.blocos.find((b) => b.id === 'cta')!.linhas).toEqual([])
    expect(r.copy!.revisoes.at(-1)!.autor).toBe('equipe')
  })

  it('R03: texto solto lido como bloco extra é RELIDO estável — segunda leitura sem mudança, sem id duplicado, contrato válido', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('aviso', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const primeira = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' })
    expect(primeira.efetiva.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-aviso'])
    expect(lerCopyAutoral(serializarCopyAutoral(primeira.efetiva)).problemas).toEqual([])
    const segunda = copyEfetivaDasCamadas(primeira.efetiva, camadas, { superficie: 'compositor' })
    expect(segunda.mudancas).toEqual([])
    expect(segunda.efetiva.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-aviso'])
    expect(segunda.efetiva.revisoes).toEqual(primeira.efetiva.revisoes)
    expect(lerCopyAutoral(serializarCopyAutoral(segunda.efetiva)).problemas).toEqual([])
    const r = revisaoDaPaginaComCamadas(primeira.efetiva, camadas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(r.estado).toBe('sem-mudanca')
  })

  it('R04: camadas soltas cujo id saneado COLIDE ("nota!" e "nota?") ganham ids distintos e REPRODUTÍVEIS — três leituras iguais', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('nota!', 500, 'a', { metadata: {} } as Partial<Layer>), texto('nota?', 560, 'b', { metadata: {} } as Partial<Layer>), texto('Nota', 620, 'c', { metadata: {} } as Partial<Layer>)]
    const l1 = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' })
    const ids = l1.efetiva.blocos.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.slice(2)).toEqual([idDeExtra('nota!'), idDeExtra('nota?'), 'extra-Nota'])
    const l2 = copyEfetivaDasCamadas(l1.efetiva, camadas, { superficie: 'compositor' })
    const l3 = copyEfetivaDasCamadas(l2.efetiva, camadas, { superficie: 'compositor' })
    expect(l2.mudancas).toEqual([])
    expect(l3.mudancas).toEqual([])
    expect(l3.efetiva.blocos).toEqual(l1.efetiva.blocos)
    expect(l3.efetiva.revisoes).toEqual(l1.efetiva.revisoes)
    expect(lerCopyAutoral(serializarCopyAutoral(l3.efetiva)).problemas).toEqual([])
  })

  it('REV-03 (3ª rodada): contrato gravado pela forma ANTIGA do id (`extra-nota` para a camada "Nota") é relido pelo vínculo — sem bloco novo, sem revisão artificial', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('Nota', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    expect(idDeExtraLegado('Nota')).toBe('extra-nota')
    expect(idDeExtra('Nota')).toBe('extra-Nota')
    // o que a base (82d9b202) gravou: bloco livre `extra-nota`, já com o texto da camada
    const gravadoPelaBase: CopyAutoral = { ...contrato, blocos: [...contrato.blocos, { id: 'extra-nota', funcao: 'livre', ordem: 2, linhas: ['Só hoje'] }], lacunas: ['a arte tem um texto que a copy não tinha: "extra-nota" (Só hoje)'] }
    const relida = copyEfetivaDasCamadas(gravadoPelaBase, camadas, { superficie: 'editor' })
    expect(relida.mudancas).toEqual([])
    expect(relida.efetiva.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-nota'])
    expect(relida.efetiva.revisoes).toEqual([])
    // edição só geométrica: nenhuma revisão da equipe
    const mexida = camadas.map((c) => (c.id === 'Nota' ? { ...c, position: { x: 200, y: 700 } } : c)) as Layer[]
    expect(revisaoDaPaginaComCamadas(gravadoPelaBase, mexida, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
    // edição de texto: revisão no bloco ANTIGO, com o id preservado
    const editada = camadas.map((c) => (c.id === 'Nota' ? { ...c, content: 'Só amanhã' } : c)) as Layer[]
    const r = revisaoDaPaginaComCamadas(gravadoPelaBase, editada, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
    expect(r.estado).toBe('registrada')
    expect(r.blocos).toEqual(['extra-nota'])
    expect(lerCopyAutoral(serializarCopyAutoral(r.copy!)).problemas).toEqual([])
  })

  it('REV-03 (3ª rodada): ids antigos com sufixo de colisão (`extra-nota-`, `extra-nota--2`) caem nas camadas na ordem de leitura, com a ambiguidade declarada; a duplicação leva o vínculo', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('nota!', 500, 'a', { metadata: {} } as Partial<Layer>), texto('nota?', 560, 'b', { metadata: {} } as Partial<Layer>)]
    expect(idDeExtraLegado('nota!')).toBe('extra-nota-')
    expect(idDeExtraLegado('nota?')).toBe('extra-nota-')
    const gravadoPelaBase: CopyAutoral = { ...contrato, blocos: [...contrato.blocos, { id: 'extra-nota-', funcao: 'livre', ordem: 2, linhas: ['a'] }, { id: 'extra-nota--2', funcao: 'livre', ordem: 3, linhas: ['b'] }] }
    const relida = copyEfetivaDasCamadas(gravadoPelaBase, camadas, { superficie: 'editor' })
    expect(relida.mudancas).toEqual([])
    expect(relida.efetiva.blocos.map((b) => [b.id, b.linhas[0]])).toEqual([['headline', 'Milk-shake'], ['cta', 'Conheça nossos pacotes'], ['extra-nota-', 'a'], ['extra-nota--2', 'b']])
    // texto igual desfaz a ambiguidade: nada a declarar (4ª rodada, `vincularExtras`)
    expect(relida.lacunas).toEqual([])
    expect(lerCopyAutoral(serializarCopyAutoral(relida.efetiva)).problemas).toEqual([])
    const mapa = new Map([['headline', 'u1'], ['cta', 'u2'], ['nota!', 'u3'], ['nota?', 'u4']])
    const copia = renomearExtrasDuplicados(gravadoPelaBase, mapa, camadas)
    expect(copia.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-u3', 'extra-u4'])
  })

  it('R4-01 (4ª rodada): "Nota" e "nota" (forma antiga: extra-nota e extra-nota-2) — cada bloco casa com a SUA camada, não pela preferência do id atual; a cópia sai com ids únicos', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('Nota', 500, 'A', { metadata: {} } as Partial<Layer>), texto('nota', 560, 'B', { metadata: {} } as Partial<Layer>)]
    // `extra-nota` é o legado de "Nota" E o id atual de "nota"
    expect(idDeExtraLegado('Nota')).toBe('extra-nota')
    expect(idDeExtra('nota')).toBe('extra-nota')
    const gravadoPelaBase: CopyAutoral = { ...contrato, blocos: [...contrato.blocos, { id: 'extra-nota', funcao: 'livre', ordem: 2, linhas: ['A'] }, { id: 'extra-nota-2', funcao: 'livre', ordem: 3, linhas: ['B'] }] }
    const relida = copyEfetivaDasCamadas(gravadoPelaBase, camadas, { superficie: 'editor' })
    expect(relida.mudancas).toEqual([])
    expect(relida.efetiva.blocos.map((b) => [b.id, b.linhas[0]])).toEqual([['headline', 'Milk-shake'], ['cta', 'Conheça nossos pacotes'], ['extra-nota', 'A'], ['extra-nota-2', 'B']])
    const mexida = camadas.map((c) => (c.id === 'nota' ? { ...c, position: { x: 100, y: 700 } } : c)) as Layer[]
    expect(revisaoDaPaginaComCamadas(gravadoPelaBase, mexida, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
    const mapa = new Map([['headline', 'u1'], ['cta', 'u2'], ['Nota', 'u3'], ['nota', 'u4']])
    const copia = renomearExtrasDuplicados(gravadoPelaBase, mapa, camadas)
    expect(copia.blocos.map((b) => [b.id, b.linhas[0]])).toEqual([['headline', 'Milk-shake'], ['cta', 'Conheça nossos pacotes'], ['extra-u3', 'A'], ['extra-u4', 'B']])
    expect(lerCopyAutoral(serializarCopyAutoral(copia)).problemas).toEqual([])
    // as duas editadas: sem texto igual, vale a ordem de leitura (a que nomeou os sufixos), declarada
    const editadas = camadas.map((c) => (c.id === 'Nota' ? { ...c, content: 'A2' } : c.id === 'nota' ? { ...c, content: 'B2' } : c)) as Layer[]
    const r = copyEfetivaDasCamadas(gravadoPelaBase, editadas, { superficie: 'editor' })
    expect(r.efetiva.blocos.slice(2).map((b) => [b.id, b.linhas[0]])).toEqual([['extra-nota', 'A2'], ['extra-nota-2', 'B2']])
    expect(r.lacunas.some((l) => l.includes('casava com 2 camadas'))).toBe(true)
    expect(r.mudancas.map((m) => m.id)).toEqual(['extra-nota', 'extra-nota-2'])
  })

  it('R5-01 (5ª rodada): "Nota" editada E movida para baixo de "nota" intacta — o casamento exato de "nota" vem ANTES da ordem visual; só extra-nota muda, e a releitura é estável', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('Nota', 500, 'A', { metadata: {} } as Partial<Layer>), texto('nota', 560, 'B', { metadata: {} } as Partial<Layer>)]
    const gravadoPelaBase: CopyAutoral = { ...contrato, blocos: [...contrato.blocos, { id: 'extra-nota', funcao: 'livre', ordem: 2, linhas: ['A'] }, { id: 'extra-nota-2', funcao: 'livre', ordem: 3, linhas: ['B'] }] }
    // no MESMO salvamento: "Nota" vira A2 e desce para y=700 (agora DEPOIS de "nota" na ordem de leitura); "nota" fica igual
    const mexida = camadas.map((c) => (c.id === 'Nota' ? { ...c, content: 'A2', position: { x: 100, y: 700 } } : c)) as Layer[]
    const r = copyEfetivaDasCamadas(gravadoPelaBase, mexida, { superficie: 'editor' })
    expect(r.efetiva.blocos.slice(2).map((b) => [b.id, b.linhas[0]])).toEqual([['extra-nota', 'A2'], ['extra-nota-2', 'B']])
    expect(r.mudancas.map((m) => m.id)).toEqual(['extra-nota'])
    expect(r.lacunas).toEqual([])
    const rev = revisaoDaPaginaComCamadas(gravadoPelaBase, mexida, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    if (rev.estado !== 'registrada') return
    expect(rev.copy.revisoes.at(-1)?.blocos).toEqual(['extra-nota'])
    // releitura com o contrato revisado: nada muda, nada ambíguo
    const r2 = copyEfetivaDasCamadas(rev.copy, mexida, { superficie: 'editor' })
    expect(r2.mudancas).toEqual([])
    expect(r2.lacunas).toEqual([])
  })

  it('R5-02 (5ª rodada): ocultar → salvar → duplicar → reexibir na cópia: o bloco extra acompanha o id novo mesmo com a camada OCULTA, e reexibir restaura o MESMO bloco sem criar outro', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('aviso', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const original = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' }).efetiva
    expect(original.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-aviso'])
    // oculta e salva: o bloco fica, vazio, como revisão da equipe
    const ocultas = camadas.map((c) => (c.id === 'aviso' ? { ...c, visible: false } : c)) as Layer[]
    const rev = revisaoDaPaginaComCamadas(original, ocultas, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' })
    expect(rev.estado).toBe('registrada')
    if (rev.estado !== 'registrada') return
    expect(rev.copy.blocos.find((b) => b.id === 'extra-aviso')?.linhas).toEqual([])
    // duplica com a camada ainda oculta
    const mapa = new Map([['headline', 'uuid-1'], ['cta', 'uuid-2'], ['aviso', 'uuid-3']])
    const copia = renomearExtrasDuplicados(rev.copy, mapa, ocultas)
    expect(copia.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-uuid-3'])
    expect(copia.revisoes.every((r) => !r.blocos.includes('extra-aviso'))).toBe(true)
    expect(copia.revisoes.some((r) => r.blocos.includes('extra-uuid-3'))).toBe(true)
    expect(lerCopyAutoral(serializarCopyAutoral(copia)).problemas).toEqual([])
    // reexibe na cópia: o texto volta ao MESMO bloco; nenhum bloco a mais
    const camadasDaCopia = ocultas.map((c) => ({ ...c, id: mapa.get(c.id)!, name: mapa.get(c.id)!, visible: true, metadata: c.id === 'aviso' ? {} : { compositor: { papel: c.id } } })) as Layer[]
    const r = copyEfetivaDasCamadas(copia, camadasDaCopia, { superficie: 'editor' })
    expect(r.efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['headline', ['Milk-shake']], ['cta', ['Conheça nossos pacotes']], ['extra-uuid-3', ['Só hoje']]])
    expect(r.mudancas.map((m) => m.id)).toEqual(['extra-uuid-3'])
    expect(r.lacunas).toEqual([])
  })

  it('R4-02 (4ª rodada): a duplicação resolve o vínculo pela ORDEM VISUAL das camadas originais, nunca pela ordem do array', () => {
    // array: nota? (y=560, "b") ANTES de nota! (y=500, "a"); a forma antiga nomeou pela ordem visual: extra-nota- → a, extra-nota--2 → b
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('nota?', 560, 'b', { metadata: {} } as Partial<Layer>), texto('nota!', 500, 'a', { metadata: {} } as Partial<Layer>)]
    const gravadoPelaBase: CopyAutoral = { ...contrato, blocos: [...contrato.blocos, { id: 'extra-nota-', funcao: 'livre', ordem: 2, linhas: ['a'] }, { id: 'extra-nota--2', funcao: 'livre', ordem: 3, linhas: ['b'] }] }
    expect(copyEfetivaDasCamadas(gravadoPelaBase, camadas, { superficie: 'editor' }).mudancas).toEqual([])
    const mapa = new Map([['headline', 'u1'], ['cta', 'u2'], ['nota?', 'u3'], ['nota!', 'u4']])
    const copia = renomearExtrasDuplicados(gravadoPelaBase, mapa, camadas)
    expect(copia.blocos.slice(2).map((b) => [b.id, b.linhas[0]])).toEqual([['extra-u4', 'a'], ['extra-u3', 'b']])
    expect(lerCopyAutoral(serializarCopyAutoral(copia)).problemas).toEqual([])
    const camadasDaCopia = camadas.map((c) => ({ ...c, id: mapa.get(c.id)! })) as Layer[]
    const r = copyEfetivaDasCamadas(copia, camadasDaCopia, { superficie: 'editor' })
    expect(r.mudancas).toEqual([])
    expect(r.lacunas).toEqual([])
    expect(revisaoDaPaginaComCamadas(copia, camadasDaCopia, { autor: 'equipe', motivo: 'autosave', superficie: 'editor' }).estado).toBe('sem-mudanca')
  })

  it('R03: duplicar a página regenera os ids das camadas e os blocos extra acompanham, no bloco e no histórico', () => {
    const camadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Conheça nossos pacotes'), texto('aviso', 500, 'Só hoje', { metadata: {} } as Partial<Layer>)]
    const original = copyEfetivaDasCamadas(contrato, camadas, { superficie: 'compositor' }).efetiva
    const editada = copyEfetivaDasCamadas(original, camadas.map((c) => (c.id === 'aviso' ? { ...c, content: 'Só amanhã' } : c)), { superficie: 'editor' }).efetiva
    const mapa = new Map([['headline', 'uuid-1'], ['cta', 'uuid-2'], ['aviso', 'uuid-3']])
    const copia = renomearExtrasDuplicados(editada, mapa, camadas)
    expect(copia.blocos.map((b) => b.id)).toEqual(['headline', 'cta', 'extra-uuid-3'])
    expect(copia.revisoes.every((r) => !r.blocos.includes('extra-aviso'))).toBe(true)
    expect(copia.revisoes.some((r) => r.blocos.includes('extra-uuid-3'))).toBe(true)
    expect(lerCopyAutoral(serializarCopyAutoral(copia)).problemas).toEqual([])
    // na página duplicada, a leitura com as camadas de ids novos NÃO muda nada
    const camadasDaCopia = camadas.map((c) => ({ ...c, id: mapa.get(c.id)!, name: mapa.get(c.id)!, content: c.id === 'aviso' ? 'Só amanhã' : c.content })) as Layer[]
    const camadasComPapel = camadasDaCopia.map((c) => ({ ...c, metadata: c.id === 'uuid-3' ? {} : { compositor: { papel: c.id === 'uuid-1' ? 'headline' : 'cta' } } })) as Layer[]
    expect(copyEfetivaDasCamadas(copia, camadasComPapel, { superficie: 'editor' }).mudancas).toEqual([])
  })
})

describe('histórico da copy cheio (PR2-02) — a revisão da página não lança', () => {
  const cheio = (n: number): CopyAutoral => ({ ...contrato, revisoes: Array.from({ length: n }, () => ({ em: '2026-09-12T11:00:00.000Z', autor: 'equipe' as const, motivo: 'm', superficie: 'editor', blocos: ['cta'] })) })
  const editadas = [texto('headline', 100, 'Milk-shake'), texto('cta', 300, 'Fale com a gente')]

  it('com 200 revisões e mudança: estado historico-cheio, sem copy para gravar, com os blocos e o aviso', () => {
    const r = revisaoDaPaginaComCamadas(cheio(MAX_REVISOES_DA_COPY), editadas, { autor: 'equipe', motivo: 'edição', superficie: 'editor' })
    expect(r.estado).toBe('historico-cheio')
    expect(r.copy).toBeNull()
    expect(r.blocos).toEqual(['cta'])
    expect(r.aviso).toMatch(/limite de 200 revisões/)
  })

  it('tentarCopyEfetivaDasCamadas devolve ok:false no lugar da exceção; com 199 devolve a leitura', () => {
    const recusa = tentarCopyEfetivaDasCamadas(cheio(MAX_REVISOES_DA_COPY), editadas, { superficie: 'recomposicao' })
    expect(recusa.ok).toBe(false)
    const lida = tentarCopyEfetivaDasCamadas(cheio(MAX_REVISOES_DA_COPY - 1), editadas, { superficie: 'recomposicao' })
    expect(lida.ok && lida.leitura.efetiva.revisoes.length).toBe(MAX_REVISOES_DA_COPY)
    expect(() => copyEfetivaDasCamadas(cheio(MAX_REVISOES_DA_COPY), editadas, { superficie: 'x' })).toThrow(/histórico da copy está cheio/)
  })
})
