import { describe, it, expect } from 'vitest'
import {
  PESOS,
  casaComTema,
  filtrarAcervo,
  palavrasDoTema,
  ranquearAcervo,
  type CriteriosDeFiltro,
  type EntradaDeRanking,
  type FotoRanqueada,
  type FotoRanqueavel,
  type PreferenciasDeFoto,
} from '../ranquear-acervo'

const HOJE = '2026-08-30'

function foto(driveFileId: string, extra: Partial<FotoRanqueavel> = {}): FotoRanqueavel {
  return { driveFileId, ...extra }
}

function semSinais(extra: Partial<PreferenciasDeFoto> = {}): PreferenciasDeFoto {
  return { escolhas: [], rejeicoes: [], feedbacks: [], ultimaAtividade: null, ...extra }
}

function entrada(imagens: FotoRanqueavel[], extra: Partial<EntradaDeRanking> = {}): EntradaDeRanking {
  return {
    imagens,
    preferencias: semSinais(),
    ultimoUso: new Map<string, string>(),
    destaques: new Set<string>(),
    hojeBRT: HOJE,
    ...extra,
  }
}

const ordem = (r: Array<FotoRanqueada>) => r.map((f) => f.imagem.driveFileId)
const porId = (r: Array<FotoRanqueada>, id: string) => {
  const achada = r.find((f) => f.imagem.driveFileId === id)
  if (!achada) throw new Error(`foto ${id} sumiu do resultado`)
  return achada
}

describe('palavrasDoTema', () => {
  it('quebra em palavras e tira stopwords — "cortes e churrasco" vira duas palavras, sem o "e"', () => {
    expect(palavrasDoTema('cortes e churrasco')).toEqual(['cortes', 'churrasco'])
  })

  it('normaliza acento e descarta palavra curta', () => {
    // 'à' e 'da' são stopwords; 'dj' tem menos de 3 caracteres.
    expect(palavrasDoTema('Almoço à moda da casa')).toEqual(['almoco', 'moda', 'casa'])
    expect(palavrasDoTema('dj no bar')).toEqual(['bar'])
  })

  it('tema só de stopwords devolve lista vazia', () => {
    expect(palavrasDoTema('e de para o')).toEqual([])
  })

  it('expande pelo pilar cujo slug/nome casa com o tema — e só por ele', () => {
    const pilares = [
      {
        slug: 'cortes-e-churrasco',
        nome: 'Cortes e Churrasco',
        exemplos: ['picanha na brasa', 'costela premiada'],
      },
      { slug: 'sobremesas', nome: 'Sobremesas', exemplos: ['pudim de leite'] },
    ]
    const palavras = palavrasDoTema('churrasco', pilares)
    expect(palavras).toContain('churrasco')
    expect(palavras).toContain('cortes')
    expect(palavras).toContain('picanha')
    expect(palavras).toContain('brasa')
    expect(palavras).toContain('costela')
    // O pilar que não casou não contamina a busca.
    expect(palavras).not.toContain('pudim')
    // Dedupe: 'churrasco' está no tema E no nome do pilar — entra uma vez.
    expect(palavras.filter((p) => p === 'churrasco')).toHaveLength(1)
  })
})

describe('casaComTema', () => {
  it('"cortes e churrasco" casa por PALAVRA — a tag "churrasco" basta (o caso que a substring da frase inteira perdia)', () => {
    const palavras = palavrasDoTema('cortes e churrasco')
    const { casa, relevancia } = casaComTema(foto('a', { tags: ['churrasco', 'fogo'] }), palavras)
    expect(casa).toBe(true)
    expect(relevancia).toBe(PESOS.CASAMENTO_TAGS)
  })

  it('acentos mistos casam: "almoço" do pedido acha "almoco" e "Almoço" do catálogo', () => {
    const palavras = palavrasDoTema('almoço executivo')
    expect(casaComTema(foto('a', { tags: ['almoco'] }), palavras).casa).toBe(true)
    expect(casaComTema(foto('b', { tags: ['Almoço'] }), palavras).casa).toBe(true)
  })

  it('cada palavra conta o MAIOR peso do campo em que casou; a relevância soma as palavras', () => {
    const palavras = palavrasDoTema('cortes e churrasco')
    // 'churrasco' casa em bestFor (3) e em tags (2) → vale 3; 'cortes' casa só na pasta (1).
    const img = foto('a', { bestFor: ['churrasco'], tags: ['churrasco'], folder: '01_cortes/picanha' })
    expect(casaComTema(img, palavras).relevancia).toBe(PESOS.CASAMENTO_BESTFOR + PESOS.CASAMENTO_PASTA)
  })

  it('stopwords não casam — nem como tema, nem como palavra da foto', () => {
    expect(casaComTema(foto('a', { tags: ['de', 'para'] }), palavrasDoTema('e de para o'))).toEqual({
      casa: false,
      relevancia: 0,
    })
    // O lado da foto também é filtrado: "picanha" não pode casar com a
    // preposição de uma pasta por substring.
    expect(casaComTema(foto('b', { folder: '01_de_a' }), palavrasDoTema('picanha')).casa).toBe(false)
  })
})

describe('filtrarAcervo', () => {
  type FotoDeCatalogo = FotoRanqueavel & { menuCategory?: string | null }
  const img = (driveFileId: string, extra: Partial<FotoDeCatalogo> = {}): FotoDeCatalogo => ({
    driveFileId,
    ...extra,
  })
  const criterios = (extra: Partial<CriteriosDeFiltro> = {}): CriteriosDeFiltro => ({
    temQualidadeNoCatalogo: true,
    palavrasDoTema: [],
    ...extra,
  })
  const ids = (r: Array<{ driveFileId: string }>) => r.map((f) => f.driveFileId)

  it('sem critério nenhum devolve tudo, na MESMA ordem — filtrar não é ordenar', () => {
    const fotos = [img('b'), img('a'), img('c')]
    expect(filtrarAcervo(fotos, criterios())).toEqual(fotos)
  })

  it('quality é MÍNIMO por ordem: "media" mantém alta e media; baixa e sem anotação caem', () => {
    const fotos = [
      img('alta', { quality: 'alta' }),
      img('media', { quality: 'media' }),
      img('baixa', { quality: 'baixa' }),
      img('sem-anotacao'),
    ]
    expect(ids(filtrarAcervo(fotos, criterios({ quality: 'media' })))).toEqual(['alta', 'media'])
    expect(ids(filtrarAcervo(fotos, criterios({ quality: 'baixa' })))).toEqual(
      ['alta', 'media', 'baixa', 'sem-anotacao'],
    )
  })

  it('quality é IGNORADO quando o catálogo não tem qualidade anotada — o aviso é do chamador', () => {
    const fotos = [img('a'), img('b')]
    expect(filtrarAcervo(fotos, criterios({ quality: 'alta', temQualidadeNoCatalogo: false }))).toEqual(fotos)
  })

  it('pasta filtra por PREFIXO normalizado: "01_cortes" pega a subpasta, e acento/caixa não separam', () => {
    const fotos = [
      img('picanha', { folder: '01_cortes/picanha-bovina' }),
      img('ambiente', { folder: '02_ambiente' }),
      img('executivo', { folder: 'Almoço/Executivo' }),
    ]
    expect(ids(filtrarAcervo(fotos, criterios({ folder: '01_cortes' })))).toEqual(['picanha'])
    expect(ids(filtrarAcervo(fotos, criterios({ folder: 'almoco' })))).toEqual(['executivo'])
  })

  it('fileName filtra por prefixo: "ambiente-f3a" acha "ambiente-f3a8693.jpg"', () => {
    const fotos = [img('a', { fileName: 'ambiente-f3a8693.jpg' }), img('b', { fileName: 'prato-01.jpg' })]
    expect(ids(filtrarAcervo(fotos, criterios({ fileName: 'ambiente-f3a' })))).toEqual(['a'])
  })

  it('menuCategory é igualdade ESTRITA, sem normalização', () => {
    const fotos = [img('a', { menuCategory: 'Carnes' }), img('b', { menuCategory: 'carnes' })]
    expect(ids(filtrarAcervo(fotos, criterios({ menuCategory: 'Carnes' })))).toEqual(['a'])
  })

  it('tags é interseção EXATA normalizada: "Churrasco" casa "churrasco"; o prefixo "churras" não', () => {
    const fotos = [img('a', { tags: ['churrasco', 'fogo'] }), img('b', { tags: ['sobremesa'] })]
    expect(ids(filtrarAcervo(fotos, criterios({ tags: ['Churrasco'] })))).toEqual(['a'])
    expect(ids(filtrarAcervo(fotos, criterios({ tags: ['churras'] })))).toEqual([])
  })

  it('tema casa por PALAVRA (F2): "cortes e churrasco" acerta a tag "churrasco" — o caso que a substring da frase inteira perdia', () => {
    const fotos = [img('casa', { tags: ['churrasco'] }), img('nao-casa', { tags: ['sobremesa'] })]
    const r = filtrarAcervo(fotos, criterios({ palavrasDoTema: palavrasDoTema('cortes e churrasco') }))
    expect(ids(r)).toEqual(['casa'])
  })

  it('tema com acentos mistos casa: "almoço executivo" acha "almoco" e "Almoço" do catálogo', () => {
    const fotos = [
      img('sem-acento', { tags: ['almoco'] }),
      img('com-acento', { bestFor: ['Almoço em família'] }),
      img('fora', { tags: ['jantar'] }),
    ]
    const r = filtrarAcervo(fotos, criterios({ palavrasDoTema: palavrasDoTema('almoço executivo') }))
    expect(ids(r)).toEqual(['sem-acento', 'com-acento'])
  })

  it('palavrasDoTema vazio = sem filtro de tema', () => {
    const fotos = [img('a'), img('b', { tags: ['churrasco'] })]
    expect(filtrarAcervo(fotos, criterios({ palavrasDoTema: [] }))).toEqual(fotos)
  })

  it('os critérios são conjuntivos: pasta E tema precisam casar', () => {
    const fotos = [
      img('certa', { folder: '01_cortes', tags: ['churrasco'] }),
      img('pasta-errada', { folder: '02_ambiente', tags: ['churrasco'] }),
      img('tema-errado', { folder: '01_cortes', tags: ['sobremesa'] }),
    ]
    const r = filtrarAcervo(
      fotos,
      criterios({ folder: '01_cortes', palavrasDoTema: palavrasDoTema('churrasco') }),
    )
    expect(ids(r)).toEqual(['certa'])
  })
})

describe('ranquearAcervo — sinais', () => {
  it('rejeitada no topo desce', () => {
    const r = ranquearAcervo(
      entrada([foto('rejeitada'), foto('neutra')], {
        preferencias: semSinais({
          rejeicoes: [{ driveFileId: 'rejeitada', tema: null, quando: '2026-08-01', posicao: 1 }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(ordem(r)).toEqual(['neutra', 'rejeitada'])
    expect(porId(r, 'rejeitada').componentes.rejeicaoGlobal).toBeCloseTo(PESOS.REJEICAO_GLOBAL, 5)
  })

  it('rejeição fora do topo (posicao > 3) não é sinal', () => {
    const r = ranquearAcervo(
      entrada([foto('funda')], {
        preferencias: semSinais({
          rejeicoes: [{ driveFileId: 'funda', tema: 'happy hour', quando: '2026-08-01', posicao: 4 }],
          ultimaAtividade: '2026-08-01',
        }),
        tema: 'happy hour',
      }),
    )
    expect(porId(r, 'funda').componentes.rejeicaoGlobal).toBe(0)
    expect(porId(r, 'funda').componentes.rejeicaoNoTema).toBe(0)
  })

  it('escolhida no tema sobe acima de neutra com a mesma relevância', () => {
    const r = ranquearAcervo(
      entrada([foto('neutra', { tags: ['churrasco'] }), foto('escolhida', { tags: ['churrasco'] })], {
        tema: 'churrasco',
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'escolhida', tema: 'churrasco de domingo', quando: '2026-08-01', sugestaoId: 's1' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(ordem(r)).toEqual(['escolhida', 'neutra'])
    expect(porId(r, 'escolhida').componentes.escolhaNoTema).toBeCloseTo(PESOS.ESCOLHA_NO_TEMA, 5)
    expect(porId(r, 'escolhida').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
  })

  it('escolha em OUTRO tema conta só o global', () => {
    const r = ranquearAcervo(
      entrada([foto('a')], {
        tema: 'churrasco',
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'a', tema: 'sobremesa', quando: '2026-08-01' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'a').componentes.escolhaNoTema).toBe(0)
    expect(porId(r, 'a').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
  })

  it('destaque vence UMA escolha cheia no tema', () => {
    const r = ranquearAcervo(
      entrada([foto('escolhida'), foto('destacada')], {
        tema: 'churrasco',
        destaques: new Set(['destacada']),
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'escolhida', tema: 'churrasco', quando: '2026-08-01' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    // 40 do destaque > 25+10 da escolha fresca no tema.
    expect(ordem(r)).toEqual(['destacada', 'escolhida'])
    expect(porId(r, 'destacada').componentes.destaque).toBe(PESOS.DESTAQUE)
  })

  it('feedback: positivo soma pouco; negativo só conta quando menciona a foto', () => {
    const r = ranquearAcervo(
      entrada([foto('boa'), foto('ruim'), foto('reprovada-pela-copy')], {
        preferencias: semSinais({
          feedbacks: [
            { driveFileId: 'boa', positivo: true, mencionaFoto: false, quando: '2026-08-01' },
            { driveFileId: 'ruim', positivo: false, mencionaFoto: true, quando: '2026-08-01' },
            { driveFileId: 'reprovada-pela-copy', positivo: false, mencionaFoto: false, quando: '2026-08-01' },
          ],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'boa').componentes.feedback).toBeCloseTo(PESOS.FEEDBACK_POSITIVO, 5)
    expect(porId(r, 'ruim').componentes.feedback).toBeCloseTo(PESOS.FEEDBACK_NEGATIVO, 5)
    expect(porId(r, 'reprovada-pela-copy').componentes.feedback).toBe(0)
  })

  it('quality do catálogo: alta sobe, baixa desce, media/ausente neutras — e "média" com acento vale como media', () => {
    const r = ranquearAcervo(
      entrada([
        foto('baixa', { quality: 'baixa' }),
        foto('alta', { quality: 'alta' }),
        foto('media', { quality: 'média' }),
        foto('sem', { quality: null }),
      ]),
    )
    expect(ordem(r)[0]).toBe('alta')
    expect(ordem(r)[3]).toBe('baixa')
    expect(porId(r, 'alta').componentes.qualidade).toBe(PESOS.QUALIDADE_ALTA)
    expect(porId(r, 'baixa').componentes.qualidade).toBe(PESOS.QUALIDADE_BAIXA)
    expect(porId(r, 'media').componentes.qualidade).toBe(0)
    expect(porId(r, 'sem').componentes.qualidade).toBe(0)
  })
})

describe('ranquearAcervo — motivo da troca', () => {
  const rejeicao = (id: string, motivo: string | null) => ({
    driveFileId: id,
    tema: 'happy hour',
    quando: '2026-08-01',
    posicao: 1,
    motivo,
  })

  it("'prato-antigo' rebaixa o global para o peso de defeito; 'nao-e-o-assunto' só conta no tema", () => {
    const r = ranquearAcervo(
      entrada([foto('prato-antigo'), foto('sem-motivo'), foto('fora-do-assunto')], {
        tema: 'happy hour',
        preferencias: semSinais({
          rejeicoes: [
            rejeicao('prato-antigo', 'prato-antigo'),
            rejeicao('sem-motivo', null),
            rejeicao('fora-do-assunto', 'nao-e-o-assunto'),
          ],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    const pratoAntigo = porId(r, 'prato-antigo')
    const semMotivo = porId(r, 'sem-motivo')
    const foraDoAssunto = porId(r, 'fora-do-assunto')

    // Defeito da foto: a parcela global sobe de −5 para −12.
    expect(pratoAntigo.componentes.rejeicaoGlobal).toBeCloseTo(PESOS.REJEICAO_GLOBAL_DEFEITO, 5)
    expect(semMotivo.componentes.rejeicaoGlobal).toBeCloseTo(PESOS.REJEICAO_GLOBAL, 5)
    // Problema do contexto, não da foto: nada de parcela global.
    expect(foraDoAssunto.componentes.rejeicaoGlobal).toBe(0)

    // A parcela do MESMO tema vale para as três.
    for (const f of [pratoAntigo, semMotivo, foraDoAssunto]) {
      expect(f.componentes.rejeicaoNoTema).toBeCloseTo(PESOS.REJEICAO_NO_TEMA, 5)
    }
    expect(pratoAntigo.score).toBeLessThan(semMotivo.score)
    expect(semMotivo.score).toBeLessThan(foraDoAssunto.score)
  })

  it("'repetida' também é defeito da foto", () => {
    const r = ranquearAcervo(
      entrada([foto('repetida')], {
        preferencias: semSinais({
          rejeicoes: [{ driveFileId: 'repetida', tema: null, quando: '2026-08-01', posicao: 2, motivo: 'repetida' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'repetida').componentes.rejeicaoGlobal).toBeCloseTo(PESOS.REJEICAO_GLOBAL_DEFEITO, 5)
  })
})

describe('ranquearAcervo — escolha vinda de correção pós-produção', () => {
  it('correção global vence escolha de busca global', () => {
    const r = ranquearAcervo(
      entrada([foto('da-busca'), foto('da-correcao')], {
        preferencias: semSinais({
          escolhas: [
            { driveFileId: 'da-busca', tema: null, quando: '2026-08-01' },
            { driveFileId: 'da-correcao', tema: null, quando: '2026-08-01', forca: 'correcao' },
          ],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(ordem(r)).toEqual(['da-correcao', 'da-busca'])
    expect(porId(r, 'da-correcao').componentes.escolhaCorrecaoGlobal).toBeCloseTo(PESOS.ESCOLHA_CORRECAO_GLOBAL, 5)
    expect(porId(r, 'da-correcao').componentes.escolhaGlobal).toBe(0)
    expect(porId(r, 'da-busca').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
  })

  it('correção com tema null não ganha o bônus de tema, mesmo com tema na busca', () => {
    const r = ranquearAcervo(
      entrada([foto('a', { tags: ['churrasco'] })], {
        tema: 'churrasco',
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'a', tema: null, quando: '2026-08-01', forca: 'correcao' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'a').componentes.escolhaCorrecaoTema).toBe(0)
    expect(porId(r, 'a').componentes.escolhaCorrecaoGlobal).toBeCloseTo(PESOS.ESCOLHA_CORRECAO_GLOBAL, 5)
  })

  it('o ramo de tema da correção existe para quando o sinal carregar tema', () => {
    const r = ranquearAcervo(
      entrada([foto('a')], {
        tema: 'churrasco',
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'a', tema: 'churrasco', quando: '2026-08-01', forca: 'correcao' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'a').componentes.escolhaCorrecaoTema).toBeCloseTo(PESOS.ESCOLHA_CORRECAO_TEMA, 5)
  })
})

describe('ranquearAcervo — novidade', () => {
  it('foto recém-catalogada aparece à frente das neutras antigas', () => {
    const r = ranquearAcervo(
      entrada([
        foto('antiga-sem-data'),
        foto('nova', { catalogadaEm: '2026-08-28' }),
        foto('catalogada-ha-meses', { catalogadaEm: '2026-05-01' }),
      ]),
    )
    expect(ordem(r)[0]).toBe('nova')
    // 2 dias: 15 × (1 − 2/21)
    expect(porId(r, 'nova').componentes.novidade).toBeCloseTo(15 * (1 - 2 / 21), 5)
    expect(porId(r, 'catalogada-ha-meses').componentes.novidade).toBe(0)
    expect(porId(r, 'antiga-sem-data').componentes.novidade).toBe(0)
  })

  it('o boost zera exatamente no dia 21', () => {
    const r = ranquearAcervo(entrada([foto('no-limite', { catalogadaEm: '2026-08-09' })]))
    expect(porId(r, 'no-limite').componentes.novidade).toBe(0)
  })
})

describe('ranquearAcervo — decaimento ancorado na última atividade', () => {
  const escolha = (id: string, quando: string) => ({ driveFileId: id, tema: null, quando })

  it('evento antigo RELATIVO à ultimaAtividade pesa menos; o relógio (hojeBRT) não entra', () => {
    const preferencias = semSinais({
      escolhas: [
        escolha('recente', '2026-08-01T00:00:00.000Z'),
        escolha('antiga', '2026-04-03T00:00:00.000Z'), // 120 dias = 2 meias-vidas antes da âncora
      ],
      ultimaAtividade: '2026-08-01T00:00:00.000Z',
    })
    const r = ranquearAcervo(entrada([foto('recente'), foto('antiga')], { preferencias }))
    expect(porId(r, 'recente').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
    expect(porId(r, 'antiga').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL * 0.25, 5)
    expect(ordem(r)).toEqual(['recente', 'antiga'])

    // Meses depois, SEM atividade nova, os pesos são os mesmos: a âncora é a
    // atividade, nunca o relógio — senão o cliente parado perderia o histórico.
    const depois = ranquearAcervo(entrada([foto('recente'), foto('antiga')], { preferencias, hojeBRT: '2027-01-01' }))
    expect(porId(depois, 'recente').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
    expect(porId(depois, 'antiga').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL * 0.25, 5)
  })

  it('sem ultimaAtividade nada decai: peso 1', () => {
    const r = ranquearAcervo(
      entrada([foto('a')], {
        preferencias: semSinais({ escolhas: [escolha('a', '2020-01-01')] }),
      }),
    )
    expect(porId(r, 'a').componentes.escolhaGlobal).toBeCloseTo(PESOS.ESCOLHA_GLOBAL, 5)
  })
})

describe('ranquearAcervo — ordem, empate e semente diária', () => {
  const neutras = () => Array.from({ length: 10 }, (_, i) => foto(`p${String(i + 1).padStart(2, '0')}`))

  it('empate é estável dentro do mesmo dia', () => {
    const a = ordem(ranquearAcervo(entrada(neutras())))
    const b = ordem(ranquearAcervo(entrada(neutras())))
    expect(a).toEqual(b)
  })

  it('empate MUDA entre dias diferentes — a mesma desconhecida não mora no topo', () => {
    const hoje = ordem(ranquearAcervo(entrada(neutras(), { hojeBRT: '2026-08-30' })))
    const amanha = ordem(ranquearAcervo(entrada(neutras(), { hojeBRT: '2026-08-31' })))
    expect(hoje).not.toEqual(amanha)
    // Mudou a ordem, não o conjunto.
    expect([...hoje].sort()).toEqual([...amanha].sort())
  })

  it('no empate de score, o rodízio desempata: nunca usada primeiro, depois a mais antiga', () => {
    const r = ranquearAcervo(
      entrada([foto('usada-em-fev'), foto('nunca-usada'), foto('usada-em-jan')], {
        ultimoUso: new Map([
          ['usada-em-fev', '2026-02-10'],
          ['usada-em-jan', '2026-01-10'],
        ]),
      }),
    )
    expect(ordem(r)).toEqual(['nunca-usada', 'usada-em-jan', 'usada-em-fev'])
  })

  it('score ordena, nunca esconde: a foto muito rejeitada continua na lista, por último', () => {
    const rejeicoes = [1, 2, 3].map((posicao) => ({
      driveFileId: 'condenada',
      tema: null,
      quando: '2026-08-01',
      posicao,
      motivo: 'prato-antigo',
    }))
    const r = ranquearAcervo(
      entrada([foto('condenada'), foto('a'), foto('b')], {
        preferencias: semSinais({ rejeicoes, ultimaAtividade: '2026-08-01' }),
      }),
    )
    expect(r).toHaveLength(3)
    expect(ordem(r)[2]).toBe('condenada')
    expect(porId(r, 'condenada').score).toBeLessThan(0)
  })
})

describe('ranquearAcervo — vaga de exploração', () => {
  it('só a foto sem NENHUM sinal e sem uso registrado é exploração', () => {
    const r = ranquearAcervo(
      entrada([foto('desconhecida'), foto('ja-usada'), foto('ja-vista-na-lista'), foto('com-feedback')], {
        ultimoUso: new Map([['ja-usada', '2026-05-01']]),
        preferencias: semSinais({
          // Rejeição funda não mexe no score, mas prova que a foto foi vista.
          rejeicoes: [{ driveFileId: 'ja-vista-na-lista', tema: null, quando: '2026-08-01', posicao: 9 }],
          feedbacks: [{ driveFileId: 'com-feedback', positivo: true, mencionaFoto: false, quando: '2026-08-01' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(porId(r, 'desconhecida').vagaDeExploracao).toBe(true)
    expect(porId(r, 'ja-usada').vagaDeExploracao).toBe(false)
    expect(porId(r, 'ja-vista-na-lista').vagaDeExploracao).toBe(false)
    expect(porId(r, 'com-feedback').vagaDeExploracao).toBe(false)
  })
})

describe('ranquearAcervo — relevância do tema no score', () => {
  it('a relevância entra multiplicada e só quando há tema', () => {
    const imagens = [foto('relevante', { bestFor: ['churrasco'] }), foto('neutra')]
    const comTema = ranquearAcervo(entrada(imagens, { tema: 'cortes e churrasco' }))
    expect(porId(comTema, 'relevante').componentes.relevancia).toBe(
      PESOS.CASAMENTO_BESTFOR * PESOS.RELEVANCIA_POR_PONTO,
    )
    expect(ordem(comTema)[0]).toBe('relevante')

    const semTema = ranquearAcervo(entrada(imagens))
    expect(porId(semTema, 'relevante').componentes.relevancia).toBe(0)
  })

  it('a expansão por pilar alcança a foto descrita pelo exemplo', () => {
    const pilares = [{ slug: 'cortes-e-churrasco', nome: 'Cortes e Churrasco', exemplos: ['picanha na brasa'] }]
    const r = ranquearAcervo(
      entrada([foto('picanha', { tags: ['picanha'] }), foto('neutra')], { tema: 'churrasco', pilares }),
    )
    expect(ordem(r)[0]).toBe('picanha')
    expect(porId(r, 'picanha').componentes.relevancia).toBeGreaterThan(0)
  })
})

describe('ranquearAcervo — o que o catálogo sabe que fere o DNA', () => {
  it('preço legível rebaixa −8, marca de terceiro −5, e os dois somam; campo ausente é neutro', () => {
    const r = ranquearAcervo(
      entrada([
        foto('limpa'),
        foto('com-preco', { precoLegivel: true }),
        foto('com-marca', { marcaDeTerceiro: 'Brahma' }),
        foto('com-os-dois', { precoLegivel: true, marcaDeTerceiro: 'Coca-Cola' }),
        foto('sem-preco-declarado', { precoLegivel: false, marcaDeTerceiro: null }),
      ]),
    )
    expect(porId(r, 'com-preco').componentes.dna).toBe(PESOS.PRECO_LEGIVEL)
    expect(porId(r, 'com-marca').componentes.dna).toBe(PESOS.MARCA_DE_TERCEIRO)
    expect(porId(r, 'com-os-dois').componentes.dna).toBe(PESOS.PRECO_LEGIVEL + PESOS.MARCA_DE_TERCEIRO)
    expect(porId(r, 'limpa').componentes.dna).toBe(0)
    expect(porId(r, 'sem-preco-declarado').componentes.dna).toBe(0)
    // Ordena, nunca esconde: as cinco continuam na lista, e as feridas descem.
    expect(r).toHaveLength(5)
    expect(ordem(r).slice(-3)).toEqual(['com-marca', 'com-preco', 'com-os-dois'])
  })

  it('a foto com preço legível fica abaixo de uma escolha global, mas o destaque ainda a segura', () => {
    const r = ranquearAcervo(
      entrada([foto('escolhida'), foto('com-preco', { precoLegivel: true }), foto('destaque-com-preco', { precoLegivel: true })], {
        destaques: new Set(['destaque-com-preco']),
        preferencias: semSinais({
          escolhas: [{ driveFileId: 'escolhida', tema: null, quando: '2026-08-01' }],
          ultimaAtividade: '2026-08-01',
        }),
      }),
    )
    expect(ordem(r)).toEqual(['destaque-com-preco', 'escolhida', 'com-preco'])
  })
})
