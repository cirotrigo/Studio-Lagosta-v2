/**
 * O diretor de arte da GERAÇÃO, reescrito em 08/09/2026 em cima do briefing
 * do Ciro. O que se protege aqui são as travas MECÂNICAS — cada uma é uma
 * lição medida, e é este teste que impede a próxima reescrita do system
 * prompt de perdê-las — e o que SAIU dele de propósito (halo, véu, degradê,
 * tetos numéricos): se alguém reintroduzir, o teste acusa.
 */
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_GERACAO,
  caixaAlterada,
  logoNoCantoDoAvatar,
  TETO_DO_PROMPT_PLANEJADO_GERACAO,
  fontesForaDaReferencia,
  montarContextoDaGeracao,
  palavrasDaReferenciaNoPrompt,
  problemasDoBriefing,
  servicoSemRodape,
  tratamentoDeFotoNoPrompt,
  type PlanejarArteArgs,
} from '../diretor-de-arte'

const copyVix = ['Happy Hour', 'Brinde com descontos especiais em vinhos e entradas selecionadas.', 'Seg a Sáb - 16h às 19h']

const briefingBom = `Crie uma arte para Story do Instagram, formato vertical 9:16, seguindo rigorosamente a identidade visual da Wine Vix apresentada no manual de marca anexado (Imagem 2). Peça editorial de gastronomia e vinho, com bastante respiro e poucos elementos gráficos.

FOTO DE FUNDO
A Imagem 1 é a única imagem principal, em tela cheia. O grupo brindando e os rostos ficam completamente visíveis. O espaço calmo está no terço superior; o bloco principal vai ali.

IDENTIDADE VISUAL
Imagem 2 é o manual: use a Playfair Display do painel de tipografia para a manchete e a sans-serif oficial para o resto. Creme para os textos; o dourado oficial só como destaque.

LOGOTIPO
A versão principal do painel de logos, centralizada no topo a ~5% da altura, ~16% da largura.

BLOCO PRINCIPAL
Entre 15% e 34% da altura, centralizado.

TÍTULO
"Happy Hour" na serifa de manchete do manual, grande; "Hour" no dourado.

SUBTÍTULO
"Brinde com descontos especiais em vinhos e entradas selecionadas." na sans-serif oficial, regular, creme, em duas linhas.

ÁREA LIVRE
De 35% a 83% da altura só a fotografia.

RODAPÉ
"Seg a Sáb - 16h às 19h" isolado entre 90% e 94% da altura, na sans-serif oficial, com um filete dourado de cada lado.

HIERARQUIA VISUAL
1. Happy Hour 2. o apoio 3. a fotografia 4. o horário 5. a marca.

EVITE
– excesso de dourado
– elementos que cubram as pessoas
– qualquer texto além da copy fornecida

TEXTOS FINAIS — NÃO ALTERAR
Happy Hour
Brinde com descontos especiais em vinhos e entradas selecionadas.
Seg a Sáb - 16h às 19h
Não corrigir, complementar, abreviar ou adicionar nenhuma outra informação.`

function args(extra: Partial<PlanejarArteArgs> = {}): PlanejarArteArgs {
  return {
    copy: copyVix,
    pedido: '',
    brand: {
      projectName: 'Wine Vix',
      fonts: { title: 'Playfair Display', subtitle: null, body: 'Lato' },
      colors: [],
      specimenFontFamilies: [],
      dna: {},
    } as unknown as PlanejarArteArgs['brand'],
    referencias: [
      { indice: 1, papel: 'subject', buffer: Buffer.from('x') },
      { indice: 2, papel: 'brand-card', rotulo: 'manual oficial de identidade', buffer: Buffer.from('y') },
    ],
    formato: 'story',
    alturaPx: 1936,
    instrucaoImagem: null,
    logoCompor: false,
    ...extra,
  }
}

describe('o system prompt do diretor da geração', () => {
  it('não prescreve halo, véu nem degradê — a leitura é do gpt-image (Ciro, 08/09/2026)', () => {
    const corpo = SYSTEM_GERACAO.toLowerCase()
    // As palavras só aparecem para dizer que NÃO se prescrevem.
    const frases = corpo.split(/[.\n]/).filter((f) => /halo|v[ée]u|degrad|gradiente/.test(f))
    expect(frases.length).toBeGreaterThan(0)
    for (const f of frases) expect(f).toMatch(/não prescreva|saíram|não prescreve|resolve a leitura/)
  })
  it('não carrega os tetos numéricos de tamanho do diretor antigo', () => {
    expect(SYSTEM_GERACAO).not.toMatch(/1\/5 do quadro/)
    expect(SYSTEM_GERACAO).not.toMatch(/15% da altura/)
  })
  it('pede o briefing em português, por seções, com os textos finais por último', () => {
    expect(SYSTEM_GERACAO).toMatch(/em PORTUGUÊS/)
    for (const secao of ['FOTO DE FUNDO', 'IDENTIDADE VISUAL', 'LOGOTIPO', 'BLOCO PRINCIPAL', 'RODAPÉ', 'HIERARQUIA VISUAL', 'EVITE', 'TEXTOS FINAIS']) {
      expect(SYSTEM_GERACAO).toContain(secao)
    }
  })
  it('manda traduzir a referência escolhida à mão em instruções, nunca citá-la como imagem', () => {
    expect(SYSTEM_GERACAO).toMatch(/o designer NÃO a recebe/)
  })
})

describe('as travas mecânicas do briefing', () => {
  it('aceita o briefing no molde do Ciro', () => {
    expect(problemasDoBriefing(briefingBom, args())).toEqual([])
  })
  it('recusa briefing sem um bloco da copy', () => {
    const sem = briefingBom.replace(/Seg a Sáb - 16h às 19h/g, '')
    const problemas = problemasDoBriefing(sem, args())
    expect(problemas.join('\n')).toMatch(/NÃO estão no briefing/)
  })
  it('recusa nome de fonte fora da linha "Imagem N" — e aceita na linha da imagem', () => {
    expect(fontesForaDaReferencia(briefingBom, ['Playfair Display', 'Lato'])).toEqual([])
    const solto = briefingBom.replace('na serifa de manchete do manual', 'em Playfair Display Bold Italic')
    expect(fontesForaDaReferencia(solto, ['Playfair Display'])).toEqual(['playfair'])
    expect(problemasDoBriefing(solto, args()).join('\n')).toMatch(/nome de fonte fora/)
  })
  it('recusa tratamento de foto prescrito (degradê, halo, véu)', () => {
    expect(tratamentoDeFotoNoPrompt('aplique um degradê preto muito sutil vindo do topo')).toEqual(['degradê'])
    expect(tratamentoDeFotoNoPrompt('um halo escuro atrás do texto')).toEqual(['halo'])
    expect(tratamentoDeFotoNoPrompt('sem véu')).toEqual(['véu'])
    expect(tratamentoDeFotoNoPrompt(briefingBom)).toEqual([])
    const com = briefingBom.replace('O espaço calmo está no terço superior', 'Aplique um degradê escuro no topo')
    expect(problemasDoBriefing(com, args()).join('\n')).toMatch(/tratamento sobre a foto/)
  })
  it('exige a seção RODAPÉ quando a copy tem serviço — e não quando não tem', () => {
    expect(servicoSemRodape(briefingBom, copyVix)).toEqual([])
    const semRodape = briefingBom.replace('RODAPÉ\n', 'HORÁRIO\n')
    expect(servicoSemRodape(semRodape, copyVix)).toEqual(['Seg a Sáb - 16h às 19h'])
    expect(servicoSemRodape('qualquer coisa', ['Happy Hour', 'Brinde com a gente'])).toEqual([])
  })
  it('recusa frase da referência que não está na copy', () => {
    const textos = ['Funcionamento - 11h às 00h', 'R. Aleixo Netto, 1158', 'Wine Vix', 'Vinho']
    const vazado = `${briefingBom}\n\nReproduza "Funcionamento - 11h às 00h" no rodapé.`
    expect(palavrasDaReferenciaNoPrompt(vazado, copyVix, textos, 'Wine Vix')).toEqual(['Funcionamento - 11h às 00h'])
    expect(palavrasDaReferenciaNoPrompt(briefingBom, copyVix, textos, 'Wine Vix')).toEqual([])
    // Frase da referência que TAMBÉM está na copy tem lastro: não é vazamento.
    expect(palavrasDaReferenciaNoPrompt(briefingBom, copyVix, ['Seg a Sáb - 16h às 19h'], 'Wine Vix')).toEqual([])
  })
  it('recusa briefing acima do teto', () => {
    const longo = `${briefingBom}\n${'x'.repeat(TETO_DO_PROMPT_PLANEJADO_GERACAO)}`
    expect(problemasDoBriefing(longo, args()).join('\n')).toMatch(/teto/)
  })
})

describe('o contexto que o diretor recebe', () => {
  it('separa o que o gpt-image recebe do que só o diretor vê', () => {
    const ctx = montarContextoDaGeracao(
      args({
        referencias: [
          { indice: 1, papel: 'subject', buffer: Buffer.from('x') },
          { indice: 2, papel: 'brand-card', buffer: Buffer.from('y') },
          { indice: 0, papel: 'style-guide', buffer: Buffer.from('z'), visivelAoGerador: false },
        ],
      }),
    )
    expect(ctx).toMatch(/Imagem 1: a FOTO REAL/)
    expect(ctx).toMatch(/Imagem 2: o MANUAL DE MARCA/)
    expect(ctx).toMatch(/REFERÊNCIA QUE SÓ VOCÊ VÊ/)
    expect(ctx).toMatch(/modo ESTRITO/)
    expect(ctx).not.toMatch(/Imagem 0/)
  })
  it('leva a leitura medida e o catálogo da foto quando existem', () => {
    const ctx = montarContextoDaGeracao(
      args({ leituraDaFoto: 'LEITURA MEDIDA DA FOTO: terço superior calmo', catalogoDaFoto: 'CATÁLOGO DA FOTO: assunto: picanha' }),
    )
    expect(ctx).toContain('LEITURA MEDIDA DA FOTO')
    expect(ctx).toContain('assunto: picanha')
  })
  it('diz que a marca é colada por código quando for', () => {
    expect(montarContextoDaGeracao(args({ logoCompor: true }))).toMatch(/COLADA POR CÓDIGO/)
    expect(montarContextoDaGeracao(args())).toMatch(/painel de logos do manual/)
  })
})

describe('as travas que o By Rock ensinou em 08/09/2026', () => {
  it('recusa trecho da copy com a caixa trocada, inclusive na quebra sugerida', () => {
    const copy = ['Rende pra galera', 'Costela ao barbecue, tudo pronto pra dividir.']
    expect(caixaAlterada('Quebra sugerida:\n"RENDE PRA"\n"GALERA"', copy)).toEqual(['RENDE PRA', 'GALERA'])
    expect(caixaAlterada('Texto: "Rende pra galera"\n"Costela ao barbecue,"\n"tudo pronto pra dividir."', copy)).toEqual([])
    // Trecho que não é da copy (nome de cor, seção) não é acusado.
    expect(caixaAlterada('cor "Amarelo da logo"', copy)).toEqual([])
    const briefing = briefingBom.replace('"Happy Hour" na serifa', '"HAPPY HOUR" na serifa')
    expect(problemasDoBriefing(briefing, args()).join('\n')).toMatch(/caixa das letras foi alterada/)
  })
  it('recusa a marca no canto do avatar em story — pelo campo e pela seção LOGOTIPO', () => {
    expect(logoNoCantoDoAvatar(briefingBom, 'story', 'superior-esquerdo')).toBe(true)
    expect(logoNoCantoDoAvatar(briefingBom, 'feed', 'superior-esquerdo')).toBe(false)
    expect(logoNoCantoDoAvatar(briefingBom, 'story', 'superior-direito')).toBe(false)
    const noAvatar = briefingBom.replace('centralizada no topo a ~5% da altura', 'no canto superior-esquerdo, a ~5% da altura')
    expect(logoNoCantoDoAvatar(noAvatar, 'story', undefined)).toBe(true)
    expect(problemasDoBriefing(noAvatar, args()).join('\n')).toMatch(/canto superior-esquerdo/)
    expect(problemasDoBriefing(briefingBom, args(), 'superior-direito')).toEqual([])
  })
})
