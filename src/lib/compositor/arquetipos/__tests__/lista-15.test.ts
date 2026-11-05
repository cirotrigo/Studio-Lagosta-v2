/**
 * #15 `minimal-tipografico-lista`, no módulo puro: o contrato da lista (validador), o fio por ITEM (um por item, preso
 * ao topo do item — também do item com duas linhas visuais), os itens como obstáculo e as TRÊS faixas sem foto dentro
 * dos limites da busca (1 combinação por corte, nenhuma avaliação); com foto, o teto de 2 faixas não mudou.
 */
import { describe, expect, it } from 'vitest'
import { NUMEROS_PADRAO } from '../../assinatura'
import { verArquetipo } from '../catalogo'
import { obstaculosDosAcentos, posicionarAcentos, receitasDoArquetipo } from '../acentos'
import { candidatosDasFaixas, combinacoesDasFaixas, faixasDoArquetipo } from '../candidatos-espaciais'
import { LIMITES_DA_BUSCA } from '../busca-espacial-tipos'
import { validarArquetipo } from '../validar'
import type { RetanguloPx } from '../materializar'
import type { ArquetipoDeLayout, FormatoDoArquetipo, PapelDeTexto } from '../tipos'

const LISTA = verArquetipo('minimal-tipografico-lista')!
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const copia = (): any => JSON.parse(JSON.stringify(LISTA))
const codigos = (a: unknown) => validarArquetipo(a as ArquetipoDeLayout).map((p) => `${p.codigo} ${p.campo}`)
const ref = (f: FormatoDoArquetipo, papel: PapelDeTexto | 'logo'): RetanguloPx => {
  const r = (LISTA.formatos[f].papeis[papel] as any).referencia
  return { x: r.x * CANVAS[f].width, y: r.y * CANVAS[f].height, width: r.w * CANVAS[f].width, height: r.h * CANVAS[f].height }
}

describe('#15 · contrato da lista', () => {
  it('a definição publicada é válida; Story e Feed são geometrias próprias', () => {
    expect(validarArquetipo(LISTA)).toEqual([])
    expect(LISTA.formatos.story).not.toEqual(LISTA.formatos.feed)
    expect(LISTA.fundo).toBe('liso-claro')
  })

  it('lista só no apoio; porItem só no fio preso a uma lista; vão obrigatório e coerente com o fio', () => {
    const naManchete = copia()
    naManchete.papeis[0].lista = true
    expect(codigos(naManchete)).toContain('CAMPO_INVALIDO papeis[0].lista')
    const semLista = copia()
    delete semLista.papeis[1].lista
    expect(codigos(semLista)).toEqual(expect.arrayContaining(['CAMPO_INVALIDO elementos[0].porItem', 'PAPEL_FORA_DO_CONTRATO formatos.story.itens.apoio']))
    const semVao = copia()
    delete semVao.formatos.feed.itens
    expect(codigos(semVao)).toEqual(['POSICAO_AUSENTE formatos.feed.itens.apoio'])
    const vaoPequeno = copia()
    vaoPequeno.formatos.story.itens.apoio.vao = 0.005
    expect(codigos(vaoPequeno)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.elementos.fio'])
    const fioAbaixo = copia()
    fioAbaixo.formatos.story.elementos.fio.y = 0.6
    expect(codigos(fioAbaixo)).toContain('PREFERENCIA_INCOERENTE formatos.story.elementos.fio')
    const chaveNova = copia()
    chaveNova.formatos.story.itens.apoio.passo = 0.1
    expect(codigos(chaveNova)).toEqual(['CAMPO_DESCONHECIDO formatos.story.itens.apoio.passo'])
  })
})

describe('#15 · um fio por item, preso ao topo do item', () => {
  for (const f of ['story', 'feed'] as const) {
    it(`${f}: o item com DUAS linhas visuais continua um item e um fio; o fio seguinte segue o topo do item seguinte`, () => {
      const lista = ref(f, 'apoio')
      const vao = Math.round(LISTA.formatos[f].itens!.apoio!.vao * CANVAS[f].height)
      // O 2º item ocupa duas linhas visuais (altura dobrada): é UMA caixa.
      const alturas = [46, 92, 46]
      let y = lista.y
      const itens = alturas.map((h) => {
        const r = { x: Math.round(lista.x), y: Math.round(y), width: 600, height: h }
        y += h + vao
        return r
      })
      const papeis = { headline: { posicao: ref(f, 'headline') }, apoio: { posicao: { ...lista, height: y - vao - lista.y } } }
      const unidades = [
        { papel: 'headline' as const, ornamentos: { esquerda: 0, direita: 0, topo: 0, base: 0 } },
        { papel: 'apoio' as const, ornamentos: { esquerda: 0, direita: 0, topo: 0, base: 0 } },
      ]
      const obstaculos = obstaculosDosAcentos(unidades, papeis, ref(f, 'logo'), { apoio: itens })
      expect(obstaculos.map((o) => o.id)).toEqual(['headline', 'apoio#1', 'apoio#2', 'apoio#3', 'logo'])
      const receitas = receitasDoArquetipo(LISTA).receitas
      // A receita gravada vem UMA por fio desenhado: a repetição não multiplica fios.
      const pos = posicionarAcentos({ arquetipo: LISTA, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: [...receitas, ...receitas, ...receitas], papeis, obstaculos, itens: { apoio: itens } })
      expect([pos.recusas, pos.omitidos]).toEqual([[], []])
      expect(pos.acentos.map((a) => a.item)).toEqual([1, 2, 3])
      const e = LISTA.formatos[f].elementos!.fio
      const r = (LISTA.formatos[f].papeis.apoio as any).referencia
      const acima = (r.y - (e.y + e.h)) * CANVAS[f].height
      pos.acentos.forEach((a, k) => {
        expect(a.rect.y + a.rect.height, `fio ${k + 1}`).toBe(Math.round(itens[k].y - acima))
        if (k > 0) expect(a.rect.y).toBeGreaterThan(itens[k - 1].y + itens[k - 1].height)
      })
      // O passo entre os fios 2→3 é o do item 2 inteiro (as duas linhas), não o de uma linha.
      expect(pos.acentos[2].rect.y - pos.acentos[1].rect.y).toBe(itens[2].y - itens[1].y)
    })
  }

  it('rodada 1: o ornamento do 1º item que desce no vão é obstáculo do fio do 2º — só o que ele ocupa', () => {
    const f = 'story'
    const lista = ref(f, 'apoio')
    const vao = Math.round(LISTA.formatos[f].itens!.apoio!.vao * CANVAS[f].height)
    const itens = [0, 1, 2].map((k) => ({ x: Math.round(lista.x), y: Math.round(lista.y + k * (52 + vao)), width: 600, height: 52 }))
    const papeis = { apoio: { posicao: { ...lista, height: 3 * 52 + 2 * vao } } }
    const posicionar = (base: number) => {
      const zero = { esquerda: 0, direita: 0, topo: 0, base: 0 }
      // O envelope da unidade NÃO vê o filete (ele não sai da pilha): só o por-bloco o vê.
      const u = { papel: 'apoio' as const, ornamentos: zero, ornamentosPorBloco: [{ ...zero, base }, zero, zero] }
      const obstaculos = obstaculosDosAcentos([u], papeis, null, { apoio: itens })
      return { obstaculos, pos: posicionarAcentos({ arquetipo: LISTA, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: receitasDoArquetipo(LISTA).receitas, papeis, obstaculos, itens: { apoio: itens } }) }
    }
    // Filete que desce até o fio do 2º item: recusa do fio 2 (obrigatório), nomeando o item 1.
    const fundo = posicionar(vao - 10)
    expect(fundo.obstaculos[0].rect.height).toBe(52 + vao - 10)
    expect(fundo.pos.recusas.map((p) => [p.item, p.motivo.includes('apoio#1')])).toEqual([[2, true]])
    // Controle: filete curto, rente ao item — o vão segue livre, os 3 fios pousam.
    const rente = posicionar(8)
    expect([rente.pos.recusas, rente.pos.acentos.map((a) => a.item)]).toEqual([[], [1, 2, 3]])
  })

  it('sem o vão (itens colados), o fio encosta no item de cima e o obrigatório RECUSA — nunca é empurrado', () => {
    const f = 'story'
    const lista = ref(f, 'apoio')
    const itens = [0, 1, 2].map((k) => ({ x: Math.round(lista.x), y: Math.round(lista.y + k * 50), width: 600, height: 50 }))
    const papeis = { apoio: { posicao: { ...lista, height: 150 } } }
    const obstaculos = obstaculosDosAcentos([{ papel: 'apoio', ornamentos: { esquerda: 0, direita: 0, topo: 0, base: 0 } }], papeis, null, { apoio: itens })
    const pos = posicionarAcentos({ arquetipo: LISTA, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: receitasDoArquetipo(LISTA).receitas, papeis, obstaculos, itens: { apoio: itens } })
    expect(pos.acentos.map((a) => a.item)).toEqual([1])
    expect(pos.recusas.map((p) => [p.item, p.opcional])).toEqual([
      [2, false],
      [3, false],
    ])
  })
})

describe('#15 · três faixas sem foto, dentro dos limites da busca', () => {
  const papel = (f: FormatoDoArquetipo, p: PapelDeTexto | 'logo') => {
    const z = (LISTA.formatos[f].papeis[p] as any).zona
    const { width: W, height: H } = CANVAS[f]
    return { posicao: ref(f, p), zonaEfetiva: { x: z.xMin * W, y: z.yMin * H, width: (z.xMax - z.xMin) * W, height: (z.yMax - z.yMin) * H } }
  }
  const papeis = (f: FormatoDoArquetipo) => Object.fromEntries((['headline', 'logo', 'apoio', 'cta', 'servico'] as const).map((p) => [p, papel(f, p)])) as any

  for (const f of ['story', 'feed'] as const) {
    it(`${f}: manchete+logo, lista e rodapé (cta | serviço) — 3 faixas × 1 candidato = 1 combinação`, () => {
      expect(faixasDoArquetipo(LISTA, f)).toEqual([['headline', 'logo'], ['apoio'], ['cta', 'servico']])
      const faixas = candidatosDasFaixas({ arquetipo: LISTA, formato: f, papeis: papeis(f), ornamentos: {} })
      expect(faixas.map((x) => x.candidatos)).toEqual([[{ rotulo: 'referencia', dy: 0 }], [{ rotulo: 'referencia', dy: 0 }], [{ rotulo: 'referencia', dy: 0 }]])
      const combinacoes = combinacoesDasFaixas(faixas)
      expect(combinacoes).toHaveLength(1)
      // Os tetos de sempre continuam coerentes: 1 ≤ 25 por corte; sem foto não há corte, 0 ≤ 75 avaliações.
      expect(combinacoes.length).toBeLessThanOrEqual(LIMITES_DA_BUSCA.combinacoesPorCorte)
      expect(LIMITES_DA_BUSCA).toMatchObject({ faixas: 2, faixasSemFoto: 3, candidatosPorFaixa: 5, combinacoesPorCorte: 25, avaliacoes: 75 })
    })
  }

  it('controle: a MESMA geometria de 3 faixas num arquétipo COM foto continua passando do teto de 2 (a busca não foi ampliada)', () => {
    const comFoto = copia()
    delete comFoto.fundo
    expect(() => candidatosDasFaixas({ arquetipo: comFoto, formato: 'story', papeis: papeis('story'), ornamentos: {} })).toThrow(/3 faixas passam do limite de 2/)
  })

  it('sem foto, uma 4ª faixa também passa do teto (3)', () => {
    const quatro = copia()
    quatro.papeis.push({ papel: 'pre', obrigatorio: false, ordemDeLeitura: 5 })
    quatro.formatos.story.papeis.pre = { referencia: { x: 0.085, y: 0.42, w: 0.3, h: 0.02 }, zona: { xMin: 0.085, xMax: 0.5, yMin: 0.41, yMax: 0.46 } }
    const p = { ...papeis('story'), pre: { posicao: { x: 92, y: 806, width: 300, height: 38 }, zonaEfetiva: { x: 92, y: 787, width: 448, height: 96 } } }
    expect(() => candidatosDasFaixas({ arquetipo: quatro, formato: 'story', papeis: p, ornamentos: {} })).toThrow(/4 faixas passam do limite de 3/)
  })
})
