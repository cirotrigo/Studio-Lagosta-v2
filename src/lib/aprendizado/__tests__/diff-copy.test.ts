import { describe, it, expect } from 'vitest'
import { alinharChavesDaProposta, copyDeCamadas, copyParaDecisao, desfechoPeloDiff, diffDeCopy, semelhanca } from '../diff-copy'

const SUGERIDA = {
  titulo: 'HAPPY HOUR',
  subtitulo: 'Todas as quintas',
  rodape: 'A partir das 18h',
}

describe('diffDeCopy — comparação por campo', () => {
  it('igual em tudo: não mudou', () => {
    const d = diffDeCopy(SUGERIDA, { ...SUGERIDA })
    expect(d.mudou).toBe(false)
    expect(d.ilegivel).toBe(false)
    expect(d.iguais.sort()).toEqual(['rodape', 'subtitulo', 'titulo'])
    expect(d.proporcaoAlterada).toBe(0)
    expect(desfechoPeloDiff(d)).toBe('aceita-como-veio')
  })

  it('um campo reescrito aparece com antes e depois', () => {
    const d = diffDeCopy(SUGERIDA, { ...SUGERIDA, titulo: 'HAPPY HOUR DOBRADO' })
    expect(d.mudou).toBe(true)
    expect(d.alterados).toHaveLength(1)
    expect(d.alterados[0]).toMatchObject({
      campo: 'titulo',
      antes: 'HAPPY HOUR',
      depois: 'HAPPY HOUR DOBRADO',
      apenasFormatacao: false,
    })
    expect(d.proporcaoAlterada).toBeCloseTo(1 / 3, 5)
    expect(desfechoPeloDiff(d)).toBe('editada')
  })

  it('campo tirado e campo posto são coisas diferentes', () => {
    const d = diffDeCopy(SUGERIDA, { titulo: 'HAPPY HOUR', subtitulo: 'Todas as quintas', selo: 'NOVO' })
    expect(d.removidos).toEqual([{ campo: 'rodape', texto: 'A partir das 18h' }])
    expect(d.adicionados).toEqual([{ campo: 'selo', texto: 'NOVO' }])
    expect(d.alterados).toHaveLength(0)
  })

  // Caixa e separador de lista somem na normalização da casa. É edição de
  // diagramação, e a F2 vai querer pesá-la diferente de uma reescrita.
  it('marca a edição que é só formatação', () => {
    const d = diffDeCopy({ titulo: 'Happy Hour · Quinta' }, { titulo: 'HAPPY HOUR   QUINTA' })
    expect(d.mudou).toBe(true)
    expect(d.alterados[0]).toMatchObject({ apenasFormatacao: true, diferenca: 'formatacao' })
  })

  // Acento, caixa, espaço e palavra são QUATRO coisas diferentes (12/09/2026):
  // correção de acento é correção de redação e NÃO pode sumir na métrica.
  describe('separa acento, caixa, espaço e troca de palavra', () => {
    const casos: Array<[string, string, string, 'formatacao' | 'acento' | 'conteudo', boolean]> = [
      ['caixa', 'Almoço executivo', 'ALMOÇO EXECUTIVO', 'formatacao', true],
      ['espaço e separador', 'Seg a sex · 11h às 15h', 'Seg a sex  |  11h às 15h', 'formatacao', true],
      ['espaço do R$', 'R$ 49,90', 'R$49,90', 'formatacao', true],
      ['acento corrigido', 'Almoco em familia', 'Almoço em família', 'acento', false],
      ['cedilha corrigida', 'Comeca a semana bem', 'Começa a semana bem', 'acento', false],
      ['acento E caixa ao mesmo tempo', 'almoco executivo', 'ALMOÇO EXECUTIVO', 'acento', false],
      ['palavra trocada', 'Almoço executivo', 'Almoço em família', 'conteudo', false],
      ['acento errado posto', 'Voce merece', 'Vocé merece', 'acento', false],
      ['mesmo acento em outra forma Unicode (NFC × NFD) é formatação, não correção', 'Caf\u00e9 da manh\u00e3', 'Cafe\u0301 da manha\u0303', 'formatacao', true],
      ['NFD com caixa trocada continua formatação', 'Caf\u00e9', 'CAFE\u0301', 'formatacao', true],
    ]
    for (const [nome, antes, depois, esperado, formatacao] of casos) {
      it(nome, () => {
        const d = diffDeCopy({ t: antes }, { t: depois })
        expect(d.mudou).toBe(true)
        expect(d.alterados[0].diferenca).toBe(esperado)
        expect(d.alterados[0].apenasFormatacao).toBe(formatacao)
      })
    }
  })

  it('ignora as chaves reservadas do slotValues', () => {
    const d = diffDeCopy(
      { titulo: 'A', _driveImageId: 'abc' },
      { titulo: 'A', _imageUrl: 'https://x/y.jpg' },
    )
    expect(d.mudou).toBe(false)
    expect(d.totalSugerido).toBe(1)
  })

  it('copy inteiramente substituída não é "editada", é "trocada"', () => {
    const d = diffDeCopy({ a: 'Peixe fresco todo dia' }, { b: 'Rodízio de carnes' })
    expect(d.iguais).toHaveLength(0)
    expect(d.alterados).toHaveLength(0)
    expect(desfechoPeloDiff(d)).toBe('trocada')
  })
})

describe('diffDeCopy — pareamento por conteúdo (extractExpectedTexts não tem chave)', () => {
  it('casa o que é idêntico e pareia o parecido', () => {
    const d = diffDeCopy(
      ['HAPPY HOUR', 'Todas as quintas', 'A partir das 18h'],
      { t1: 'HAPPY HOUR', t2: 'Todas as quintas e sextas', t3: 'A partir das 18h' },
    )
    expect(d.iguais.sort()).toEqual(['A partir das 18h', 'HAPPY HOUR'])
    expect(d.alterados).toHaveLength(1)
    expect(d.alterados[0]).toMatchObject({
      campo: null,
      antes: 'Todas as quintas',
      depois: 'Todas as quintas e sextas',
    })
    expect(d.adicionados).toHaveLength(0)
    expect(d.removidos).toHaveLength(0)
  })

  it('texto sem nenhuma semelhança vira removido + adicionado, não "alterado"', () => {
    const d = diffDeCopy(['Chopp em dobro'], ['Sobremesa por nossa conta'])
    expect(d.alterados).toHaveLength(0)
    expect(d.removidos).toEqual([{ campo: null, texto: 'Chopp em dobro' }])
    expect(d.adicionados).toEqual([{ campo: null, texto: 'Sobremesa por nossa conta' }])
  })

  it('texto repetido não é consumido duas vezes pelo mesmo par', () => {
    const d = diffDeCopy(['Igual', 'Igual'], ['Igual'])
    expect(d.iguais).toEqual(['Igual'])
    expect(d.removidos).toEqual([{ campo: null, texto: 'Igual' }])
  })
})

describe('diffDeCopy — o lado ilegível', () => {
  // O defeito que este módulo existe para evitar: página que ninguém consegue
  // ler NÃO pode virar "o usuário não editou nada".
  it('lado final ilegível: mudou=false MAS ilegivel=true e sem veredito', () => {
    const d = diffDeCopy(SUGERIDA, copyDeCamadas('isto não é json'))
    expect(d.ilegivel).toBe(true)
    expect(d.mudou).toBe(false)
    expect(desfechoPeloDiff(d)).toBeNull()
  })

  it('sem copy sugerida também é ilegível — não há o que comparar', () => {
    expect(diffDeCopy(null, { titulo: 'A' }).ilegivel).toBe(true)
    expect(desfechoPeloDiff(diffDeCopy(undefined, { titulo: 'A' }))).toBeNull()
  })
})

describe('copyDeCamadas', () => {
  const camadas = [
    { id: 'l1', name: 'titulo', type: 'text', content: 'HAPPY HOUR' },
    { id: 'l2', name: 'foto', type: 'image', fileUrl: 'https://x/y.jpg' },
  ]

  it('lê a página dupla-codificada — o caso que produziria o diff falso', () => {
    const duplo = JSON.stringify(JSON.stringify(camadas))
    expect(copyDeCamadas(duplo)).toEqual({ titulo: 'HAPPY HOUR' })

    // E o diff completo, ponta a ponta: a edição APARECE em vez de sumir.
    const d = diffDeCopy({ titulo: 'HAPPY HOUR DOBRADO' }, copyDeCamadas(duplo))
    expect(d.ilegivel).toBe(false)
    expect(d.mudou).toBe(true)
    expect(d.alterados[0].depois).toBe('HAPPY HOUR')
  })

  it('null no ilegível, {} na página sem texto', () => {
    expect(copyDeCamadas('quebrado')).toBeNull()
    expect(copyDeCamadas([{ id: 'l2', type: 'image' }])).toEqual({})
  })
})

describe('copyParaDecisao — a camada escondida pelo REVISOR conta; a escondida pela pessoa não (REV-9E-01)', () => {
  const marca = { em: '2026-09-12T10:00:00.000Z', ajuste: 0 }
  const camadas = [
    { id: 'headline', name: 'headline', type: 'text', content: 'Título' },
    { id: 'cta', name: 'cta', type: 'text', content: 'Vem pra cá', visible: false, metadata: { revisao: { ocultaPeloRevisor: marca } } },
    { id: 'pre', name: 'pre', type: 'text', content: 'Pré', visible: false },
  ]
  it('o render/cópia do post (copyDeCamadas) segue a arte; o aprendizado (copyParaDecisao) vê o CTA escondido pelo revisor e não vê o pré escondido pela pessoa', () => {
    expect(copyDeCamadas(camadas)).toEqual({ headline: 'Título' })
    expect(copyParaDecisao(camadas)).toEqual({ headline: 'Título', cta: 'Vem pra cá' })
    // o diff contra a proposta: esconder pelo revisor não é remoção; esconder pela pessoa é
    const proposta = { headline: 'Título', cta: 'Vem pra cá', pre: 'Pré' }
    const d = diffDeCopy(proposta, copyParaDecisao(camadas))
    expect(d.removidos.map((r) => r.texto)).toEqual(['Pré'])
    expect(desfechoPeloDiff(diffDeCopy({ headline: 'Título', cta: 'Vem pra cá' }, copyParaDecisao(camadas)))).toBe('aceita-como-veio')
  })
  it('ilegível continua null; string dupla-codificada é lida', () => {
    expect(copyParaDecisao('isto não é json')).toBeNull()
    expect(copyParaDecisao(JSON.stringify(JSON.stringify(camadas)))).toEqual({ headline: 'Título', cta: 'Vem pra cá' })
  })
})

describe('semelhanca', () => {
  it('1 para textos que só diferem em caixa/acento', () => {
    expect(semelhanca('Happy Hour', 'HAPPY HOUR')).toBe(1)
    expect(semelhanca('Almoço', 'ALMOCO')).toBe(1)
  })

  it('alta para edição pequena, baixa para texto trocado', () => {
    expect(semelhanca('Todas as quintas', 'Todas as quintas e sextas')).toBeGreaterThan(0.6)
    expect(semelhanca('Chopp em dobro', 'Sobremesa por nossa conta')).toBeLessThan(0.3)
  })
})

/**
 * FALSE_LEARNING_DIFF (caracterizado no B1d): a proposta guardada pelo layerId
 * contra a página lida por nome. A tradução é pela IDENTIDADE da camada — o
 * diff continua pareando por chave, então troca entre campos segue sendo
 * edição (achado HIGH do Codex sobre a primeira tentativa, que pareava as
 * sobras por conteúdo).
 */
describe('alinharChavesDaProposta — layerId da proposta × nome da página', () => {
  const camadas = [
    { id: 'l1', name: 'Título', type: 'text', content: 'Noite do vinho', visible: true },
    { id: 'l2', name: 'Título', type: 'text', content: 'Toda quinta', visible: true },
    { id: 'l3', name: 'CTA', type: 'text', content: 'Reserve', visible: true },
  ]

  it('mesmo texto pelo layerId: não mudou (inclusive no nome repetido, #2)', () => {
    const proposta = alinharChavesDaProposta({ l1: 'Noite do vinho', l2: 'Toda quinta', l3: 'Reserve' }, camadas)
    expect(proposta).toEqual({ Título: 'Noite do vinho', 'Título#2': 'Toda quinta', CTA: 'Reserve' })
    expect(diffDeCopy(proposta, copyParaDecisao(camadas)).mudou).toBe(false)
  })

  it('texto editado pelo layerId: alterado no campo certo, editada', () => {
    const d = diffDeCopy(alinharChavesDaProposta({ l3: 'Reserve já' }, camadas), { CTA: 'Reserve' })
    expect(d.alterados.map((a) => a.campo)).toEqual(['CTA'])
    expect(desfechoPeloDiff(d)).toBe('editada')
  })

  it('troca de texto entre campos continua sendo mudança', () => {
    const trocada = [
      { id: 'l1', name: 'Título', type: 'text', content: 'Reserve', visible: true },
      { id: 'l3', name: 'CTA', type: 'text', content: 'Noite do vinho', visible: true },
    ]
    const d = diffDeCopy(alinharChavesDaProposta({ l1: 'Noite do vinho', l3: 'Reserve' }, trocada), copyParaDecisao(trocada))
    expect(d.mudou).toBe(true)
    expect(d.iguais).toEqual([])
  })

  it('camada apagada e outra criada com texto parecido segue trocada, não editada', () => {
    const nova = [{ id: 'l9', name: 'Chamada', type: 'text', content: 'Hoje tem jantar executivo', visible: true }]
    const d = diffDeCopy(alinharChavesDaProposta({ l1: 'Hoje tem almoço executivo' }, nova), copyParaDecisao(nova))
    expect(desfechoPeloDiff(d)).toBe('trocada')
  })

  it('chave por nome, chave desconhecida e página ilegível ficam como vieram', () => {
    // Por nome, "Título" atinge as duas camadas de mesmo nome — como no bake.
    expect(alinharChavesDaProposta({ Título: 'x', outra: 'y' }, camadas)).toEqual({ Título: 'x', 'Título#2': 'x', outra: 'y' })
    expect(alinharChavesDaProposta({ l1: 'x' }, 'lixo{')).toEqual({ l1: 'x' })
    expect(alinharChavesDaProposta(null, camadas)).toBeNull()
  })

  it('mesma camada por nome e por id: vale o id, como no bake', () => {
    expect(alinharChavesDaProposta({ CTA: 'Reserve', l3: 'Outro' }, camadas)).toEqual({ CTA: 'Outro' })
  })

  it('id de uma camada que é nome de outra não vira aceite nem edição falsa (Codex, rodada 3): fica sem diff', () => {
    const dupla = [
      { id: 'a', name: 'cta', type: 'text', content: 'Reserve', visible: true },
      { id: 'cta', name: 'headline', type: 'text', content: 'Reserve', visible: true },
    ]
    expect(alinharChavesDaProposta({ cta: 'Reserve' }, dupla)).toBeNull()
  })

  it('nome repetido: a chave por nome preencheu as duas camadas (Título e Título#2)', () => {
    const repetido = [
      { id: 'x1', name: 'Título', type: 'text', content: 'Noite', visible: true },
      { id: 'x2', name: 'Título', type: 'text', content: 'Noite', visible: true },
    ]
    expect(diffDeCopy(alinharChavesDaProposta({ Título: 'Noite' }, repetido), copyParaDecisao(repetido)).mudou).toBe(false)
  })

  it('proposta já no formato da página (com #2) segue pareada pela chave da página', () => {
    expect(alinharChavesDaProposta({ Título: 'Noite do vinho', 'Título#2': 'Toda quinta' }, camadas)).toEqual({
      Título: 'Noite do vinho',
      'Título#2': 'Toda quinta',
    })
  })

  it('chave que é id de uma camada E nome de outra: ambígua, sem diff (Codex, rodadas 2 e 4)', () => {
    const colisao = [
      { id: 'cta', name: 'headline', type: 'text', content: 'B', visible: true },
      { id: 'b', name: 'cta', type: 'text', content: 'B', visible: true },
    ]
    // Proposta pela página {headline:'A', cta:'B'} com headline editado para B, ou pelo pedido com id:
    // não dá para saber qual — nem aceite falso, nem edição falsa.
    expect(alinharChavesDaProposta({ headline: 'A', cta: 'B' }, colisao)).toBeNull()
    expect(alinharChavesDaProposta({ cta: 'B' }, colisao)).toBeNull()
    // Sem a chave ambígua, segue normal.
    expect(alinharChavesDaProposta({ headline: 'A' }, colisao)).toEqual({ headline: 'A' })
  })

  it('camada vazia ou oculta pela pessoa: o texto proposto conta como removido', () => {
    const oculta = [{ id: 'l1', name: 'Título', type: 'text', content: 'Noite do vinho', visible: false }]
    const d = diffDeCopy(alinharChavesDaProposta({ l1: 'Noite do vinho' }, oculta), copyParaDecisao(oculta) ?? {})
    expect(d.removidos.map((r) => r.texto)).toEqual(['Noite do vinho'])
  })
})

describe('alinharChavesDaProposta — cada lado com as SUAS camadas', () => {
  it('o vídeo alinha a proposta às camadas gravadas no MP4, não à página de agora (Codex, rodada 2)', async () => {
    const { readFileSync } = await import('node:fs')
    const fonte = readFileSync(`${process.cwd()}/src/lib/video/process-video-job.ts`, 'utf8')
    expect(fonte).toMatch(/alinharChavesDaProposta\(r\.copyPropostaTexto, camadasGravadas\)/)
    expect(fonte).toMatch(/copyParaDecisao\(designData\?\.layers \?\? null\), designData\?\.layers \?\? null/)
  })
})
